"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePin = exports.updatePin = exports.createPin = exports.getPins = void 0;
const prisma_1 = require("../lib/prisma");
const owned_1 = require("../utils/owned");
const getPins = async (req, res) => {
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const rows = await prisma_1.prisma.pins.findMany({
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
exports.getPins = getPins;
const createPin = async (req, res) => {
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const content = String(req.body?.text ?? '').trim();
    if (!content) {
        res.status(400).json({ error: 'text is required' });
        return;
    }
    const p = await prisma_1.prisma.pins.create({
        data: {
            user_idx: BigInt(req.userIdx),
            content,
            is_pinned: true,
        },
    });
    res.status(201).json({ pin: { id: p.idx.toString(), text: p.content } });
};
exports.createPin = createPin;
const updatePin = async (req, res) => {
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const content = String(req.body?.text ?? '').trim();
    if (!content) {
        res.status(400).json({ error: 'text is required' });
        return;
    }
    const existing = await (0, owned_1.requireOwned)(req, res, (args) => prisma_1.prisma.pins.findFirst(args));
    if (!existing)
        return;
    const p = await prisma_1.prisma.pins.update({
        where: { idx: existing.idx },
        data: { content },
    });
    res.json({ pin: { id: p.idx.toString(), text: p.content } });
};
exports.updatePin = updatePin;
const deletePin = async (req, res) => {
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const existing = await (0, owned_1.requireOwned)(req, res, (args) => prisma_1.prisma.pins.findFirst(args));
    if (!existing)
        return;
    await prisma_1.prisma.pins.delete({ where: { idx: existing.idx } });
    res.status(204).send();
};
exports.deletePin = deletePin;
