"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUserBanner = exports.uploadUserBanner = exports.updateBannerColor = void 0;
const crypto_1 = require("crypto");
const prisma_1 = require("../lib/prisma");
const r2_1 = require("../lib/r2");
const MAX_BYTES = 1024 * 1024;
const HEX = /^#[0-9A-Fa-f]{6}$/;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
function rgbToHex(r, g, b) {
    const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
}
const updateBannerColor = async (req, res) => {
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const body = req.body;
    const color = typeof body.color === 'string'
        ? body.color
        : rgbToHex(Number(body.r), Number(body.g), Number(body.b));
    if (!HEX.test(color)) {
        res.status(400).json({ error: 'Invalid RGB/hex color' });
        return;
    }
    const user = await prisma_1.prisma.users.update({
        where: { idx: BigInt(req.userIdx) },
        data: { theme_color: color, updated_at: new Date() },
    });
    res.json({
        theme_color: user.theme_color,
        banner_img_url: user.banner_img_url,
    });
};
exports.updateBannerColor = updateBannerColor;
const uploadUserBanner = async (req, res) => {
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const file = req.file;
    if (!file) {
        res.status(400).json({ error: 'file is required' });
        return;
    }
    if (file.size > MAX_BYTES) {
        res.status(400).json({ error: 'File must be 1MB or less' });
        return;
    }
    if (!ALLOWED.has(file.mimetype)) {
        res.status(400).json({ error: 'Only jpeg, png, webp are allowed' });
        return;
    }
    const existing = await prisma_1.prisma.users.findUnique({
        where: { idx: BigInt(req.userIdx) },
        select: { banner_img_url: true },
    });
    if (!existing) {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    const ext = file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const key = `banners/${req.userIdx}/${(0, crypto_1.randomUUID)()}.${ext}`;
    const url = await (0, r2_1.uploadBanner)(key, file.buffer, file.mimetype);
    const user = await prisma_1.prisma.users.update({
        where: { idx: BigInt(req.userIdx) },
        data: { banner_img_url: url, updated_at: new Date() },
    });
    // 새 업로드 성공 뒤에만 기존 R2 삭제
    try {
        await (0, r2_1.deleteBannerByUrl)(existing.banner_img_url);
    }
    catch (e) {
        console.error('Failed to delete old banner', e);
    }
    res.json({
        banner_img_url: user.banner_img_url,
        theme_color: user.theme_color,
    });
};
exports.uploadUserBanner = uploadUserBanner;
const deleteUserBanner = async (req, res) => {
    if (!req.userIdx) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const existing = await prisma_1.prisma.users.findUnique({
        where: { idx: BigInt(req.userIdx) },
        select: { banner_img_url: true, theme_color: true },
    });
    if (!existing) {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    try {
        await (0, r2_1.deleteBannerByUrl)(existing.banner_img_url);
    }
    catch (e) {
        console.error('Failed to delete banner from R2', e);
    }
    await prisma_1.prisma.users.update({
        where: { idx: BigInt(req.userIdx) },
        data: { banner_img_url: null, updated_at: new Date() },
    });
    res.json({
        banner_img_url: null,
        theme_color: existing.theme_color,
    });
};
exports.deleteUserBanner = deleteUserBanner;
