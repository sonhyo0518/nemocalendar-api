import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { requireOwned } from '../utils/owned';
import { withUserLock } from '../utils/user-lock';

const DEFAULT_CATEGORY = { name: '기타', color: '#F59E0B' };

function toCategory(row: { idx: bigint; name: string; color: string }) {
  return { id: row.idx.toString(), name: row.name, color: row.color };
}

// 할 일 카테고리 목록 조회
export const getTodoCategories = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const userIdx = BigInt(req.userIdx);

  const rows = await withUserLock(userIdx, async (tx) => {
    const existing = await tx.todo_categories.findMany({
      where: { user_idx: userIdx },
      orderBy: { sequence: 'asc' },
    });
    if (existing.length > 0) return existing;
  
    await tx.todo_categories.create({
      data: {
        user_idx: userIdx,
        name: DEFAULT_CATEGORY.name,
        color: DEFAULT_CATEGORY.color,
        sequence: 0,
      },
    });
  
    return tx.todo_categories.findMany({
      where: { user_idx: userIdx },
      orderBy: { sequence: 'asc' },
    });
  });

  res.json({ categories: rows.map(toCategory) });
};

// 할 일 카테고리 추가
export const createTodoCategory = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const name = String(req.body?.name ?? '').trim();
  const color = String(req.body?.color ?? '').trim();
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!color) {
    res.status(400).json({ error: 'color is required' });
    return;
  }

  const userIdx = BigInt(req.userIdx);
  const row = await withUserLock(userIdx, async (tx) => {
    const { nextSequenceForUser } = await import('../utils/user-lock');
    // 또는 파일 상단에서 nextSequenceForUser 함께 import
    const sequence = await nextSequenceForUser(tx, 'todo_categories', userIdx);
    return tx.todo_categories.create({
      data: { user_idx: userIdx, name, color, sequence },
    });
  });

  res.status(201).json({ category: toCategory(row) });
};

// 할 일 카테고리 수정
export const updateTodoCategory = async (req: AuthRequest, res: Response) => {
    if (!req.userIdx) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const existing = await requireOwned(req, res, (args) =>
      prisma.todo_categories.findFirst(args),
    );
    if (!existing) return;
  
    const name =
      req.body?.name != null ? String(req.body.name).trim() : existing.name;
    const color =
      req.body?.color != null ? String(req.body.color).trim() : existing.color;
  
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (!color) {
      res.status(400).json({ error: 'color is required' });
      return;
    }
  
    const row = await prisma.todo_categories.update({
      where: { idx: existing.idx },
      data: { name, color },
    });
    res.json({ category: toCategory(row) });
  };

// 할 일 카테고리 삭제
export const deleteTodoCategory = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const existing = await requireOwned(req, res, (args) =>
    prisma.todo_categories.findFirst(args),
  );
  if (!existing) return;
  const userIdx = BigInt(req.userIdx!);
  
  const count = await prisma.todo_categories.count({
    where: { user_idx: userIdx },
  });
  if (count <= 1) {
    res.status(400).json({ error: '마지막 카테고리는 삭제할 수 없습니다' });
    return;
  }

  // FK가 RESTRICT면 할 일이 있으면 삭제가 막히므로 먼저 연결 해제
  await prisma.todos.updateMany({
    where: { user_idx: userIdx, category_idx: existing.idx },
    data: { category_idx: null },
  });
  await prisma.todo_categories.delete({ where: { idx: existing.idx } });
  res.status(204).send();
};