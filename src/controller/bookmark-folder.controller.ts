import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { requireOwned } from '../utils/owned';
import { nextSequenceForUser, withUserLock } from '../utils/user-lock';

function toFolder(row: { idx: bigint; name: string; sequence: number }) {
  return {
    id: row.idx.toString(),
    name: row.name,
    sequence: row.sequence,
  };
}

export const getBookmarkFolders = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const rows = await prisma.bookmark_folders.findMany({
    where: { user_idx: BigInt(req.userIdx) },
    orderBy: { sequence: 'asc' },
  });
  res.json({ folders: rows.map(toFolder) });
};

export const createBookmarkFolder = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const name = String(req.body?.name ?? '').trim();
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const userIdx = BigInt(req.userIdx);
  const row = await withUserLock(userIdx, async (tx) => {
    const sequence = await nextSequenceForUser(tx, 'bookmark_folders', userIdx);
    return tx.bookmark_folders.create({
      data: { user_idx: userIdx, name, sequence },
    });
  });
  
  res.status(201).json({ folder: toFolder(row) });
};

export const updateBookmarkFolder = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const existing = await requireOwned(req, res, (args) =>
    prisma.bookmark_folders.findFirst(args),
  );
  if (!existing) return;

  const data: { name?: string; sequence?: number } = {};
  if (req.body?.name != null) {
    const name = String(req.body.name).trim();
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    data.name = name;
  }
  if (req.body?.sequence != null) {
    data.sequence = Number(req.body.sequence);
  }

  const row = await prisma.bookmark_folders.update({
    where: { idx: existing.idx },
    data,
  });
  res.json({ folder: toFolder(row) });
};

export const deleteBookmarkFolder = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const existing = await requireOwned(req, res, (args) =>
    prisma.bookmark_folders.findFirst(args),
  );
  if (!existing) return;
  const userIdx = BigInt(req.userIdx!);

  // 폴더 안 북마크 → 미분류
  await prisma.bookmarks.updateMany({
    where: { user_idx: userIdx, folder_idx: existing.idx },
    data: { folder_idx: null },
  });
  await prisma.bookmark_folders.delete({ where: { idx: existing.idx } });
  res.status(204).send();
};