import { Request } from 'express';

/** Express params.id (string | string[]) → string | undefined */
export function parseParamId(req: Request, key = 'id'): string | undefined {
  const raw = req.params[key];
  const id = Array.isArray(raw) ? raw[0] : raw;
  return id || undefined;
}