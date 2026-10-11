import { Response } from 'express';
import { google } from 'googleapis';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { DEFAULT_BANNER_COLOR } from '../constants/colors';
import { resolveGoogleRefreshToken } from '../lib/google-refresh';
import {
  invalidateCalCache,
  readCalCache,
  writeCalCache,
} from '../lib/calendar-cache';
import { createOAuthClient } from '../lib/google-oauth';
import {
  MAX_EVENT_RANGE_DAYS,
  buildGoogleEventBody,
  fetchGoogleCalendarList,
  handleGoogleCalendarError,
  listEventsInRange,
  parseRangeQuery,
  toCalendarEventResponse,
  toCalendarOptions,
} from '../lib/calendar-event-helpers';

async function getGoogleRefreshToken(
  userIdx: bigint,
  stored: string | null | undefined,
): Promise<string | null> {
  return resolveGoogleRefreshToken(userIdx, stored);
}

// Google 캘린더 목록 = 앱 카테고리
export const getCalendars = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.userIdx) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await prisma.users.findUnique({
      where: { idx: BigInt(req.userIdx) },
    });

    const rt = await getGoogleRefreshToken(
      BigInt(req.userIdx),
      user?.google_refresh_token,
    );
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
  res: Response,
): Promise<void> => {
  try {
    if (!req.userIdx) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await prisma.users.findUnique({
      where: { idx: BigInt(req.userIdx) },
    });

    const rt = await getGoogleRefreshToken(
      BigInt(req.userIdx),
      user?.google_refresh_token,
    );
    if (!rt) {
      res.status(403).json({
        error: 'Calendar permission required',
        code: 'NEEDS_CALENDAR_CONSENT',
      });
      return;
    }

    const range = parseRangeQuery(req.query.from, req.query.to);
    if (!range) {
      res.status(400).json({
        error: `from and to (yyyy-mm-dd) required; max range ${MAX_EVENT_RANGE_DAYS} days`,
      });
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
      (c) => c.id && c.selected !== false && c.accessRole !== 'freeBusyReader',
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
export const createEvent = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.userIdx) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { title, date, endDate, time, endTime, calendarId, category } =
      req.body as {
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

    const rt = await getGoogleRefreshToken(
      BigInt(req.userIdx),
      user?.google_refresh_token,
    );
    if (!rt) {
      res.status(403).json({
        error: 'Calendar permission required',
        code: 'NEEDS_CALENDAR_CONSENT',
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
    // 메타는 프론트 캘린더 캐시에서 보강 (calendarList.get 생략)
    const calendarName = targetCalendarId;
    const calendarColor = DEFAULT_BANNER_COLOR;
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

export const updateEvent = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
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

    const rt = await getGoogleRefreshToken(
      BigInt(req.userIdx),
      user?.google_refresh_token,
    );
    if (!rt) {
      res.status(403).json({
        error: 'Calendar permission required',
        code: 'NEEDS_CALENDAR_CONSENT',
      });
      return;
    }

    const oauthClient = createOAuthClient(rt);
    const calendar = google.calendar({ version: 'v3', auth: oauthClient });

    let targetCalendarId = calendarId;
    if (destinationCalendarId && destinationCalendarId !== calendarId) {
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

    const calendarName = targetCalendarId;
    const calendarColor = DEFAULT_BANNER_COLOR;

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

export const deleteEvent = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
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
      res
        .status(400)
        .json({ error: 'calendarId and googleEventId are required' });
      return;
    }

    const user = await prisma.users.findUnique({
      where: { idx: BigInt(req.userIdx) },
    });

    const rt = await getGoogleRefreshToken(
      BigInt(req.userIdx),
      user?.google_refresh_token,
    );
    if (!rt) {
      res.status(403).json({
        error: 'Calendar permission required',
        code: 'NEEDS_CALENDAR_CONSENT',
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
