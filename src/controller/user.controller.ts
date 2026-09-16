//route에서 사용될 함수를 따로 관리 한다.
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { google } from 'googleapis';
import jwt from 'jsonwebtoken';
import { AuthRequest } from '../middleware/auth';
import { invalidateCalCache } from '../lib/calendar-cache';
import { Prisma } from '../generated/prisma/client';
import { setAuthCookies, clearAuthCookies, setAccessCookie } from '../lib/auth-cookies';
import {
  clearRefreshSession,
  hashRefreshToken,
  withinGrace,
} from '../lib/refresh-session';

import { prisma } from '../lib/prisma';
import { deleteBannerByUrl } from '../lib/r2';
import { encryptSecret } from '../lib/token-crypto';
import { resolveGoogleRefreshToken } from '../lib/google-refresh';
import { createOAuthClient } from '../lib/google-oauth';
import {
  getJwtSecret,
  signAccessToken,
  signRefreshToken,
  type JwtPayload,
} from '../lib/jwt-tokens';

async function exchangeCode(code: string) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  return { client, tokens };
}

async function hasCalendarScope(refreshToken: string): Promise<boolean> {
  const client = createOAuthClient(refreshToken);

  const { token } = await client.getAccessToken();
  if (!token) return false;

  const infoRes = await fetch('https://oauth2.googleapis.com/tokeninfo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: token }),
  });
  if (!infoRes.ok) return false;

  const info = (await infoRes.json()) as { scope?: string };
  const scopes = (info.scope ?? '').split(/\s+/);

  return (
    scopes.includes('https://www.googleapis.com/auth/calendar') ||
    scopes.includes('https://www.googleapis.com/auth/calendar.readonly') ||
    scopes.includes('https://www.googleapis.com/auth/calendar.events')
  );
}

export const getMe = async (req: AuthRequest, res: Response) => {
  const user = await prisma.users.findUnique({
    where: { idx: BigInt(req.userIdx!) },
  });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const googleRefresh = await resolveGoogleRefreshToken(
    user.idx,
    user.google_refresh_token,
  );
  const calendarConnected = Boolean(googleRefresh);

  res.json({
    user: {
      idx: user.idx.toString(),
      name: user.name || user.email?.split('@')[0] || 'User',
      email: user.email,
      profile_img_url: user.profile_img_url,
      banner_img_url: user.banner_img_url,
      theme_color: user.theme_color,
      updated_at: user.updated_at,
      calendarConnected,
      location: user.location,
    },
  });
}

export const updateUserLocation = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const location = String(req.body?.location ?? '').trim();
  if (!location) {
    res.status(400).json({ error: 'location is required' });
    return;
  }

  const user = await prisma.users.update({
    where: { idx: BigInt(req.userIdx) },
    data: { location, updated_at: new Date() },
  });

  res.json({ location: user.location });
};

