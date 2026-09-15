import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import {
  createTestUser,
  destroyTestUser,
  refreshCookie,
  type TestUser,
} from './helpers/auth';

describe('POST /api/user/refresh', () => {
  let user: TestUser | null = null;

  afterEach(async () => {
    if (user) {
      await destroyTestUser(user.idx);
      user = null;
    }
  });

  it('returns 400 when refresh cookie is missing', async () => {
    const res = await request(app).post('/api/user/refresh');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 401 for forged refresh token', async () => {
    const res = await request(app)
      .post('/api/user/refresh')
      .set('Cookie', refreshCookie('not-a-valid.jwt.token'));
    expect(res.status).toBe(401);
  });

  it('returns 200 and rotates cookies for valid refresh', async () => {
    user = await createTestUser();
    const res = await request(app)
      .post('/api/user/refresh')
      .set('Cookie', refreshCookie(user.refreshToken));

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/refresh/i);

    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const joined = Array.isArray(setCookie)
      ? setCookie.join(';')
      : String(setCookie);
    expect(joined).toMatch(/accessToken=/);
    expect(joined).toMatch(/refreshToken=/);
  });
});