import { Request, Response, NextFunction } from 'express';

export function requestLogMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const started = Date.now();

  res.on('finish', () => {
    const status = res.statusCode;
    const path = req.path || req.url;

    // keep-alive 성공 ping은 노이즈 → 생략. 실패(503 등)는 남김
    if (path === '/health' && status < 400) return;

    const line = {
      msg: 'request',
      requestId: req.requestId,
      method: req.method,
      path,
      status,
      ms: Date.now() - started,
    };

    if (status >= 500) {
      console.error(JSON.stringify(line));
    } else if (status >= 400) {
      console.warn(JSON.stringify(line));
    } else {
      console.log(JSON.stringify(line));
    }
  });

  next();
}