//Google OAuth 로그인
export const googleLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.body; // 프론트에서 받은 Code

    if (!code) {
      res.status(400).json({ error: 'Authorization code is required' });
      return;
    }

    // 1. Code를 Google 토큰으로 교환
    const { client, tokens } = await exchangeCode(code);
    client.setCredentials(tokens);

    // 2. Google 유저 정보 받아오기
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data: googleUser } = await oauth2.userinfo.get();

    if (!googleUser.id || !googleUser.email) {
      res.status(400).json({ error: 'Failed to retrieve Google user info' });
      return;
    }

    // 3. DB 조회 및 가입/업데이트 (BigInt PK 고려)
    let user = await prisma.users.findUnique({
      where: { google_id: googleUser.id },
    });

    if (!user) {
      try {
        user = await prisma.users.create({
          data: {
            google_id: googleUser.id,
            email: googleUser.email,
            name: googleUser.name || '',
            profile_img_url: googleUser.picture || null,
            google_refresh_token: null,
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          user = await prisma.users.findUnique({
            where: { google_id: googleUser.id },
          });
          if (!user) throw err;
        } else {
          throw err;
        }
      }
    }
    
    if (user) {
      user = await prisma.users.update({
        where: { idx: user.idx },
        data: {
          name: googleUser.name || undefined,
          profile_img_url: googleUser.picture || undefined,
          updated_at: new Date(),
        },
      });
    }

    let accessToken: string;
    let refreshToken: string;
    try {
      accessToken = signAccessToken(user);
      // family를 먼저 정한 뒤 JWT·DB에 동일 값 사용
      const family = randomUUID();
      refreshToken = signRefreshToken(user, family);

      await prisma.users.update({
        where: { idx: user.idx },
        data: {
          refresh_token_hash: hashRefreshToken(refreshToken),
          refresh_prev_hash: null,
          refresh_family: family,
          refresh_rotated_at: new Date(),
        },
      });
    } catch {
      res.status(500).json({ error: 'JWT_SECRET is not configured' });
      return;
    }

    const googleRefresh = await resolveGoogleRefreshToken(
      user.idx,
      user.google_refresh_token,
    );
    const calendarConnected = Boolean(googleRefresh);

    setAuthCookies(res, accessToken, refreshToken);

    res.status(200).json({
      message: 'Login successful',
      user: {
        idx: user.idx.toString(),
        name: user.name || user.email.split('@')[0] || 'User',
        email: user.email,
        location: user.location,
        profile_img_url: user.profile_img_url,
        banner_img_url: user.banner_img_url,
        theme_color: user.theme_color,
        updated_at: user.updated_at,
        calendarConnected,
      },
    });
  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Google Calendar 연결 (로그인된 사용자가 최초 1회)
export const connectGoogleCalendar = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userIdx) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { code } = req.body as { code?: string };
    if (!code) {
      res.status(400).json({ error: 'Authorization code is required' });
      return;
    }

    const { client, tokens } = await exchangeCode(code);
    client.setCredentials(tokens);
    
    if (!tokens.refresh_token) {
      res.status(400).json({
        error:
          'No refresh_token returned. Remove app access in Google Account and try again.',
        code: 'NO_REFRESH_TOKEN',
      });
      return;
    }
    
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data: googleUser } = await oauth2.userinfo.get();
    
    const me = await prisma.users.findUnique({
      where: { idx: BigInt(req.userIdx) },
      select: { google_id: true },
    });
    
    if (!googleUser.id || !me || googleUser.id !== me.google_id) {
      res.status(403).json({
        error: 'Google account does not match the signed-in user',
        code: 'GOOGLE_ACCOUNT_MISMATCH',
      });
      return;
    }
    
    const hasScope = await hasCalendarScope(tokens.refresh_token);
    if (!hasScope) {
      res.status(400).json({
        error: 'Calendar scope was not granted',
        code: 'MISSING_CALENDAR_SCOPE',
      });
      return;
    }
    
    const user = await prisma.users.update({
      where: { idx: BigInt(req.userIdx) },
      data: {
        google_refresh_token: encryptSecret(tokens.refresh_token),
      },
    });

    res.status(200).json({
      message: 'Calendar connected',
      calendarConnected: true,
      user: {
        idx: user.idx.toString(),
        name: user.name || user.email.split('@')[0] || 'User',
        email: user.email,
        profile_img_url: user.profile_img_url,
        updated_at: user.updated_at,
        calendarConnected: true,
      },
    });
  } catch (error) {
    console.error('Connect Calendar Error:', error);
    res.status(500).json({ error: 'Failed to connect Google Calendar' });
  }
};

export const disconnectGoogleCalendar = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.userIdx) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const existing = await prisma.users.findUnique({
      where: { idx: BigInt(req.userIdx) },
      select: { google_refresh_token: true },
    });
    
    const rt = await resolveGoogleRefreshToken(
      BigInt(req.userIdx),
      existing?.google_refresh_token,
    );
    if (rt) {
      try {
        const oauth = createOAuthClient();
        await oauth.revokeToken(rt);
      } catch (err) {
        console.error('[disconnect] Google revoke failed', err);
      }
    }
    
    await prisma.users.update({
      where: { idx: BigInt(req.userIdx) },
      data: { google_refresh_token: null, updated_at: new Date() },
    });
    
    invalidateCalCache(String(req.userIdx));

    res.status(200).json({
      message: 'Calendar disconnected',
      calendarConnected: false,
    });
  } catch (error) {
    console.error('Disconnect Calendar Error:', error);
    res.status(500).json({ error: 'Failed to disconnect Google Calendar' });
  }
};

