import { Response } from 'express';

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
) {
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: 60 * 60 * 1000,
  });
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/api/user', // logout·refresh 모두 전송
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function setAccessCookie(res: Response, accessToken: string) {
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie('accessToken', { path: '/', secure: true, sameSite: 'none' });
  res.clearCookie('refreshToken', { path: '/api/user', secure: true, sameSite: 'none' });
  // 이전 path 쿠키가 남아 있을 수 있어 한 번 더 지움 (마이그레이션)
  res.clearCookie('refreshToken', {
    path: '/api/user/refresh',
    secure: true,
    sameSite: 'none',
  });
}