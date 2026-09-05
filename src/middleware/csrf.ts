import { Request, Response, NextFunction } from 'express';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function originFromReferer(referer: string | undefined): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function createCsrfMiddleware(allowedOrigins: string[]) {
  const allow = new Set(allowedOrigins);

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!MUTATING.has(req.method)) {
      next();
      return;
    }

    const origin =
      (typeof req.headers.origin === 'string' ? req.headers.origin : null) ||
      originFromReferer(
        typeof req.headers.referer === 'string' ? req.headers.referer : undefined,
      );

    // curl/서버 간 호출 등 Origin 없음 → 쿠키 기반 브라우저 CSRF만 차단
    if (!origin) {
      next();
      return;
    }

    if (!allow.has(origin)) {
      res.status(403).json({ error: 'CSRF blocked' });
      return;
    }

    next();
  };
}