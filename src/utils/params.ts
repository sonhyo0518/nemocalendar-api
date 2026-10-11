import { Request } from 'express';

/** 숫자만 허용하는 리소스 id. 아니면 undefined (string | 정수 number) */
export function parseBigIntIdString(raw: unknown): string | undefined {
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (typeof id === 'number') {
    if (!Number.isInteger(id) || id < 0 || !Number.isSafeInteger(id)) {
      return undefined;
    }
    return String(id);
  }
  if (typeof id !== 'string' || !id || !/^\d+$/.test(id)) return undefined;
  return id;
}

/** Express params.id (string | string[]) → 숫자 문자열 | undefined */
export function parseParamId(req: Request, key = 'id'): string | undefined {
  return parseBigIntIdString(req.params[key]);
}