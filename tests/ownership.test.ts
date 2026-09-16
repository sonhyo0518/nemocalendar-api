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

describe('pins ownership', () => {
  let userA: TestUser | null = null;
  let userB: TestUser | null = null;

  afterEach(async () => {
    if (userA) await destroyTestUser(userA.idx);
    if (userB) await destroyTestUser(userB.idx);
    userA = null;
    userB = null;
  });

  it('returns 404 when another user updates the pin', async () => {
    userA = await createTestUser('ownA');
    userB = await createTestUser('ownB');

    const pin = await prisma.pins.create({
      data: {
        user_idx: userA.idx,
        content: 'secret',
        is_pinned: true,
      },
    });

    const res = await request(app)
      .patch(`/api/pins/${pin.idx.toString()}`)
      .set('Cookie', accessCookie(userB.accessToken))
      .send({ text: 'hacked' });

    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid pin id', async () => {
    userA = await createTestUser('ownInvalid');

    const res = await request(app)
      .patch('/api/pins/abc')
      .set('Cookie', accessCookie(userA.accessToken))
      .send({ text: 'x' });

    expect(res.status).toBe(400);
  });
});