"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteBookmark = exports.updateBookmark = exports.createBookmark = exports.getBookmarks = void 0;
const prisma_1 = require("../lib/prisma");
const fetch_og_meta_1 = require("../utils/fetch-og-meta");
const owned_1 = require("../utils/owned");
function toBookmark(row) {
    return {
        id: row.idx.toString(),
        folderId: row.folder_idx?.toString() ?? null,
        url: row.url,
        title: row.title,
        description: row.description,
        faviconUrl: row.favicon_url,
        previewImageUrl: row.preview_image_url,
        sequence: row.sequence,
    };
}
function isHttpUrl(raw) {
    try {
        const u = new URL(raw);
        return u.protocol === 'http:' || u.protocol === 'https:';
    }
    catch {
        return false;
    }
}
function defaultTitle(url) {
    try {
        return new URL(url).hostname;
    }
    catch {
        return url;
    }
}
const getBookmarks = async (req, res) => {
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const rows = await prisma_1.prisma.bookmarks.findMany({
        where: { user_idx: BigInt(req.userIdx) },
        orderBy: [{ sequence: 'asc' }, { created_at: 'desc' }],
    });
    res.json({ bookmarks: rows.map(toBookmark) });
};
exports.getBookmarks = getBookmarks;
const createBookmark = async (req, res) => {
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const url = String(req.body?.url ?? '').trim();
    if (!url || !isHttpUrl(url)) {
        res.status(400).json({ error: 'valid url is required' });
        return;
    }
    // 클라이언트가 보낸 값 (있으면 우선)
    let title = String(req.body?.title ?? '').trim();
    let description = req.body?.description == null
        ? null
        : String(req.body.description).trim() || null;
    let favicon_url = req.body?.faviconUrl == null
        ? null
        : String(req.body.faviconUrl).trim() || null;
    let preview_image_url = req.body?.previewImageUrl == null
        ? null
        : String(req.body.previewImageUrl).trim() || null;
    let folder_idx = null;
    if (req.body?.folderId != null && req.body.folderId !== '') {
        const folder = await prisma_1.prisma.bookmark_folders.findFirst({
            where: {
                idx: BigInt(String(req.body.folderId)),
                user_idx: BigInt(req.userIdx),
            },
            select: { idx: true },
        });
        if (!folder) {
            res.status(400).json({ error: 'invalid folderId' });
            return;
        }
        folder_idx = folder.idx;
    }
    // OG로 비어 있는 필드만 채움
    const og = await (0, fetch_og_meta_1.fetchOgMeta)(url);
    if (!title)
        title = og.title?.trim() || defaultTitle(url);
    if (!description)
        description = og.description;
    if (!favicon_url)
        favicon_url = og.faviconUrl;
    if (!preview_image_url)
        preview_image_url = og.imageUrl;
    const max = await prisma_1.prisma.bookmarks.aggregate({
        where: { user_idx: BigInt(req.userIdx) },
        _max: { sequence: true },
    });
    const sequence = (max._max.sequence ?? -1) + 1;
    const row = await prisma_1.prisma.bookmarks.create({
        data: {
            user_idx: BigInt(req.userIdx),
            folder_idx,
            url,
            title,
            description,
            favicon_url,
            preview_image_url,
            sequence,
        },
    });
    res.status(201).json({ bookmark: toBookmark(row) });
};
exports.createBookmark = createBookmark;
const updateBookmark = async (req, res) => {
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const existing = await (0, owned_1.requireOwned)(req, res, (args) => prisma_1.prisma.bookmarks.findFirst(args));
    if (!existing)
        return;
    const data = {};
    let urlChanged = false;
    if (req.body?.url != null) {
        const url = String(req.body.url).trim();
        if (!isHttpUrl(url)) {
            res.status(400).json({ error: 'valid url is required' });
            return;
        }
        data.url = url;
        urlChanged = url !== existing.url;
    }
    if (req.body?.title != null)
        data.title = String(req.body.title).trim();
    if (req.body?.description !== undefined) {
        data.description =
            req.body.description == null
                ? null
                : String(req.body.description).trim() || null;
    }
    if (req.body?.faviconUrl !== undefined) {
        data.favicon_url =
            req.body.faviconUrl == null
                ? null
                : String(req.body.faviconUrl).trim() || null;
    }
    if (req.body?.previewImageUrl !== undefined) {
        data.preview_image_url =
            req.body.previewImageUrl == null
                ? null
                : String(req.body.previewImageUrl).trim() || null;
    }
    if (req.body?.folderId !== undefined) {
        if (req.body.folderId == null || req.body.folderId === '') {
            data.folder_idx = null;
        }
        else {
            const folder = await prisma_1.prisma.bookmark_folders.findFirst({
                where: {
                    idx: BigInt(String(req.body.folderId)),
                    user_idx: BigInt(req.userIdx),
                },
                select: { idx: true },
            });
            if (!folder) {
                res.status(400).json({ error: 'invalid folderId' });
                return;
            }
            data.folder_idx = folder.idx;
        }
    }
    if (req.body?.sequence != null) {
        data.sequence = Number(req.body.sequence);
    }
    // URL이 바뀌었고, 클라이언트가 미리보기/파비콘을 안 보냈으면 OG 다시 채움
    if (urlChanged && data.url) {
        const og = await (0, fetch_og_meta_1.fetchOgMeta)(data.url);
        if (req.body?.title == null && og.title)
            data.title = og.title;
        if (req.body?.description === undefined && og.description) {
            data.description = og.description;
        }
        if (req.body?.faviconUrl === undefined && og.faviconUrl) {
            data.favicon_url = og.faviconUrl;
        }
        if (req.body?.previewImageUrl === undefined && og.imageUrl) {
            data.preview_image_url = og.imageUrl;
        }
    }
    const row = await prisma_1.prisma.bookmarks.update({
        where: { idx: existing.idx },
        data,
    });
    res.json({ bookmark: toBookmark(row) });
};
exports.updateBookmark = updateBookmark;
const deleteBookmark = async (req, res) => {
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const existing = await (0, owned_1.requireOwned)(req, res, (args) => prisma_1.prisma.bookmarks.findFirst(args));
    if (!existing)
        return;
    await prisma_1.prisma.bookmarks.delete({ where: { idx: existing.idx } });
    res.status(204).send();
};
exports.deleteBookmark = deleteBookmark;
