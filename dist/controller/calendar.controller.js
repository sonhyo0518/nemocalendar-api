"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteEvent = exports.updateEvent = exports.createEvent = exports.getEvents = exports.getCalendars = void 0;
const googleapis_1 = require("googleapis");
const prisma_1 = require("../lib/prisma");
const colors_1 = require("../constants/colors");
const date_key_1 = require("../utils/date-key");
const google_refresh_1 = require("../lib/google-refresh");
const calendar_cache_1 = require("../lib/calendar-cache");
const google_oauth_1 = require("../lib/google-oauth");
async function getGoogleRefreshToken(userIdx, stored) {
    return (0, google_refresh_1.resolveGoogleRefreshToken)(userIdx, stored);
}
async function listEventsInRange(calendar, calendarId, timeMin, timeMax) {
    const items = [];
    let pageToken;
    do {
        const result = await calendar.events.list({
            calendarId,
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: "startTime",
            maxResults: 250,
            pageToken,
        });
        items.push(...(result.data.items ?? []));
        pageToken = result.data.nextPageToken ?? undefined;
    } while (pageToken);
    return items;
}
function parseRangeQuery(fromRaw, toRaw) {
    const from = typeof fromRaw === "string" && (0, date_key_1.isDateKey)(fromRaw) ? fromRaw : null;
    const to = typeof toRaw === "string" && (0, date_key_1.isDateKey)(toRaw) ? toRaw : null;
    if (!from || !to || to < from)
        return null;
    return {
        from,
        to,
        timeMin: new Date(`${from}T00:00:00+09:00`),
        timeMax: new Date(`${to}T23:59:59+09:00`),
    };
}
/** yyyy-mm-dd 에 dayDelta일을 더함 (로컬 자정 기준) */
function shiftDateKey(key, dayDelta) {
    const [y, m, d] = key.split('-').map(Number);
    const dt = new Date(y, m - 1, d + dayDelta);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}
