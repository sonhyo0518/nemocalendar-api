import 'dotenv/config';
import { Request, Response } from 'express';
import { google } from 'googleapis';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { DEFAULT_BANNER_COLOR } from '../constants/colors';
import { extractDateKey, isDateKey } from '../utils/date-key';
import { decryptSecret } from '../lib/token-crypto';
import {
  invalidateCalCache,
  readCalCache,
  writeCalCache,
} from '../lib/calendar-cache';
import { createOAuthClient } from '../lib/google-oauth';

function getGoogleRefreshToken(stored: string | null | undefined): string | null {
  return decryptSecret(stored);
}

async function listEventsInRange(
  calendar: ReturnType<typeof google.calendar>,
  calendarId: string,
  timeMin: string,
  timeMax: string,
) {
  const items: any[] = [];

  let pageToken: string | undefined;
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


function parseRangeQuery(fromRaw: unknown, toRaw: unknown) {
  const from = typeof fromRaw === "string" && isDateKey(fromRaw) ? fromRaw : null;
  const to = typeof toRaw === "string" && isDateKey(toRaw) ? toRaw : null;
  if (!from || !to || to < from) return null;
  return {
    from,
    to,
    timeMin: new Date(`${from}T00:00:00+09:00`),
    timeMax: new Date(`${to}T23:59:59+09:00`),
  };
}

/** yyyy-mm-dd 에 dayDelta일을 더함 (로컬 자정 기준) */
function shiftDateKey(key: string, dayDelta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + dayDelta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// 이벤트 시간
function toTime(value?: string | null): string | undefined {
  if (!value || value.length <= 10) return undefined;
  // dateTime → HH:mm (KST)
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  });
}

/** HH:mm + minutes → { dateKey, time: HH:mm } (자정 넘김 처리) */
function addMinutesToHhMm(
  dateKey: string,
  timeHhMm: string,
  minutes: number,
): { dateKey: string; time: string } {
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

function toKstDateTime(dateKey: string, timeHhMm: string): string {
  return `${dateKey}T${timeHhMm}:00+09:00`;
}

function normalizeInclusiveEnd(date: string, endDate?: string): string {
  if (!endDate || endDate < date) return date;
  return endDate;
}


// 이벤트 카테고리
type EventCategory = 'work' | 'personal' | 'study' | 'health' | 'etc';

const VALID_CATEGORIES: EventCategory[] = ['work', 'personal', 'study', 'health', 'etc'];

// 이벤트 카테고리 정규화
function normalizeCategory(value: unknown): EventCategory {
  if (typeof value !== 'string') return 'etc';
  return (VALID_CATEGORIES as string[]).includes(value) ? (value as EventCategory) : 'etc';
}

function buildGoogleEventBody(input: {
  title: string;
  date: string;
  endDate?: string;
  time?: string;
  endTime?: string;
  category?: string;
}) {
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
      start: { date, dateTime: null as null },
      end: { date: shiftDateKey(endInclusive, 1), dateTime: null as null },
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
    start: { dateTime: startIso, date: null as null },
    end: { dateTime: endIso, date: null as null },
    extendedProperties,
  };
}

type GoogleEventLike = {
  id?: string | null;
  summary?: string | null;
  start?: { date?: string | null; dateTime?: string | null } | null;
  end?: { date?: string | null; dateTime?: string | null } | null;
  extendedProperties?: {
    private?: Record<string, string> | null;
  } | null;
};

