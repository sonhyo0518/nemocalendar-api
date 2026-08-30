import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userIdx?: string;
  email?: string;
}

export const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const header = req.headers.authorization;
const cookieToken =
  typeof req.cookies?.accessToken === 'string'
    ? req.cookies.accessToken
    : null;
const raw =
  header?.startsWith('Bearer ') ? header.slice(7) : cookieToken;

if (!raw) {
  res.status(401).json({ error: 'Unauthorized' });
  return;
}

  try {
    const token = raw;
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      res.status(500).json({ error: 'JWT_SECRET is not configured' });
      return;
    }
    const payload = jwt.verify(token, jwtSecret, {
      algorithms: ['HS256'],
    }) as { userIdx: string; email: string; type?: string };
    
    if (payload.type === 'refresh') {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    
    req.userIdx = payload.userIdx;
    req.email = payload.email;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};