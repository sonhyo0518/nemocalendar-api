import { createHash } from 'crypto';

export const REFRESH_GRACE_MS = 10_000; // 멀티탭 오탐 완화

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function clearRefreshSession() {
  return {
    refresh_token_hash: null,
    refresh_prev_hash: null,
    refresh_family: null,
    refresh_rotated_at: null,
  };
}

export function withinGrace(rotatedAt: Date | null | undefined): boolean {
  if (!rotatedAt) return false;
  return Date.now() - rotatedAt.getTime() < REFRESH_GRACE_MS;
}