export const deleteAccount = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.userIdx) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userIdx = BigInt(req.userIdx);
    const existing = await prisma.users.findUnique({
      where: { idx: userIdx },
      select: { google_refresh_token: true, banner_img_url: true },
    });

    if (!existing) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const rt = await resolveGoogleRefreshToken(
      userIdx,
      existing.google_refresh_token,
    );
    if (rt) {
      try {
        const oauth = createOAuthClient();
        await oauth.revokeToken(rt);
      } catch (err) {
        console.error('[deleteAccount] Google revoke failed', err);
      }
    }

    try {
      await deleteBannerByUrl(existing.banner_img_url);
    } catch (err) {
      console.error('[deleteAccount] R2 delete failed', err);
    }

    invalidateCalCache(String(req.userIdx));

    await prisma.users.delete({ where: { idx: userIdx } });

    clearAuthCookies(res);
    res.status(200).json({ message: 'Account deleted' });
  } catch (error) {
    console.error('Delete Account Error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
};

export const refreshAccessToken = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    // Cookie-only (body 허용 제거)
    const incomingRefreshToken =
      typeof req.cookies?.refreshToken === 'string'
        ? req.cookies.refreshToken
        : '';

    if (!incomingRefreshToken) {
      res.status(400).json({ error: 'refreshToken is required' });
      return;
    }

    let payload: JwtPayload;
    try {
      payload = jwt.verify(incomingRefreshToken, getJwtSecret(), {
        algorithms: ['HS256'],
      }) as JwtPayload;
    } catch {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }

    if (payload.type !== 'refresh' || !payload.fid) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    const user = await prisma.users.findUnique({
      where: { idx: BigInt(payload.userIdx) },
    });

    if (!user || user.email !== payload.email) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    const incomingHash = hashRefreshToken(incomingRefreshToken);

    // 1) 현재 토큰과 일치 → rotation
    if (user.refresh_token_hash && incomingHash === user.refresh_token_hash) {
      const family = user.refresh_family ?? payload.fid;
      const accessToken = signAccessToken(user);
      const refreshToken = signRefreshToken(user, family);
      const newHash = hashRefreshToken(refreshToken);

      // 원자적 교체: 동시에 두 탭이 오면 하나만 성공
      const updated = await prisma.users.updateMany({
        where: {
          idx: user.idx,
          refresh_token_hash: incomingHash,
        },
        data: {
          refresh_token_hash: newHash,
          refresh_prev_hash: incomingHash,
          refresh_family: family,
          refresh_rotated_at: new Date(),
        },
      });

      if (updated.count === 1) {
        setAuthCookies(res, accessToken, refreshToken);
        res.status(200).json({ message: 'Token refreshed' });
        return;
      }
      // count=0 → 다른 탭이 이미 rotate. 아래로 fallthrough
    }

    // 최신 DB 재조회 (레이스 대비)
    const latest = await prisma.users.findUnique({
      where: { idx: user.idx },
    });
    if (!latest) {
      clearAuthCookies(res);
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    // 2) grace: 직전 토큰 + 10초 이내 → access만 재발급 (refresh 재회전 금지)
    if (
      latest.refresh_prev_hash &&
      incomingHash === latest.refresh_prev_hash &&
      withinGrace(latest.refresh_rotated_at) &&
      latest.refresh_family === payload.fid
    ) {
      const accessToken = signAccessToken(latest);
      // refresh 쿠키는 클라이언트가 이미 새 것을 가졌을 수 있음.
      // 구 토큰으로 온 탭에는 access만 갱신. refresh는 건드리지 않음.
      setAccessCookie(res, accessToken);
      res.status(200).json({ message: 'Token refreshed' });
      return;
    }

    // 3) 재사용 탐지: 서명은 유효 + family 일치 + 현재/grace 불일치
    if (
      latest.refresh_family &&
      payload.fid === latest.refresh_family &&
      incomingHash !== latest.refresh_token_hash
    ) {
      await prisma.users.update({
        where: { idx: latest.idx },
        data: clearRefreshSession(),
      });
      clearAuthCookies(res);
      res.status(401).json({
        error: 'Refresh token reuse detected',
        code: 'REFRESH_REUSE',
      });
      return;
    }

    // 4) DB에 세션 없음(재배포 직후 등) 또는 family 불일치
    clearAuthCookies(res);
    res.status(401).json({ error: 'Invalid refresh token' });
  } catch (error) {
    console.error('Refresh Token Error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  const access =
    typeof req.cookies?.accessToken === 'string' ? req.cookies.accessToken : '';
  const refresh =
    typeof req.cookies?.refreshToken === 'string' ? req.cookies.refreshToken : '';

  let cleared = false;

  // 1) access로 유저 식별 → 세션 폐기
  if (access) {
    try {
      const payload = jwt.verify(access, getJwtSecret(), {
        algorithms: ['HS256'],
      }) as JwtPayload;
      if (payload.type !== 'refresh' && payload.userIdx) {
        await prisma.users.update({
          where: { idx: BigInt(payload.userIdx) },
          data: clearRefreshSession(),
        });
        cleared = true;
      }
    } catch {
      // access 만료 등 → refresh로 fallback
    }
  }

  // 2) access 실패 시 refresh로 폐기 (path=/api/user 일 때만 도착)
  if (!cleared && refresh) {
    try {
      const payload = jwt.verify(refresh, getJwtSecret(), {
        algorithms: ['HS256'],
      }) as JwtPayload;
      if (payload.type === 'refresh' && payload.userIdx) {
        await prisma.users.updateMany({
          where: {
            idx: BigInt(payload.userIdx),
            refresh_token_hash: hashRefreshToken(refresh),
          },
          data: clearRefreshSession(),
        });
      }
    } catch {
      // ignore
    }
  }

  clearAuthCookies(res);
  res.status(200).json({ message: 'Logged out' });
};