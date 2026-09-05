"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logout = exports.refreshAccessToken = exports.disconnectGoogleCalendar = exports.connectGoogleCalendar = exports.googleLogin = exports.updateUserLocation = exports.getMe = void 0;
//route에서 사용될 함수를 따로 관리 한다.
const crypto_1 = require("crypto");
const googleapis_1 = require("googleapis");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const calendar_cache_1 = require("../lib/calendar-cache");
const auth_cookies_1 = require("../lib/auth-cookies");
const refresh_session_1 = require("../lib/refresh-session");
const prisma_1 = require("../lib/prisma");
const token_crypto_1 = require("../lib/token-crypto");
const google_refresh_1 = require("../lib/google-refresh");
const google_oauth_1 = require("../lib/google-oauth");
const ACCESS_TOKEN_EXPIRES_IN = '1h';
const REFRESH_TOKEN_EXPIRES_IN = '7d';
function getJwtSecret() {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret)
        throw new Error('JWT_SECRET is not configured');
    return jwtSecret;
}
function signAccessToken(user) {
    return jsonwebtoken_1.default.sign({ userIdx: user.idx.toString(), email: user.email, type: 'access' }, getJwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
}
function signRefreshToken(user, family) {
    return jsonwebtoken_1.default.sign({
        userIdx: user.idx.toString(),
        email: user.email,
        type: 'refresh',
        fid: family,
    }, getJwtSecret(), { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
}
async function exchangeCode(code) {
    const client = (0, google_oauth_1.createOAuthClient)();
    const { tokens } = await client.getToken(code);
    return { client, tokens };
}
async function hasCalendarScope(refreshToken) {
    const client = (0, google_oauth_1.createOAuthClient)(refreshToken);
    const { token } = await client.getAccessToken();
    if (!token)
        return false;
    const infoRes = await fetch('https://oauth2.googleapis.com/tokeninfo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ access_token: token }),
    });
    if (!infoRes.ok)
        return false;
    const info = (await infoRes.json());
    const scopes = (info.scope ?? '').split(/\s+/);
    return (scopes.includes('https://www.googleapis.com/auth/calendar') ||
        scopes.includes('https://www.googleapis.com/auth/calendar.readonly') ||
        scopes.includes('https://www.googleapis.com/auth/calendar.events'));
}
const getMe = async (req, res) => {
    const user = await prisma_1.prisma.users.findUnique({
        where: { idx: BigInt(req.userIdx) },
    });
    if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    let calendarConnected = false;
    const googleRefresh = await (0, google_refresh_1.resolveGoogleRefreshToken)(user.idx, user.google_refresh_token);
    if (googleRefresh) {
        try {
            calendarConnected = await hasCalendarScope(googleRefresh);
        }
        catch {
            calendarConnected = false;
        }
    }
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
};
exports.getMe = getMe;
const updateUserLocation = async (req, res) => {
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const location = String(req.body?.location ?? '').trim();
    if (!location) {
        res.status(400).json({ error: 'location is required' });
        return;
    }
    const user = await prisma_1.prisma.users.update({
        where: { idx: BigInt(req.userIdx) },
        data: { location, updated_at: new Date() },
    });
    res.json({ location: user.location });
};
exports.updateUserLocation = updateUserLocation;
//Google OAuth 로그인
const googleLogin = async (req, res) => {
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
        const oauth2 = googleapis_1.google.oauth2({ version: 'v2', auth: client });
        const { data: googleUser } = await oauth2.userinfo.get();
        if (!googleUser.id || !googleUser.email) {
            res.status(400).json({ error: 'Failed to retrieve Google user info' });
            return;
        }
        // 3. DB 조회 및 가입/업데이트 (BigInt PK 고려)
        let user = await prisma_1.prisma.users.findUnique({
            where: { google_id: googleUser.id },
        });
        if (!user) {
            user = await prisma_1.prisma.users.create({
                data: {
                    google_id: googleUser.id,
                    email: googleUser.email,
                    name: googleUser.name || '',
                    profile_img_url: googleUser.picture || null,
                    google_refresh_token: null,
                },
            });
        }
        else {
            user = await prisma_1.prisma.users.update({
                where: { idx: user.idx },
                data: {
                    name: googleUser.name || undefined,
                    profile_img_url: googleUser.picture || undefined,
                    updated_at: new Date(),
                },
            });
        }
        let accessToken;
        let refreshToken;
        try {
            accessToken = signAccessToken(user);
            // family를 먼저 정한 뒤 JWT·DB에 동일 값 사용
            const family = (0, crypto_1.randomUUID)();
            refreshToken = signRefreshToken(user, family);
            await prisma_1.prisma.users.update({
                where: { idx: user.idx },
                data: {
                    refresh_token_hash: (0, refresh_session_1.hashRefreshToken)(refreshToken),
                    refresh_prev_hash: null,
                    refresh_family: family,
                    refresh_rotated_at: new Date(),
                },
            });
        }
        catch {
            res.status(500).json({ error: 'JWT_SECRET is not configured' });
            return;
        }
        let calendarConnected = false;
        const googleRefresh = await (0, google_refresh_1.resolveGoogleRefreshToken)(user.idx, user.google_refresh_token);
        if (googleRefresh) {
            try {
                calendarConnected = await hasCalendarScope(googleRefresh);
            }
            catch {
                calendarConnected = false;
            }
        }
        (0, auth_cookies_1.setAuthCookies)(res, accessToken, refreshToken);
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
    }
    catch (error) {
        console.error('Google Auth Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.googleLogin = googleLogin;
// Google Calendar 연결 (로그인된 사용자가 최초 1회)
const connectGoogleCalendar = async (req, res) => {
    try {
        if (!req.userIdx) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { code } = req.body;
        if (!code) {
            res.status(400).json({ error: 'Authorization code is required' });
            return;
        }
        const { tokens } = await exchangeCode(code);
        if (!tokens.refresh_token) {
            res.status(400).json({
                error: 'No refresh_token returned. Remove app access in Google Account and try again.',
                code: 'NO_REFRESH_TOKEN',
            });
            return;
        }
        const user = await prisma_1.prisma.users.update({
            where: { idx: BigInt(req.userIdx) },
            data: {
                google_refresh_token: (0, token_crypto_1.encryptSecret)(tokens.refresh_token),
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
    }
    catch (error) {
        console.error('Connect Calendar Error:', error);
        res.status(500).json({ error: 'Failed to connect Google Calendar' });
    }
};
exports.connectGoogleCalendar = connectGoogleCalendar;
const disconnectGoogleCalendar = async (req, res) => {
    try {
        if (!req.userIdx) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        await prisma_1.prisma.users.update({
            where: { idx: BigInt(req.userIdx) },
            data: { google_refresh_token: null, updated_at: new Date() },
        });
        (0, calendar_cache_1.invalidateCalCache)(String(req.userIdx));
        res.status(200).json({
            message: 'Calendar disconnected',
            calendarConnected: false,
        });
    }
    catch (error) {
        console.error('Disconnect Calendar Error:', error);
        res.status(500).json({ error: 'Failed to disconnect Google Calendar' });
    }
};
exports.disconnectGoogleCalendar = disconnectGoogleCalendar;
const refreshAccessToken = async (req, res) => {
    try {
        // Cookie-only (body 허용 제거)
        const incomingRefreshToken = typeof req.cookies?.refreshToken === 'string'
            ? req.cookies.refreshToken
            : '';
        if (!incomingRefreshToken) {
            res.status(400).json({ error: 'refreshToken is required' });
            return;
        }
        let payload;
        try {
            payload = jsonwebtoken_1.default.verify(incomingRefreshToken, getJwtSecret(), {
                algorithms: ['HS256'],
            });
        }
        catch {
            res.status(401).json({ error: 'Invalid or expired refresh token' });
            return;
        }
        if (payload.type !== 'refresh' || !payload.fid) {
            res.status(401).json({ error: 'Invalid refresh token' });
            return;
        }
        const user = await prisma_1.prisma.users.findUnique({
            where: { idx: BigInt(payload.userIdx) },
        });
        if (!user || user.email !== payload.email) {
            res.status(401).json({ error: 'Invalid refresh token' });
            return;
        }
        const incomingHash = (0, refresh_session_1.hashRefreshToken)(incomingRefreshToken);
        // 1) 현재 토큰과 일치 → rotation
        if (user.refresh_token_hash && incomingHash === user.refresh_token_hash) {
            const family = user.refresh_family ?? payload.fid;
            const accessToken = signAccessToken(user);
            const refreshToken = signRefreshToken(user, family);
            const newHash = (0, refresh_session_1.hashRefreshToken)(refreshToken);
            // 원자적 교체: 동시에 두 탭이 오면 하나만 성공
            const updated = await prisma_1.prisma.users.updateMany({
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
                (0, auth_cookies_1.setAuthCookies)(res, accessToken, refreshToken);
                res.status(200).json({ message: 'Token refreshed' });
                return;
            }
            // count=0 → 다른 탭이 이미 rotate. 아래로 fallthrough
        }
        // 최신 DB 재조회 (레이스 대비)
        const latest = await prisma_1.prisma.users.findUnique({
            where: { idx: user.idx },
        });
        if (!latest) {
            (0, auth_cookies_1.clearAuthCookies)(res);
            res.status(401).json({ error: 'Invalid refresh token' });
            return;
        }
        // 2) grace: 직전 토큰 + 10초 이내 → access만 재발급 (refresh 재회전 금지)
        if (latest.refresh_prev_hash &&
            incomingHash === latest.refresh_prev_hash &&
            (0, refresh_session_1.withinGrace)(latest.refresh_rotated_at) &&
            latest.refresh_family === payload.fid) {
            const accessToken = signAccessToken(latest);
            // refresh 쿠키는 클라이언트가 이미 새 것을 가졌을 수 있음.
            // 구 토큰으로 온 탭에는 access만 갱신. refresh는 건드리지 않음.
            (0, auth_cookies_1.setAccessCookie)(res, accessToken);
            res.status(200).json({ message: 'Token refreshed' });
            return;
        }
        // 3) 재사용 탐지: 서명은 유효 + family 일치 + 현재/grace 불일치
        if (latest.refresh_family &&
            payload.fid === latest.refresh_family &&
            incomingHash !== latest.refresh_token_hash) {
            await prisma_1.prisma.users.update({
                where: { idx: latest.idx },
                data: (0, refresh_session_1.clearRefreshSession)(),
            });
            (0, auth_cookies_1.clearAuthCookies)(res);
            res.status(401).json({
                error: 'Refresh token reuse detected',
                code: 'REFRESH_REUSE',
            });
            return;
        }
        // 4) DB에 세션 없음(재배포 직후 등) 또는 family 불일치
        (0, auth_cookies_1.clearAuthCookies)(res);
        res.status(401).json({ error: 'Invalid refresh token' });
    }
    catch (error) {
        console.error('Refresh Token Error:', error);
        res.status(500).json({ error: 'Failed to refresh token' });
    }
};
exports.refreshAccessToken = refreshAccessToken;
const logout = async (req, res) => {
    const access = typeof req.cookies?.accessToken === 'string' ? req.cookies.accessToken : '';
    const refresh = typeof req.cookies?.refreshToken === 'string' ? req.cookies.refreshToken : '';
    let cleared = false;
    // 1) access로 유저 식별 → 세션 폐기
    if (access) {
        try {
            const payload = jsonwebtoken_1.default.verify(access, getJwtSecret(), {
                algorithms: ['HS256'],
            });
            if (payload.type !== 'refresh' && payload.userIdx) {
                await prisma_1.prisma.users.update({
                    where: { idx: BigInt(payload.userIdx) },
                    data: (0, refresh_session_1.clearRefreshSession)(),
                });
                cleared = true;
            }
        }
        catch {
            // access 만료 등 → refresh로 fallback
        }
    }
    // 2) access 실패 시 refresh로 폐기 (path=/api/user 일 때만 도착)
    if (!cleared && refresh) {
        try {
            const payload = jsonwebtoken_1.default.verify(refresh, getJwtSecret(), {
                algorithms: ['HS256'],
            });
            if (payload.type === 'refresh' && payload.userIdx) {
                await prisma_1.prisma.users.updateMany({
                    where: {
                        idx: BigInt(payload.userIdx),
                        refresh_token_hash: (0, refresh_session_1.hashRefreshToken)(refresh),
                    },
                    data: (0, refresh_session_1.clearRefreshSession)(),
                });
            }
        }
        catch {
            // ignore
        }
    }
    (0, auth_cookies_1.clearAuthCookies)(res);
    res.status(200).json({ message: 'Logged out' });
};
exports.logout = logout;