function toCalendarEventResponse(input: {
  calendarId: string;
  calendarName: string;
  calendarColor: string;
  item: GoogleEventLike;
}) {
  const googleEventId = input.item.id;
  if (!googleEventId) return null;

  const startRaw = input.item.start?.dateTime || input.item.start?.date || null;
  const endRaw = input.item.end?.dateTime || input.item.end?.date || null;
  const dateKey = extractDateKey(startRaw);
  if (!dateKey) return null;
  
  const allDay = Boolean(input.item.start?.date && !input.item.start?.dateTime);
  let endDate = extractDateKey(endRaw) ?? dateKey;
  if (allDay && endRaw) {
    const exclusiveEnd = extractDateKey(endRaw);
    endDate = exclusiveEnd
      ? shiftDateKey(exclusiveEnd, -1)
      : dateKey;
    if (endDate < dateKey) endDate = dateKey;
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
    category: normalizeCategory(
      input.item.extendedProperties?.private?.appCategory,
    ),
    fromGoogle: true,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isInvalidGrant(error: unknown): boolean {
  const msg = getErrorMessage(error).toLowerCase();
  if (msg.includes('invalid_grant') || msg.includes('expired or revoked')) {
    return true;
  }
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const data = (error as { response?: { data?: { error?: string } } })
      .response?.data;
    if (data?.error === 'invalid_grant') return true;
  }
  return false;
}

function needsCalendarConsent(error: unknown): boolean {
  const msg = getErrorMessage(error).toLowerCase();
  return (
    isInvalidGrant(error) ||
    msg.includes('insufficient authentication scopes') ||
    msg.includes('insufficientpermissions') ||
    msg.includes('access token scope')
  );
}

async function clearGoogleRefreshToken(userIdx: string) {
  await prisma.users.update({
    where: { idx: BigInt(userIdx) },
    data: { google_refresh_token: null, updated_at: new Date() },
  });
  invalidateCalCache(userIdx);
}

/** Google Calendar consent/invalid_grant 처리. 응답을 보냈으면 true */
async function handleGoogleCalendarError(
  error: unknown,
  req: AuthRequest,
  res: Response,
): Promise<boolean> {
  if (!needsCalendarConsent(error) || !req.userIdx) return false;
  if (isInvalidGrant(error)) {
    await clearGoogleRefreshToken(req.userIdx);
  }
  res.status(403).json({
    error: 'Calendar permission required',
    code: 'NEEDS_CALENDAR_CONSENT',
  });
  return true;
}

async function fetchGoogleCalendarList(refreshToken: string) {
  const oauthClient = createOAuthClient(refreshToken);
  const calendar = google.calendar({ version: 'v3', auth: oauthClient });
  const result = await calendar.calendarList.list({ minAccessRole: 'reader' });
  const items = (result.data.items ?? []).filter(
    (c) => c.id && c.accessRole !== 'freeBusyReader',
  );
  return { calendar, items };
}

function toCalendarOptions(
  items: Awaited<ReturnType<typeof fetchGoogleCalendarList>>['items'],
) {
  return items
    .filter((c) => c.id && c.accessRole !== 'freeBusyReader')
    .map((c) => ({
      id: c.id as string,
      summary: c.summaryOverride || c.summary || (c.id as string),
      backgroundColor: c.backgroundColor ?? DEFAULT_BANNER_COLOR,
      foregroundColor: c.foregroundColor ?? '#000000',
      primary: Boolean(c.primary),
      selected: c.selected !== false,
    }))
    .sort((a, b) => Number(b.primary) - Number(a.primary));
}

// Google 캘린더 목록 = 앱 카테고리
export const getCalendars = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userIdx) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await prisma.users.findUnique({
      where: { idx: BigInt(req.userIdx) },
    });

    const rt = getGoogleRefreshToken(user?.google_refresh_token);
    if (!rt) {
      res.status(403).json({
        error: 'Calendar permission required',
        code: 'NEEDS_CALENDAR_CONSENT',
      });
      return;
    }

    const { items } = await fetchGoogleCalendarList(rt);
    res.status(200).json({ calendars: toCalendarOptions(items) });
  } catch (error: unknown) {
    console.error('[getCalendars]', error);
    if (await handleGoogleCalendarError(error, req, res)) return;
    res.status(500).json({ error: 'Failed to fetch calendars' });
  }
};

// 이벤트 조회
export const getEvents = async (
  req: AuthRequest,
  res: Response
  ): Promise<void> => {
  try {
    if (!req.userIdx) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await prisma.users.findUnique({
      where: { idx: BigInt(req.userIdx) },
    });

    const rt = getGoogleRefreshToken(user?.google_refresh_token); 
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
      const cached = readCalCache(userIdx, range.from, range.to);
      if (cached) {
        res.status(200).json({
          events: cached.events,
          calendars: cached.calendars,
        });
        return;
      }

      const { calendar, items } = await fetchGoogleCalendarList(rt);
      const calendars = items.filter(
        (c) => c.id && c.selected !== false && c.accessRole !== "freeBusyReader",
      );

      const nested = await Promise.all(
        calendars.map(async (cal) => {
          const googleItems = await listEventsInRange(
            calendar,
            cal.id!,
            range.timeMin.toISOString(),
            range.timeMax.toISOString(),
          );

          return googleItems
          .map((item) =>
            toCalendarEventResponse({
              calendarId: cal.id!,
              calendarName: cal.summaryOverride || cal.summary || cal.id!,
              calendarColor: cal.backgroundColor ?? DEFAULT_BANNER_COLOR,
              item,
            }),
          )
          .filter(Boolean);
        }),
      );

      const events = nested.flat();
      const calendarOptions = toCalendarOptions(items);
      writeCalCache(userIdx, range.from, range.to, events, calendarOptions);

      res.status(200).json({
        events,
        calendars: calendarOptions,
      });

    } catch (error: unknown) {
      console.error('[getEvents]', error);
      if (await handleGoogleCalendarError(error, req, res)) return;
      res.status(500).json({ error: 'Failed to fetch calendar events' });
    }
};

