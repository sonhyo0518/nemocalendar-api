"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setAuthCookies = setAuthCookies;
exports.clearAuthCookies = clearAuthCookies;
const isProd = process.env.NODE_ENV === 'production';
const sameSite = isProd ? 'none' : 'lax';
const secure = isProd;
function setAuthCookies(res, accessToken, refreshToken) {
    res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
        maxAge: 60 * 60 * 1000, // 1h
    });
    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/api/user/refresh',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7d
    });
}
function clearAuthCookies(res) {
    res.clearCookie('accessToken', { path: '/', secure: true, sameSite: 'none' });
    res.clearCookie('refreshToken', { path: '/api/user/refresh', secure: true, sameSite: 'none' });
}
