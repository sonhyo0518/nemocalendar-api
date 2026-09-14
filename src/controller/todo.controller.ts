import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { formatDateKey, parseDateKey } from '../utils/date-key';
import { requireOwned } from '../utils/owned';

const STATUSES = ['todo', 'in-progress', 'done'] as const;
const PRIORITIES = ['high', 'medium', 'low'] as const;

// 할 일 데이터 변환
function toTodo(row: {
  idx: bigint;
  content: string;
  category_idx: bigint | null;
  target_date: Date;
  status: string;
  priority: string;
}) {
  return {
    id: row.idx.toString(),
    title: row.content,
    categoryId: row.category_idx?.toString() ?? '',
    due: formatDateKey(row.target_date),
    status: row.status,
    priority: row.priority,
  };
}

// 할 일 목록 조회
export const getTodos = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const rows = await prisma.todos.findMany({
    where: { user_idx: BigInt(req.userIdx) },
    orderBy: { sequence: 'asc' },
  });
  res.json({ todos: rows.map(toTodo) });
};

// 할 일 생성
export const createTodo = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const title = String(req.body?.title ?? '').trim();
  const categoryId = String(req.body?.categoryId ?? '').trim();
  const due = String(req.body?.due ?? '').trim();
  const status = String(req.body?.status ?? 'todo');
  const priority = String(req.body?.priority ?? 'medium');

  if (!title) {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  if (!categoryId) {
    res.status(400).json({ error: 'categoryId is required' });
    return;
  }
  if (!(STATUSES as readonly string[]).includes(status)) {
    res.status(400).json({ error: 'invalid status' });
    return;
  }
  if (!(PRIORITIES as readonly string[]).includes(priority)) {
    res.status(400).json({ error: 'invalid priority' });
    return;
  }

  const userIdx = BigInt(req.userIdx);
  const category = await prisma.todo_categories.findFirst({
    where: { idx: BigInt(categoryId), user_idx: userIdx },
  });
  if (!category) {
    res.status(400).json({ error: 'invalid categoryId' });
    return;
  }

  const row = await prisma.todos.create({
    data: {
      user_idx: userIdx,
      category_idx: category.idx,
      content: title,
      target_date: due ? parseDateKey(due) : undefined,
      status,
      priority,
      is_completed: status === 'done',
    },
  });
  res.status(201).json({ todo: toTodo(row) });
};

// 할 일 수정
export const updateTodo = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const existing = await requireOwned(req, res, (args) =>
    prisma.todos.findFirst(args),
  );
  if (!existing) return;

    const status =
    req.body?.status != null ? String(req.body.status) : existing.status;
    const priority =
    req.body?.priority != null ? String(req.body.priority) : existing.priority;
    const title =
    req.body?.title != null ? String(req.body.title).trim() : existing.content;

    if (!(STATUSES as readonly string[]).includes(status)) {
      res.status(400).json({ error: 'invalid status' });
      return;
    }
    if (!(PRIORITIES as readonly string[]).includes(priority)) {
      res.status(400).json({ error: 'invalid priority' });
      return;
    }
    if (req.body?.title != null && !title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    
    let category_idx = existing.category_idx;
    if (req.body?.categoryId != null) {
    const categoryId = String(req.body.categoryId).trim();
    if (!categoryId) {
        category_idx = null;
    } else {
        const category = await prisma.todo_categories.findFirst({
        where: { idx: BigInt(categoryId), user_idx: BigInt(req.userIdx) },
        });
        if (!category) {
        res.status(400).json({ error: 'invalid categoryId' });
        return;
        }
        category_idx = category.idx;
    }
    }

    let target_date = existing.target_date;
    if (req.body?.due != null) {
    const due = String(req.body.due).trim();
    if (due) {
      target_date = parseDateKey(due);
    }
    }

    const row = await prisma.todos.update({
    where: { idx: existing.idx },
    data: {
        content: title,
        status,
        priority,
        is_completed: status === 'done',
        category_idx,
        target_date,
    },
    });
    res.json({ todo: toTodo(row) });
};

// 할 일 삭제
export const deleteTodo = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const existing = await requireOwned(req, res, (args) =>
    prisma.todos.findFirst(args),
  );
  if (!existing) return;
  
  await prisma.todos.delete({ where: { idx: existing.idx } });
  res.status(204).send();
};