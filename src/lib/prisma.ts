import { PrismaClient } from '../generated/prisma/client';

(BigInt.prototype as unknown as { toJSON: () => string }).toJSON =
  function toJSON() {
    return this.toString();
  };

export const prisma = new PrismaClient();