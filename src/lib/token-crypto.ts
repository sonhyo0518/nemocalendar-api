import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const PREFIX = 'enc:v1:';

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
  }
  return Buffer.from(raw, 'hex');
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export type UnwrappedSecret = {
  plain: string;
  needsReencrypt: boolean;
};

export function unwrapSecret(
  stored: string | null | undefined,
): UnwrappedSecret | null {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) {
    return { plain: stored, needsReencrypt: true };
  }
  try {
    const body = stored.slice(PREFIX.length);
    const [ivB64, tagB64, dataB64] = body.split('.');
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const iv = Buffer.from(ivB64, 'base64url');
    const tag = Buffer.from(tagB64, 'base64url');
    const data = Buffer.from(dataB64, 'base64url');
    const decipher = createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([
      decipher.update(data),
      decipher.final(),
    ]).toString('utf8');
    return { plain, needsReencrypt: false };
  } catch {
    return null;
  }
}

export function decryptSecret(stored: string | null | undefined): string | null {
  return unwrapSecret(stored)?.plain ?? null;
}