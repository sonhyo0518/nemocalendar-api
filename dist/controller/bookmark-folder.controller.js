"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteBookmarkFolder = exports.updateBookmarkFolder = exports.createBookmarkFolder = exports.getBookmarkFolders = void 0;
const prisma_1 = require("../lib/prisma");
const owned_1 = require("../utils/owned");
function toFolder(row) {
    return {
        id: row.idx.toString(),
        name: row.name,
        sequence: row.sequence,
    };
}
const getBookmarkFolders = async (req, res) => {
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const rows = await prisma_1.prisma.bookmark_folders.findMany({
        where: { user_idx: BigInt(req.userIdx) },
        orderBy: { sequence: 'asc' },
    });
    res.json({ folders: rows.map(toFolder) });
};
exports.getBookmarkFolders = getBookmarkFolders;
const createBookmarkFolder = async (req, res) => {
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const name = String(req.body?.name ?? '').trim();
    if (!name) {
        res.status(400).json({ error: 'name is required' });
        return;
    }
    const max = await prisma_1.prisma.bookmark_folders.aggregate({
        where: { user_idx: BigInt(req.userIdx) },
        _max: { sequence: true },
    });
    const row = await prisma_1.prisma.bookmark_folders.create({
        data: {
            user_idx: BigInt(req.userIdx),
            name,
            sequence: (max._max.sequence ?? -1) + 1,
        },
    });
    res.status(201).json({ folder: toFolder(row) });
};
exports.createBookmarkFolder = createBookmarkFolder;
const updateBookmarkFolder = async (req, res) => {
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const existing = await (0, owned_1.requireOwned)(req, res, (args) => prisma_1.prisma.bookmark_folders.findFirst(args));
    if (!existing)
        return;
    const data = {};
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
    const row = await prisma_1.prisma.bookmark_folders.update({
        where: { idx: existing.idx },
        data,
    });
    res.json({ folder: toFolder(row) });
};
exports.updateBookmarkFolder = updateBookmarkFolder;
const deleteBookmarkFolder = async (req, res) => {
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const existing = await (0, owned_1.requireOwned)(req, res, (args) => prisma_1.prisma.bookmark_folders.findFirst(args));
    if (!existing)
        return;
    const userIdx = BigInt(req.userIdx);
    // 폴더 안 북마크 → 미분류
    await prisma_1.prisma.bookmarks.updateMany({
        where: { user_idx: userIdx, folder_idx: existing.idx },
        data: { folder_idx: null },
    });
    await prisma_1.prisma.bookmark_folders.delete({ where: { idx: existing.idx } });
    res.status(204).send();
};
exports.deleteBookmarkFolder = deleteBookmarkFolder;
