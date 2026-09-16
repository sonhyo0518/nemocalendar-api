import { randomUUID } from 'crypto';
import { prisma } from '../../src/lib/prisma';
import {
  signAccessToken,
  signRefreshToken,
} from '../../src/lib/jwt-tokens';
import { hashRefreshToken } from '../../src/lib/refresh-session';

export type TestUser = {
  idx: bigint;
  email: string;
  accessToken: string;
  refreshToken: string;
  family: string;
};

export async function createTestUser(
  label = `t${Date.now()}${Math.random().toString(16).slice(2, 8)}`,
): Promise<TestUser> {
  const email = `${label}@example.com`;
  const googleId = `test_${label}`;
  const family = randomUUID();

  const user = await prisma.users.create({
    data: {
      google_id: googleId,
      email,
      name: 'Test User',
    },
  });

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user, family);

  await prisma.users.update({
    where: { idx: user.idx },
    data: {
      refresh_token_hash: hashRefreshToken(refreshToken),
      refresh_prev_hash: null,
      refresh_family: family,
      refresh_rotated_at: new Date(),
    },
  });

  return {
    idx: user.idx,
    email: user.email,
    accessToken,
    refreshToken,
    family,
  };
}

export async function destroyTestUser(idx: bigint): Promise<void> {
  await prisma.users.delete({ where: { idx } }).catch(() => undefined);
}

/** Cookie header for authenticated API calls */
export function accessCookie(accessToken: string): string {
  return `accessToken=${accessToken}`;
}

/** Cookie header for POST /api/user/refresh */
export function refreshCookie(refreshToken: string): string {
  return `refreshToken=${refreshToken}`;
}