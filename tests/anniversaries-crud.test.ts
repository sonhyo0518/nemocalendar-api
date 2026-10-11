import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import {
  accessCookie,
  createTestUser,
  destroyTestUser,
  type TestUser,
} from './helpers/auth';

describe('anniversaries CRUD smoke', () => {
  let user: TestUser | null = null;

  afterEach(async () => {
    if (user) {
      await destroyTestUser(user.idx);
      user = null;
    }
  });

  it('create → list → update → delete', async () => {
    user = await createTestUser('annivCrud');
    const cookie = accessCookie(user.accessToken);

    const created = await request(app)
      .post('/api/anniversaries')
      .set('Cookie', cookie)
      .send({
        title: 'smoke day',
        date: '2026-01-01',
        type: 'dday',
      });
    expect(created.status).toBe(201);
    expect(created.body.anniversary.title).toBe('smoke day');
    expect(created.body.anniversary.date).toBe('2026-01-01');
    const id = created.body.anniversary.id as string;

    const listed = await request(app)
      .get('/api/anniversaries')
      .set('Cookie', cookie);
    expect(listed.status).toBe(200);
    expect(
      listed.body.anniversaries.some((a: { id: string }) => a.id === id),
    ).toBe(true);

    const updated = await request(app)
      .patch(`/api/anniversaries/${id}`)
      .set('Cookie', cookie)
      .send({ title: 'updated day', date: '2026-02-02' });
    expect(updated.status).toBe(200);
    expect(updated.body.anniversary.title).toBe('updated day');
    expect(updated.body.anniversary.date).toBe('2026-02-02');

    const deleted = await request(app)
      .delete(`/api/anniversaries/${id}`)
      .set('Cookie', cookie);
    expect(deleted.status).toBe(204);
  });
});