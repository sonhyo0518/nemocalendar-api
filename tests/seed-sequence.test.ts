import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import {
  accessCookie,
  createTestUser,
  destroyTestUser,
  type TestUser,
} from './helpers/auth';

describe('P3-8 seed and sequence races', () => {
  let user: TestUser | null = null;

  afterEach(async () => {
    if (user) {
      await destroyTestUser(user.idx);
      user = null;
    }
  });

  it('seeds only one default category under concurrent GET', async () => {
    user = await createTestUser('seed');
    const cookie = accessCookie(user.accessToken);

    const [a, b] = await Promise.all([
      request(app).get('/api/todo-categories').set('Cookie', cookie),
      request(app).get('/api/todo-categories').set('Cookie', cookie),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    const count = await prisma.todo_categories.count({
      where: { user_idx: user.idx },
    });
    expect(count).toBe(1);
  });

  it('assigns distinct sequences under concurrent folder create', async () => {
    user = await createTestUser('seq');
    const cookie = accessCookie(user.accessToken);

    const [a, b] = await Promise.all([
      request(app)
        .post('/api/bookmark-folders')
        .set('Cookie', cookie)
        .send({ name: 'A' }),
      request(app)
        .post('/api/bookmark-folders')
        .set('Cookie', cookie)
        .send({ name: 'B' }),
    ]);

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.folder.sequence).not.toBe(b.body.folder.sequence);
  });
});