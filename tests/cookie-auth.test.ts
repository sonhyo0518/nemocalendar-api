import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import {
  accessCookie,
  createTestUser,
  destroyTestUser,
  type TestUser,
} from './helpers/auth';

describe('cookie-only auth', () => {
  let user: TestUser | null = null;

  afterEach(async () => {
    if (user) {
      await destroyTestUser(user.idx);
      user = null;
    }
  });

  it('accepts accessToken cookie', async () => {
    user = await createTestUser('cookieOk');
    const res = await request(app)
      .get('/api/pins')
      .set('Cookie', accessCookie(user.accessToken));
    expect(res.status).toBe(200);
  });

  it('rejects Authorization Bearer without cookie', async () => {
    user = await createTestUser('bearerOnly');
    const res = await request(app)
      .get('/api/pins')
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(res.status).toBe(401);
  });
});