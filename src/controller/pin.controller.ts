import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { requireOwned } from '../utils/owned';

export const getPins = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const rows = await prisma.pins.findMany({
    where: { user_idx: BigInt(req.userIdx), is_pinned: true },
    orderBy: { created_at: 'desc' },
  });
  res.json({
    pins: rows.map((p) => ({
      id: p.idx.toString(),
      text: p.content,
    })),
  });
};

export const createPin = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const content = String(req.body?.text ?? '').trim();
  if (!content) {
    res.status(400).json({ error: 'text is required' });
    return;
  }
  const p = await prisma.pins.create({
    data: {
      user_idx: BigInt(req.userIdx),
      content,
      is_pinned: true,
    },
  });
  res.status(201).json({ pin: { id: p.idx.toString(), text: p.content } });
};

export const updatePin = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const content = String(req.body?.text ?? '').trim();
  if (!content) {
    res.status(400).json({ error: 'text is required' });
    return;
  }
  const existing = await requireOwned(req, res, (args) =>
    prisma.pins.findFirst(args),
  );
  if (!existing) return;

  const p = await prisma.pins.update({
    where: { idx: existing.idx },
    data: { content },
  });
  res.json({ pin: { id: p.idx.toString(), text: p.content } });
};
  
export const deletePin = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const existing = await requireOwned(req, res, (args) =>
    prisma.pins.findFirst(args),
  );
  if (!existing) return;

  await prisma.pins.delete({ where: { idx: existing.idx } });
  res.status(204).send();
};