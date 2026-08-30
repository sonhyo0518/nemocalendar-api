"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTodoCategory = exports.updateTodoCategory = exports.createTodoCategory = exports.getTodoCategories = void 0;
const prisma_1 = require("../lib/prisma");
const owned_1 = require("../utils/owned");
const DEFAULT_CATEGORY = { name: '기타', color: '#F59E0B' };
function toCategory(row) {
    return { id: row.idx.toString(), name: row.name, color: row.color };
}
// 할 일 카테고리 목록 조회
const getTodoCategories = async (req, res) => {
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const userIdx = BigInt(req.userIdx);
    let rows = await prisma_1.prisma.todo_categories.findMany({
        where: { user_idx: userIdx },
        orderBy: { sequence: 'asc' },
    });
    // 첫 요청이고 카테고리가 없으면 기본 1개 생성
    if (rows.length === 0) {
        const created = await prisma_1.prisma.todo_categories.create({
            data: {
                user_idx: userIdx,
                name: DEFAULT_CATEGORY.name,
                color: DEFAULT_CATEGORY.color,
                sequence: 0,
            },
        });
        rows = [created];
    }
    res.json({ categories: rows.map(toCategory) });
};
exports.getTodoCategories = getTodoCategories;
// 할 일 카테고리 추가
const createTodoCategory = async (req, res) => {
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
    const max = await prisma_1.prisma.todo_categories.aggregate({
        where: { user_idx: BigInt(req.userIdx) },
        _max: { sequence: true },
    });
    const row = await prisma_1.prisma.todo_categories.create({
        data: {
            user_idx: BigInt(req.userIdx),
            name,
            color,
            sequence: (max._max.sequence ?? -1) + 1,
        },
    });
    res.status(201).json({ category: toCategory(row) });
};
exports.createTodoCategory = createTodoCategory;
// 할 일 카테고리 수정
const updateTodoCategory = async (req, res) => {
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const existing = await (0, owned_1.requireOwned)(req, res, (args) => prisma_1.prisma.todo_categories.findFirst(args));
    if (!existing)
        return;
    const name = req.body?.name != null ? String(req.body.name).trim() : existing.name;
    const color = req.body?.color != null ? String(req.body.color).trim() : existing.color;
    if (!name) {
        res.status(400).json({ error: 'name is required' });
        return;
    }
    if (!color) {
        res.status(400).json({ error: 'color is required' });
        return;
    }
    const row = await prisma_1.prisma.todo_categories.update({
        where: { idx: existing.idx },
        data: { name, color },
    });
    res.json({ category: toCategory(row) });
};
exports.updateTodoCategory = updateTodoCategory;
// 할 일 카테고리 삭제
const deleteTodoCategory = async (req, res) => {
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const existing = await (0, owned_1.requireOwned)(req, res, (args) => prisma_1.prisma.todo_categories.findFirst(args));
    if (!existing)
        return;
    const userIdx = BigInt(req.userIdx);
    const count = await prisma_1.prisma.todo_categories.count({
        where: { user_idx: userIdx },
    });
    if (count <= 1) {
        res.status(400).json({ error: '마지막 카테고리는 삭제할 수 없습니다' });
        return;
    }
    // FK가 RESTRICT면 할 일이 있으면 삭제가 막히므로 먼저 연결 해제
    await prisma_1.prisma.todos.updateMany({
        where: { user_idx: userIdx, category_idx: existing.idx },
        data: { category_idx: null },
    });
    await prisma_1.prisma.todo_categories.delete({ where: { idx: existing.idx } });
    res.status(204).send();
};
exports.deleteTodoCategory = deleteTodoCategory;
