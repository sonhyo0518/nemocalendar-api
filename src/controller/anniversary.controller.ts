import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { DEFAULT_ANNIV_COLOR } from '../constants/colors';
import { formatDateKey, parseDateKey } from '../utils/date-key';
import { requireOwned } from '../utils/owned';

function toAnniversary(row: {
  idx: bigint
  title: string
  target_date: Date
  is_dday: boolean
  color: string | null
}) {
  return {
    id: row.idx.toString(),
    title: row.title,
    date: formatDateKey(row.target_date),
    type: row.is_dday ? ("dday" as const) : ("anniversary" as const),
    color: row.color ?? undefined,
  }
}

//기념일 조회
export const getAnniversaries = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const rows = await prisma.anniversaries.findMany({
    where: { user_idx: BigInt(req.userIdx) },
    orderBy: { target_date: 'asc' },
  });
  res.json({ anniversaries: rows.map(toAnniversary) });
};


const HEX = /^#([0-9a-fA-F]{6})$/

//기념일 생성
export const createAnniversary = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const title = String(req.body?.title ?? '').trim();
  const date = String(req.body?.date ?? '').trim();
  const type = String(req.body?.type ?? 'dday');


  const colorRaw = String(req.body?.color ?? "").trim()
  const color =
    type === "anniversary"
      ? HEX.test(colorRaw)
        ? colorRaw
        : DEFAULT_ANNIV_COLOR
      : null

  if (!title) {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'date is required (yyyy-mm-dd)' });
    return;
  }
  if (type !== 'dday' && type !== 'anniversary') {
    res.status(400).json({ error: 'invalid type' });
    return;
  }

  const row = await prisma.anniversaries.create({
    data: {
      user_idx: BigInt(req.userIdx),
      title,
      target_date: parseDateKey(date),
      is_dday: type === 'dday',
      color,
    },
  });
  res.status(201).json({ anniversary: toAnniversary(row) });
};

//기념일 삭제
export const deleteAnniversary = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const existing = await requireOwned(req, res, (args) =>
    prisma.anniversaries.findFirst(args),
  );
  if (!existing) return;
  await prisma.anniversaries.delete({ where: { idx: existing.idx } });
  res.status(204).send();
};

//기념일 수정
export const updateAnniversary = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const title = String(req.body?.title ?? '').trim();
  const date = String(req.body?.date ?? '').trim();

  if (!title) {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'date is required (yyyy-mm-dd)' });
    return;
  }
  const existing = await requireOwned(req, res, (args) =>
    prisma.anniversaries.findFirst(args),
  );
  if (!existing) return;

  const colorRaw = String(req.body?.color ?? "").trim()
  const color = HEX.test(colorRaw) ? colorRaw : existing.color

  const row = await prisma.anniversaries.update({
    where: { idx: existing.idx },
    data: {
      title,
      target_date: parseDateKey(date),
      color,
    },
  });
  res.json({ anniversary: toAnniversary(row) });
};