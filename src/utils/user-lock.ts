import { prisma } from '../lib/prisma';
import type { Prisma } from '../generated/prisma/client';

type Tx = Prisma.TransactionClient;

const tailByUser = new Map<string, Promise<unknown>>();

/** 같은 Node 프로세스에서 user_idx별 임계 구역 직렬화 */
async function withUserMutex<T>(userIdx: bigint, fn: () => Promise<T>): Promise<T> {
  const key = userIdx.toString();
  const prev = tailByUser.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = prev.then(() => gate);
  tailByUser.set(key, tail);

  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (tailByUser.get(key) === tail) {
      tailByUser.delete(key);
    }
  }
}

export async function withUserLock<T>(
  userIdx: bigint,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return withUserMutex(userIdx, () =>
    prisma.$transaction(async (tx) => fn(tx)),
  );
}

export async function nextSequenceForUser(
  tx: Tx,
  table: 'todo_categories' | 'bookmark_folders' | 'bookmarks',
  userIdx: bigint,
): Promise<number> {
  // 기존과 동일
  if (table === 'todo_categories') {
    const max = await tx.todo_categories.aggregate({
      where: { user_idx: userIdx },
      _max: { sequence: true },
    });
    return (max._max.sequence ?? -1) + 1;
  }
  if (table === 'bookmark_folders') {
    const max = await tx.bookmark_folders.aggregate({
      where: { user_idx: userIdx },
      _max: { sequence: true },
    });
    return (max._max.sequence ?? -1) + 1;
  }
  const max = await tx.bookmarks.aggregate({
    where: { user_idx: userIdx },
    _max: { sequence: true },
  });
  return (max._max.sequence ?? -1) + 1;
}