import { Response } from 'express';
import { google } from 'googleapis';
import { DEFAULT_BANNER_COLOR } from '../constants/colors';
import { AuthRequest } from '../middleware/auth';
import { extractDateKey, isDateKey } from '../utils/date-key';
import { invalidateCalCache } from './calendar-cache';
import { createOAuthClient } from './google-oauth';
import { prisma } from './prisma';

export async function listEventsInRange(
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
      orderBy: 'startTime',
      maxResults: 250,
      pageToken,
    });
    items.push(...(result.data.items ?? []));
    pageToken = result.data.nextPageToken ?? undefined;
  } while (pageToken);
  return items;
}

export const MAX_EVENT_RANGE_DAYS = 62;

export function parseRangeQuery(fromRaw: unknown, toRaw: unknown) {
  const from = typeof fromRaw === 'string' && isDateKey(fromRaw) ? fromRaw : null;
  const to = typeof toRaw === 'string' && isDateKey(toRaw) ? toRaw : null;
  if (!from || !to || to < from) return null;

  const fromUtc = Date.parse(`${from}T00:00:00Z`);
  const toUtc = Date.parse(`${to}T00:00:00Z`);
  const days = Math.round((toUtc - fromUtc) / 86_400_000);
  if (days > MAX_EVENT_RANGE_DAYS) return null;

  return {
    from,
    to,
    timeMin: new Date(`${from}T00:00:00+09:00`),
    timeMax: new Date(`${to}T23:59:59+09:00`),
  };
}

/** yyyy-mm-dd 에 dayDelta일을 더함 (로컬 자정 기준) */
export function shiftDateKey(key: string, dayDelta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + dayDelta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function toTime(value?: string | null): string | undefined {
  if (!value || value.length <= 10) return undefined;
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

export function buildGoogleEventBody(input: {
  title: string;
  date: string;
  endDate?: string;
  time?: string;
  endTime?: string;
}) {
  const { title, date, time, endTime } = input;
  const endInclusive = normalizeInclusiveEnd(date, input.endDate);
  if (!time) {
    return {
      summary: title,
      start: { date, dateTime: null as null },
      end: { date: shiftDateKey(endInclusive, 1), dateTime: null as null },
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

export function toCalendarEventResponse(input: {
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

  const allDay = Boolean(
    input.item.start?.date && !input.item.start?.dateTime,
  );
  let endDate = extractDateKey(endRaw) ?? dateKey;
  if (allDay && endRaw) {
    const exclusiveEnd = extractDateKey(endRaw);
    endDate = exclusiveEnd ? shiftDateKey(exclusiveEnd, -1) : dateKey;
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
    category: 'etc',
    fromGoogle: true,
  };
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function isInvalidGrant(error: unknown): boolean {
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

export function needsCalendarConsent(error: unknown): boolean {
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
export async function handleGoogleCalendarError(
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

export async function fetchGoogleCalendarList(refreshToken: string) {
  const oauthClient = createOAuthClient(refreshToken);
  const calendar = google.calendar({ version: 'v3', auth: oauthClient });
  const result = await calendar.calendarList.list({ minAccessRole: 'reader' });
  const items = (result.data.items ?? []).filter(
    (c) => c.id && c.accessRole !== 'freeBusyReader',
  );
  return { calendar, items };
}

export function toCalendarOptions(
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
