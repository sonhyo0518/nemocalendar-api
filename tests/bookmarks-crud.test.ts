import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import {
  accessCookie,
  createTestUser,
  destroyTestUser,
  type TestUser,
} from './helpers/auth';

describe('bookmarks CRUD smoke', () => {
  let user: TestUser | null = null;

  afterEach(async () => {
    if (user) {
      await destroyTestUser(user.idx);
      user = null;
    }
  });

  it(
    'create → list → update → delete',
    async () => {
      user = await createTestUser('bmCrud');
      const cookie = accessCookie(user.accessToken);

      const created = await request(app)
        .post('/api/bookmarks')
        .set('Cookie', cookie)
        .send({
          url: 'https://example.com',
          title: 'Example',
        });
      expect(created.status).toBe(201);
      expect(created.body.bookmark.url).toBe('https://example.com');
      expect(created.body.bookmark.title).toBe('Example');
      const id = created.body.bookmark.id as string;

      const listed = await request(app)
        .get('/api/bookmarks')
        .set('Cookie', cookie);
      expect(listed.status).toBe(200);
      expect(
        listed.body.bookmarks.some((b: { id: string }) => b.id === id),
      ).toBe(true);

      const updated = await request(app)
        .patch(`/api/bookmarks/${id}`)
        .set('Cookie', cookie)
        .send({ title: 'Updated Example' });
      expect(updated.status).toBe(200);
      expect(updated.body.bookmark.title).toBe('Updated Example');

      const deleted = await request(app)
        .delete(`/api/bookmarks/${id}`)
        .set('Cookie', cookie);
      expect(deleted.status).toBe(204);
    },
    30_000,
  );
});