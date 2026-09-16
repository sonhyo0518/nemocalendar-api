import jwt from 'jsonwebtoken';

const ACCESS_TOKEN_EXPIRES_IN = '1h' as const;
const REFRESH_TOKEN_EXPIRES_IN = '7d' as const;

export type JwtPayload = {
  userIdx: string;
  email: string;
  type: 'access' | 'refresh';
  fid?: string; // refresh family id
};

export function getJwtSecret(): string {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error('JWT_SECRET is not configured');
  return jwtSecret;
}

export function signAccessToken(user: { idx: bigint; email: string }): string {
  return jwt.sign(
    { userIdx: user.idx.toString(), email: user.email, type: 'access' },
    getJwtSecret(),
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN },
  );
}

export function signRefreshToken(
  user: { idx: bigint; email: string },
  family: string,
): string {
  return jwt.sign(
    {
      userIdx: user.idx.toString(),
      email: user.email,
      type: 'refresh',
      fid: family,
    },
    getJwtSecret(),
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN },
  );
}