// 이벤트 시간
function toTime(value) {
    if (!value || value.length <= 10)
        return undefined;
    // dateTime → HH:mm (KST)
    const d = new Date(value);
    if (Number.isNaN(d.getTime()))
        return undefined;
    return d.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Seoul',
    });
}
/** HH:mm + minutes → { dateKey, time: HH:mm } (자정 넘김 처리) */
function addMinutesToHhMm(dateKey, timeHhMm, minutes) {
    const [h, m] = timeHhMm.split(':').map(Number);
    const total = h * 60 + m + minutes;
    const dayOffset = Math.floor(total / (24 * 60));
    const rem = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
    const hh = String(Math.floor(rem / 60)).padStart(2, '0');
    const mm = String(rem % 60).padStart(2, '0');
    return {
        dateKey: dayOffset === 0 ? dateKey : shiftDateKey(dateKey, dayOffset),
        time: `${hh}:${mm}`,
    };
}
function toKstDateTime(dateKey, timeHhMm) {
    return `${dateKey}T${timeHhMm}:00+09:00`;
}
function normalizeInclusiveEnd(date, endDate) {
    if (!endDate || endDate < date)
        return date;
    return endDate;
}
const VALID_CATEGORIES = ['work', 'personal', 'study', 'health', 'etc'];
// 이벤트 카테고리 정규화
function normalizeCategory(value) {
    if (typeof value !== 'string')
        return 'etc';
    return VALID_CATEGORIES.includes(value) ? value : 'etc';
}
function buildGoogleEventBody(input) {
    const { title, date, time, endTime } = input;
    const endInclusive = normalizeInclusiveEnd(date, input.endDate);
    const extendedProperties = {
        private: {
            appCategory: normalizeCategory(input.category),
        },
    };
    if (!time) {
        return {
            summary: title,
            start: { date, dateTime: null },
            end: { date: shiftDateKey(endInclusive, 1), dateTime: null },
            extendedProperties,
        };
    }
    let end = endTime
        ? { dateKey: endInclusive, time: endTime }
        : endInclusive === date
            ? addMinutesToHhMm(date, time, 30)
            : { dateKey: endInclusive, time };
    const startIso = toKstDateTime(date, time);
    let endIso = toKstDateTime(end.dateKey, end.time);
    if (endIso <= startIso) {
        end = addMinutesToHhMm(date, time, 30);
        endIso = toKstDateTime(end.dateKey, end.time);
    }
    return {
        summary: title,
        start: { dateTime: startIso, date: null },
        end: { dateTime: endIso, date: null },
        extendedProperties,
    };
}
function toCalendarEventResponse(input) {
    const googleEventId = input.item.id;
    if (!googleEventId)
        return null;
    const startRaw = input.item.start?.dateTime || input.item.start?.date || null;
    const endRaw = input.item.end?.dateTime || input.item.end?.date || null;
    const dateKey = (0, date_key_1.extractDateKey)(startRaw);
    if (!dateKey)
        return null;
    const allDay = Boolean(input.item.start?.date && !input.item.start?.dateTime);
    let endDate = (0, date_key_1.extractDateKey)(endRaw) ?? dateKey;
    if (allDay && endRaw) {
        const exclusiveEnd = (0, date_key_1.extractDateKey)(endRaw);
        endDate = exclusiveEnd
            ? shiftDateKey(exclusiveEnd, -1)
            : dateKey;
        if (endDate < dateKey)
            endDate = dateKey;
    }
    return {
        id: `${input.calendarId}:${googleEventId}`,
        googleEventId,
        title: input.item.summary || '(제목 없음)',
        date: dateKey,
        endDate,
        allDay,
        time: allDay ? undefined : toTime(input.item.start?.dateTime || null),
        endTime: allDay ? undefined : toTime(input.item.end?.dateTime || null),
        calendarId: input.calendarId,
        calendarName: input.calendarName,
        calendarColor: input.calendarColor,
        category: normalizeCategory(input.item.extendedProperties?.private?.appCategory),
        fromGoogle: true,
    };
}
function getErrorMessage(error) {
    if (error instanceof Error)
        return error.message;
    return String(error);
}
function isInvalidGrant(error) {
    const msg = getErrorMessage(error).toLowerCase();
    if (msg.includes('invalid_grant') || msg.includes('expired or revoked')) {
        return true;
    }
    if (typeof error === 'object' && error !== null && 'response' in error) {
        const data = error
            .response?.data;
        if (data?.error === 'invalid_grant')
            return true;
    }
    return false;
}
function needsCalendarConsent(error) {
    const msg = getErrorMessage(error).toLowerCase();
    return (isInvalidGrant(error) ||
        msg.includes('insufficient authentication scopes') ||
        msg.includes('insufficientpermissions') ||
        msg.includes('access token scope'));
}
async function clearGoogleRefreshToken(userIdx) {
    await prisma_1.prisma.users.update({
        where: { idx: BigInt(userIdx) },
        data: { google_refresh_token: null, updated_at: new Date() },
    });
    (0, calendar_cache_1.invalidateCalCache)(userIdx);
}
/** Google Calendar consent/invalid_grant 처리. 응답을 보냈으면 true */
async function handleGoogleCalendarError(error, req, res) {
    if (!needsCalendarConsent(error) || !req.userIdx)
        return false;
    if (isInvalidGrant(error)) {
        await clearGoogleRefreshToken(req.userIdx);
    }
    res.status(403).json({
        error: 'Calendar permission required',
        code: 'NEEDS_CALENDAR_CONSENT',
    });
    return true;
}
async function fetchGoogleCalendarList(refreshToken) {
    const oauthClient = (0, google_oauth_1.createOAuthClient)(refreshToken);
    const calendar = googleapis_1.google.calendar({ version: 'v3', auth: oauthClient });
    const result = await calendar.calendarList.list({ minAccessRole: 'reader' });
    const items = (result.data.items ?? []).filter((c) => c.id && c.accessRole !== 'freeBusyReader');
    return { calendar, items };
}
function toCalendarOptions(items) {
    return items
        .filter((c) => c.id && c.accessRole !== 'freeBusyReader')
        .map((c) => ({
        id: c.id,
        summary: c.summaryOverride || c.summary || c.id,
        backgroundColor: c.backgroundColor ?? colors_1.DEFAULT_BANNER_COLOR,
        foregroundColor: c.foregroundColor ?? '#000000',
        primary: Boolean(c.primary),
        selected: c.selected !== false,
    }))
        .sort((a, b) => Number(b.primary) - Number(a.primary));
}
// Google 캘린더 목록 = 앱 카테고리
const getCalendars = async (req, res) => {
    try {
        if (!req.userIdx) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const user = await prisma_1.prisma.users.findUnique({
            where: { idx: BigInt(req.userIdx) },
        });
        const rt = await getGoogleRefreshToken(BigInt(req.userIdx), user?.google_refresh_token);
        if (!rt) {
            res.status(403).json({
                error: 'Calendar permission required',
                code: 'NEEDS_CALENDAR_CONSENT',
            });
            return;
        }
        const { items } = await fetchGoogleCalendarList(rt);
        res.status(200).json({ calendars: toCalendarOptions(items) });
    }
    catch (error) {
        console.error('[getCalendars]', error);
        if (await handleGoogleCalendarError(error, req, res))
            return;
        res.status(500).json({ error: 'Failed to fetch calendars' });
    }
};
exports.getCalendars = getCalendars;
// 이벤트 조회
const getEvents = async (req, res) => {
    try {
        if (!req.userIdx) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const user = await prisma_1.prisma.users.findUnique({
            where: { idx: BigInt(req.userIdx) },
        });
        const rt = await getGoogleRefreshToken(BigInt(req.userIdx), user?.google_refresh_token);
        if (!rt) {
            res.status(403).json({
                error: 'Calendar permission required',
                code: 'NEEDS_CALENDAR_CONSENT',
            });
            return;
        }
        const range = parseRangeQuery(req.query.from, req.query.to);
        if (!range) {
            res.status(400).json({ error: "from and to (yyyy-mm-dd) required" });
            return;
        }
        const userIdx = String(req.userIdx);
        const cached = (0, calendar_cache_1.readCalCache)(userIdx, range.from, range.to);
        if (cached) {
            res.status(200).json({
                events: cached.events,
                calendars: cached.calendars,
            });
            return;
        }
        const { calendar, items } = await fetchGoogleCalendarList(rt);
        const calendars = items.filter((c) => c.id && c.selected !== false && c.accessRole !== "freeBusyReader");
        const nested = await Promise.all(calendars.map(async (cal) => {
            const googleItems = await listEventsInRange(calendar, cal.id, range.timeMin.toISOString(), range.timeMax.toISOString());
            return googleItems
                .map((item) => toCalendarEventResponse({
                calendarId: cal.id,
                calendarName: cal.summaryOverride || cal.summary || cal.id,
                calendarColor: cal.backgroundColor ?? colors_1.DEFAULT_BANNER_COLOR,
                item,
            }))
                .filter(Boolean);
        }));
        const events = nested.flat();
        const calendarOptions = toCalendarOptions(items);
        (0, calendar_cache_1.writeCalCache)(userIdx, range.from, range.to, events, calendarOptions);
        res.status(200).json({
            events,
            calendars: calendarOptions,
        });
    }
    catch (error) {
        console.error('[getEvents]', error);
        if (await handleGoogleCalendarError(error, req, res))
            return;
        res.status(500).json({ error: 'Failed to fetch calendar events' });
    }
};
exports.getEvents = getEvents;
// 이벤트 생성
const createEvent = async (req, res) => {
    try {
        if (!req.userIdx) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { title, date, endDate, time, endTime, calendarId, category } = req.body;
        if (!title || !date) {
            res.status(400).json({ error: 'title and date are required' });
            return;
        }
        const targetCalendarId = calendarId?.trim() || 'primary';
        const user = await prisma_1.prisma.users.findUnique({
            where: { idx: BigInt(req.userIdx) },
        });
        const rt = await getGoogleRefreshToken(BigInt(req.userIdx), user?.google_refresh_token);
        if (!rt) {
            res.status(400).json({
                error: 'Google calendar not connected. Please log in again.',
            });
            return;
        }
        const oauthClient = (0, google_oauth_1.createOAuthClient)(rt);
        const calendar = googleapis_1.google.calendar({ version: 'v3', auth: oauthClient });
        const requestBody = buildGoogleEventBody({
            title,
            date,
            endDate,
            time,
            endTime,
            category,
        });
        const created = await calendar.events.insert({
            calendarId: targetCalendarId,
            requestBody,
        });
        // 캘린더 메타(이름/색) 조회
        let calendarName = targetCalendarId;
        let calendarColor = colors_1.DEFAULT_BANNER_COLOR;
        try {
            const meta = await calendar.calendarList.get({
                calendarId: targetCalendarId,
            });
            calendarName =
                meta.data.summaryOverride || meta.data.summary || targetCalendarId;
            calendarColor = meta.data.backgroundColor ?? calendarColor;
        }
        catch { }
        const item = created.data;
        const event = toCalendarEventResponse({
            calendarId: targetCalendarId,
            calendarName,
            calendarColor,
            item,
        });
        if (!event) {
            res.status(500).json({ error: 'Failed to parse created event date' });
            return;
        }
        (0, calendar_cache_1.invalidateCalCache)(String(req.userIdx));
        res.status(201).json({ event });
    }
    catch (error) {
        console.error('Create Calendar Event Error:', error);
        if (await handleGoogleCalendarError(error, req, res))
            return;
        res.status(500).json({ error: 'Failed to create calendar event' });
    }
};
exports.createEvent = createEvent;
const updateEvent = async (req, res) => {
    try {
        if (!req.userIdx) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { title, date, endDate, time, endTime, calendarId, destinationCalendarId, googleEventId, category, } = req.body;
        if (!title || !date || !calendarId || !googleEventId) {
            res.status(400).json({
                error: 'title, date, calendarId and googleEventId are required',
            });
            return;
        }
        const user = await prisma_1.prisma.users.findUnique({
            where: { idx: BigInt(req.userIdx) },
        });
        const rt = await getGoogleRefreshToken(BigInt(req.userIdx), user?.google_refresh_token);
        if (!rt) {
            res.status(400).json({
                error: 'Google calendar not connected. Please log in again.',
            });
            return;
        }
        const oauthClient = (0, google_oauth_1.createOAuthClient)(rt);
        const calendar = googleapis_1.google.calendar({ version: 'v3', auth: oauthClient });
        let targetCalendarId = calendarId;
        if (destinationCalendarId &&
            destinationCalendarId !== calendarId) {
            await calendar.events.move({
                calendarId,
                eventId: googleEventId,
                destination: destinationCalendarId,
            });
            targetCalendarId = destinationCalendarId;
        }
        const requestBody = buildGoogleEventBody({
            title,
            date,
            endDate,
            time,
            endTime,
            category,
        });
        const patched = await calendar.events.patch({
            calendarId: targetCalendarId,
            eventId: googleEventId,
            requestBody,
        });
        let calendarName = calendarId;
        let calendarColor = colors_1.DEFAULT_BANNER_COLOR;
        try {
            const meta = await calendar.calendarList.get({
                calendarId: targetCalendarId,
            });
            calendarName =
                meta.data.summaryOverride ||
                    meta.data.summary ||
                    targetCalendarId;
            calendarColor = meta.data.backgroundColor ?? calendarColor;
        }
        catch { }
        const item = patched.data;
        const event = toCalendarEventResponse({
            calendarId: targetCalendarId,
            calendarName,
            calendarColor,
            item,
        });
        if (!event) {
            res.status(500).json({ error: 'Failed to parse updated event date' });
            return;
        }
        (0, calendar_cache_1.invalidateCalCache)(String(req.userIdx));
        res.status(200).json({ event });
    }
    catch (error) {
        console.error('Update Calendar Event Error:', error);
        if (await handleGoogleCalendarError(error, req, res))
            return;
        res.status(500).json({ error: 'Failed to update calendar event' });
    }
};
exports.updateEvent = updateEvent;
const deleteEvent = async (req, res) => {
    try {
        if (!req.userIdx) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { calendarId, googleEventId } = req.body;
        if (!calendarId || !googleEventId) {
            res.status(400).json({ error: 'calendarId and googleEventId are required' });
            return;
        }
        const user = await prisma_1.prisma.users.findUnique({
            where: { idx: BigInt(req.userIdx) },
        });
        const rt = await getGoogleRefreshToken(BigInt(req.userIdx), user?.google_refresh_token);
        if (!rt) {
            res.status(400).json({
                error: 'Google calendar not connected. Please log in again.',
            });
            return;
        }
        const oauthClient = (0, google_oauth_1.createOAuthClient)(rt);
        const calendar = googleapis_1.google.calendar({ version: 'v3', auth: oauthClient });
        await calendar.events.delete({
            calendarId,
            eventId: googleEventId,
        });
        (0, calendar_cache_1.invalidateCalCache)(String(req.userIdx));
        res.status(204).send();
    }
    catch (error) {
        console.error('Delete Calendar Event Error:', error);
        if (await handleGoogleCalendarError(error, req, res))
            return;
        res.status(500).json({ error: 'Failed to delete calendar event' });
    }
};
exports.deleteEvent = deleteEvent;