// 이벤트 생성
export const createEvent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userIdx) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { title, date, endDate, time, endTime, calendarId, category } = req.body as {
      title?: string;
      date?: string;
      endDate?: string;
      time?: string;
      endTime?: string;
      calendarId?: string;
      category?: string;
    };
    if (!title || !date) {
      res.status(400).json({ error: 'title and date are required' });
      return;
    }
    const targetCalendarId = calendarId?.trim() || 'primary';
    

    const user = await prisma.users.findUnique({
      where: { idx: BigInt(req.userIdx) },
    });

    const rt = getGoogleRefreshToken(user?.google_refresh_token); 
    if (!rt) {
      res.status(400).json({
        error: 'Google calendar not connected. Please log in again.',
      });
      return;
    }

    const oauthClient = createOAuthClient(rt);
    const calendar = google.calendar({ version: 'v3', auth: oauthClient });
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
    let calendarColor = DEFAULT_BANNER_COLOR;
    try {
      const meta = await calendar.calendarList.get({
        calendarId: targetCalendarId,
      });
      calendarName =
        meta.data.summaryOverride || meta.data.summary || targetCalendarId;
      calendarColor = meta.data.backgroundColor ?? calendarColor;
    } catch {}
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
    
    invalidateCalCache(String(req.userIdx));
    
    res.status(201).json({ event });
  } catch (error: unknown) {
    console.error('Create Calendar Event Error:', error);
    if (await handleGoogleCalendarError(error, req, res)) return;
    res.status(500).json({ error: 'Failed to create calendar event' });
  }
};

export const updateEvent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userIdx) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const {
      title,
      date,
      endDate,
      time,
      endTime,
      calendarId,
      destinationCalendarId,
      googleEventId,
      category,
    } = req.body as {
      title?: string;
      date?: string;
      endDate?: string;
      time?: string;
      endTime?: string;
      calendarId?: string;
      destinationCalendarId?: string;
      googleEventId?: string;
      category?: string;
    };
    if (!title || !date || !calendarId || !googleEventId) {
      res.status(400).json({
        error: 'title, date, calendarId and googleEventId are required',
      });
      return;
    }
    
    const user = await prisma.users.findUnique({
      where: { idx: BigInt(req.userIdx) },
    });
    
    const rt = getGoogleRefreshToken(user?.google_refresh_token); 
    if (!rt) {
      res.status(400).json({
        error: 'Google calendar not connected. Please log in again.',
      });
      return;
    }
    
    const oauthClient = createOAuthClient(rt);
    const calendar = google.calendar({ version: 'v3', auth: oauthClient });
    
    let targetCalendarId = calendarId;
    if (
      destinationCalendarId &&
      destinationCalendarId !== calendarId
    ) {
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
    let calendarColor = DEFAULT_BANNER_COLOR;
    try {
      const meta = await calendar.calendarList.get({
        calendarId: targetCalendarId,
      });
      calendarName =
        meta.data.summaryOverride ||
        meta.data.summary ||
        targetCalendarId;
      calendarColor = meta.data.backgroundColor ?? calendarColor;
    } catch {}

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
    
    invalidateCalCache(String(req.userIdx));
    
    res.status(200).json({ event });
  } catch (error: unknown) {
    console.error('Update Calendar Event Error:', error);
    if (await handleGoogleCalendarError(error, req, res)) return;
    res.status(500).json({ error: 'Failed to update calendar event' });
  }
};

export const deleteEvent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userIdx) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { calendarId, googleEventId } = req.body as {
      calendarId?: string;
      googleEventId?: string;
    };
    if (!calendarId || !googleEventId) {
      res.status(400).json({ error: 'calendarId and googleEventId are required' });
      return;
    }

    const user = await prisma.users.findUnique({
      where: { idx: BigInt(req.userIdx) },
    });

    const rt = getGoogleRefreshToken(user?.google_refresh_token); 
    if (!rt) {
      res.status(400).json({
        error: 'Google calendar not connected. Please log in again.',
      });
      return;
    }

    const oauthClient = createOAuthClient(rt);
    const calendar = google.calendar({ version: 'v3', auth: oauthClient });

    await calendar.events.delete({
      calendarId,
      eventId: googleEventId,
    });

    invalidateCalCache(String(req.userIdx));

    res.status(204).send();
  } catch (error: unknown) {
    console.error('Delete Calendar Event Error:', error);
    if (await handleGoogleCalendarError(error, req, res)) return;
    res.status(500).json({ error: 'Failed to delete calendar event' });
  }
};
