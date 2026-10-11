import { describe, expect, it } from 'vitest';
import { Prisma } from '../src/generated/prisma/client';

// prisma.ts에서 export 했을 때:
import { isTransientConnectionError } from '../src/lib/prisma';

describe('isTransientConnectionError', () => {
  it('accepts P1001 / P1002', () => {
    const p1001 = new Prisma.PrismaClientKnownRequestError('unreachable', {
      code: 'P1001',
      clientVersion: 'test',
    });
    const p1002 = new Prisma.PrismaClientKnownRequestError('timeout', {
      code: 'P1002',
      clientVersion: 'test',
    });
    expect(isTransientConnectionError(p1001)).toBe(true);
    expect(isTransientConnectionError(p1002)).toBe(true);
  });

  it('rejects other codes', () => {
    const other = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
    expect(isTransientConnectionError(other)).toBe(false);
    expect(isTransientConnectionError(new Error('nope'))).toBe(false);
  });
});