import { prisma } from './prisma';
import { encryptSecret, unwrapSecret } from './token-crypto';

/** 평문이면 enc:v1로 올린 뒤 plain 반환 */
export async function resolveGoogleRefreshToken(
  userIdx: bigint,
  stored: string | null | undefined,
): Promise<string | null> {
  const unwrapped = unwrapSecret(stored);
  if (!unwrapped) return null;

  if (unwrapped.needsReencrypt) {
    try {
      await prisma.users.update({
        where: { idx: userIdx },
        data: { google_refresh_token: encryptSecret(unwrapped.plain) },
      });
    } catch (err) {
      console.error('[google-refresh] re-encrypt failed', err);
    }
  }

  return unwrapped.plain;
}