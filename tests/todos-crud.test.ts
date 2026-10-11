import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import {
  accessCookie,
  createTestUser,
  destroyTestUser,
  type TestUser,
} from './helpers/auth';

describe('todos CRUD smoke', () => {
  let user: TestUser | null = null;

  afterEach(async () => {
    if (user) {
      await destroyTestUser(user.idx);
      user = null;
    }
  });

  it('create → list → update → delete', async () => {
    user = await createTestUser('todoCrud');
    const cookie = accessCookie(user.accessToken);

    const cats = await request(app)
      .get('/api/todo-categories')
      .set('Cookie', cookie);
    expect(cats.status).toBe(200);
    const categoryId = cats.body.categories[0]?.id as string;
    expect(categoryId).toBeTruthy();

    const created = await request(app)
      .post('/api/todos')
      .set('Cookie', cookie)
      .send({
        title: 'smoke todo',
        categoryId,
        due: '2026-10-11',
        status: 'todo',
        priority: 'medium',
      });
    expect(created.status).toBe(201);
    expect(created.body.todo.title).toBe('smoke todo');
    expect(created.body.todo.due).toBe('2026-10-11');
    const id = created.body.todo.id as string;

    const listed = await request(app).get('/api/todos').set('Cookie', cookie);
    expect(listed.status).toBe(200);
    expect(listed.body.todos.some((t: { id: string }) => t.id === id)).toBe(
      true,
    );

    const updated = await request(app)
      .patch(`/api/todos/${id}`)
      .set('Cookie', cookie)
      .send({ title: 'updated todo', due: '2026-12-25' });
    expect(updated.status).toBe(200);
    expect(updated.body.todo.title).toBe('updated todo');
    expect(updated.body.todo.due).toBe('2026-12-25');

    const deleted = await request(app)
      .delete(`/api/todos/${id}`)
      .set('Cookie', cookie);
    expect(deleted.status).toBe(204);

    const listedAfter = await request(app)
      .get('/api/todos')
      .set('Cookie', cookie);
    expect(
      listedAfter.body.todos.some((t: { id: string }) => t.id === id),
    ).toBe(false);
  });

  it('rejects invalid due', async () => {
    user = await createTestUser('todoDue');
    const cookie = accessCookie(user.accessToken);
    const cats = await request(app)
      .get('/api/todo-categories')
      .set('Cookie', cookie);
    const categoryId = cats.body.categories[0].id as string;

    const res = await request(app)
      .post('/api/todos')
      .set('Cookie', cookie)
      .send({ title: 'x', categoryId, due: 'not-a-date' });
    expect(res.status).toBe(400);
  });
});