"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTodo = exports.updateTodo = exports.createTodo = exports.getTodos = void 0;
const prisma_1 = require("../lib/prisma");
const date_key_1 = require("../utils/date-key");
const owned_1 = require("../utils/owned");
const STATUSES = ['todo', 'in-progress', 'done'];
const PRIORITIES = ['high', 'medium', 'low'];
// 할 일 데이터 변환
function toTodo(row) {
    return {
        id: row.idx.toString(),
        title: row.content,
        categoryId: row.category_idx?.toString() ?? '',
        due: (0, date_key_1.formatDateKey)(row.target_date),
        status: row.status,
        priority: row.priority,
    };
}
// 할 일 목록 조회
const getTodos = async (req, res) => {
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const rows = await prisma_1.prisma.todos.findMany({
        where: { user_idx: BigInt(req.userIdx) },
        orderBy: { sequence: 'asc' },
    });
    res.json({ todos: rows.map(toTodo) });
};
exports.getTodos = getTodos;
// 할 일 생성
const createTodo = async (req, res) => {
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
    if (!STATUSES.includes(status)) {
        res.status(400).json({ error: 'invalid status' });
        return;
    }
    if (!PRIORITIES.includes(priority)) {
        res.status(400).json({ error: 'invalid priority' });
        return;
    }
    const userIdx = BigInt(req.userIdx);
    const category = await prisma_1.prisma.todo_categories.findFirst({
        where: { idx: BigInt(categoryId), user_idx: userIdx },
    });
    if (!category) {
        res.status(400).json({ error: 'invalid categoryId' });
        return;
    }
    const row = await prisma_1.prisma.todos.create({
        data: {
            user_idx: userIdx,
            category_idx: category.idx,
            content: title,
            target_date: due ? (0, date_key_1.parseDateKey)(due) : undefined,
            status,
            priority,
            is_completed: status === 'done',
        },
    });
    res.status(201).json({ todo: toTodo(row) });
};
exports.createTodo = createTodo;
// 할 일 수정
const updateTodo = async (req, res) => {
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const existing = await (0, owned_1.requireOwned)(req, res, (args) => prisma_1.prisma.todos.findFirst(args));
    if (!existing)
        return;
    const status = req.body?.status != null ? String(req.body.status) : existing.status;
    const priority = req.body?.priority != null ? String(req.body.priority) : existing.priority;
    const title = req.body?.title != null ? String(req.body.title).trim() : existing.content;
    if (!STATUSES.includes(status)) {
        res.status(400).json({ error: 'invalid status' });
        return;
    }
    let category_idx = existing.category_idx;
    if (req.body?.categoryId != null) {
        const categoryId = String(req.body.categoryId).trim();
        if (!categoryId) {
            category_idx = null;
        }
        else {
            const category = await prisma_1.prisma.todo_categories.findFirst({
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
            target_date = (0, date_key_1.parseDateKey)(due);
        }
    }
    const row = await prisma_1.prisma.todos.update({
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
exports.updateTodo = updateTodo;
// 할 일 삭제
const deleteTodo = async (req, res) => {
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const existing = await (0, owned_1.requireOwned)(req, res, (args) => prisma_1.prisma.todos.findFirst(args));
    if (!existing)
        return;
    await prisma_1.prisma.todos.delete({ where: { idx: existing.idx } });
    res.status(204).send();
};
exports.deleteTodo = deleteTodo;
