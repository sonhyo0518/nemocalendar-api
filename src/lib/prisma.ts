import { Prisma, PrismaClient } from '../generated/prisma/client';

(BigInt.prototype as unknown as { toJSON: () => string }).toJSON =
  function toJSON() {
    return this.toString();
  };

const MAX_RETRIES = 2; // 최초 1회 + 재시도 2회 = 최대 3회 시도
const BASE_DELAY_MS = 80;

function isTransientConnectionError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return err.code === 'P1001' || err.code === 'P1002';
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    const code = err.errorCode;
    return code === 'P1001' || code === 'P1002';
  }
  return false;
}

async function withConnectionRetry<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!isTransientConnectionError(err) || attempt === MAX_RETRIES) {
        throw err;
      }
      const delay = BASE_DELAY_MS * (attempt + 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw last;
}

const base = new PrismaClient();

export const prisma = base.$extends({
  query: {
    async $allOperations({ args, query }) {
      return withConnectionRetry(() => query(args));
    },
  },
}) as unknown as PrismaClient;

export { isTransientConnectionError }; // 테스트용 (또는 prisma-retry.ts로 분리)