"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateAnniversary = exports.deleteAnniversary = exports.createAnniversary = exports.getAnniversaries = void 0;
const prisma_1 = require("../lib/prisma");
const colors_1 = require("../constants/colors");
const date_key_1 = require("../utils/date-key");
const owned_1 = require("../utils/owned");
function toAnniversary(row) {
    return {
        id: row.idx.toString(),
        title: row.title,
        date: (0, date_key_1.formatDateKey)(row.target_date),
        type: row.is_dday ? "dday" : "anniversary",
        color: row.color ?? undefined,
    };
}
//기념일 조회
const getAnniversaries = async (req, res) => {
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const rows = await prisma_1.prisma.anniversaries.findMany({
        where: { user_idx: BigInt(req.userIdx) },
        orderBy: { target_date: 'asc' },
    });
    res.json({ anniversaries: rows.map(toAnniversary) });
};
exports.getAnniversaries = getAnniversaries;
const HEX = /^#([0-9a-fA-F]{6})$/;
//기념일 생성
const createAnniversary = async (req, res) => {
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const title = String(req.body?.title ?? '').trim();
    const date = String(req.body?.date ?? '').trim();
    const type = String(req.body?.type ?? 'dday');
    const colorRaw = String(req.body?.color ?? "").trim();
    const color = type === "anniversary"
        ? HEX.test(colorRaw)
            ? colorRaw
            : colors_1.DEFAULT_ANNIV_COLOR
        : null;
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
    const row = await prisma_1.prisma.anniversaries.create({
        data: {
            user_idx: BigInt(req.userIdx),
            title,
            target_date: (0, date_key_1.parseDateKey)(date),
            is_dday: type === 'dday',
            color,
        },
    });
    res.status(201).json({ anniversary: toAnniversary(row) });
};
exports.createAnniversary = createAnniversary;
//기념일 삭제
const deleteAnniversary = async (req, res) => {
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const existing = await (0, owned_1.requireOwned)(req, res, (args) => prisma_1.prisma.anniversaries.findFirst(args));
    if (!existing)
        return;
    await prisma_1.prisma.anniversaries.delete({ where: { idx: existing.idx } });
    res.status(204).send();
};
exports.deleteAnniversary = deleteAnniversary;
//기념일 수정
const updateAnniversary = async (req, res) => {
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
    const existing = await (0, owned_1.requireOwned)(req, res, (args) => prisma_1.prisma.anniversaries.findFirst(args));
    if (!existing)
        return;
    const colorRaw = String(req.body?.color ?? "").trim();
    const color = HEX.test(colorRaw) ? colorRaw : existing.color;
    const row = await prisma_1.prisma.anniversaries.update({
        where: { idx: existing.idx },
        data: {
            title,
            target_date: (0, date_key_1.parseDateKey)(date),
            color,
        },
    });
    res.json({ anniversary: toAnniversary(row) });
};
exports.updateAnniversary = updateAnniversary;
