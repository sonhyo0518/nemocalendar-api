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

    // Origin/Referer 없음: 로컬·서버 간 호출은 허용.
    // 프로덕션에서 쿠키가 있으면 브라우저 CSRF로 간주하고 차단.
    if (!origin) {
      const hasAuthCookie =
        Boolean(req.cookies?.accessToken) ||
        Boolean(req.cookies?.refreshToken);
      if (process.env.NODE_ENV === 'production' && hasAuthCookie) {
        res.status(403).json({ error: 'CSRF blocked' });
        return;
      }
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