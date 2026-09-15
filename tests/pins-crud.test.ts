import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import {
  accessCookie,
  createTestUser,
  destroyTestUser,
  type TestUser,
} from './helpers/auth';

describe('pins CRUD smoke', () => {
  let user: TestUser | null = null;

  afterEach(async () => {
    if (user) {
      await destroyTestUser(user.idx);
      user = null;
    }
  });

  it('create → list → update → delete', async () => {
    user = await createTestUser('crud');

    const created = await request(app)
      .post('/api/pins')
      .set('Cookie', accessCookie(user.accessToken))
      .send({ text: 'hello pin' });

    expect(created.status).toBe(201);
    expect(created.body.pin.text).toBe('hello pin');
    const id = created.body.pin.id as string;
    expect(id).toBeTruthy();

    const listed = await request(app)
      .get('/api/pins')
      .set('Cookie', accessCookie(user.accessToken));

    expect(listed.status).toBe(200);
    expect(listed.body.pins.some((p: { id: string }) => p.id === id)).toBe(
      true,
    );

    const updated = await request(app)
      .patch(`/api/pins/${id}`)
      .set('Cookie', accessCookie(user.accessToken))
      .send({ text: 'updated pin' });

    expect(updated.status).toBe(200);
    expect(updated.body.pin.text).toBe('updated pin');

    const deleted = await request(app)
      .delete(`/api/pins/${id}`)
      .set('Cookie', accessCookie(user.accessToken));

    expect(deleted.status).toBe(204);

    const listedAfter = await request(app)
      .get('/api/pins')
      .set('Cookie', accessCookie(user.accessToken));

    expect(listedAfter.status).toBe(200);
    expect(
      listedAfter.body.pins.some((p: { id: string }) => p.id === id),
    ).toBe(false);
  });
});