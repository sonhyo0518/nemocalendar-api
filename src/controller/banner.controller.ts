import { randomUUID } from 'crypto';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { deleteBannerByUrl, uploadBanner } from '../lib/r2';
const MAX_BYTES = 1024 * 1024;
const HEX = /^#[0-9A-Fa-f]{6}$/;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

function sniffImageMime(
  buf: Buffer,
): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function rgbToHex(r: number, g: number, b: number) {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export const updateBannerColor = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const body = req.body as { color?: string; r?: number; g?: number; b?: number };
  const color =
    typeof body.color === 'string'
      ? body.color
      : rgbToHex(Number(body.r), Number(body.g), Number(body.b));

  if (!HEX.test(color)) {
    res.status(400).json({ error: 'Invalid RGB/hex color' });
    return;
  }

  const user = await prisma.users.update({
    where: { idx: BigInt(req.userIdx) },
    data: { theme_color: color, updated_at: new Date() },
  });

  res.json({
    theme_color: user.theme_color,
    banner_img_url: user.banner_img_url,
  });
};

export const uploadUserBanner = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const file = (req as AuthRequest & { file?: Express.Multer.File }).file;
  if (!file) {
    res.status(400).json({ error: 'file is required' });
    return;
  }
  if (file.size > MAX_BYTES) {
    res.status(400).json({ error: 'File must be 1MB or less' });
    return;
  }
  const sniffed = sniffImageMime(file.buffer);
  if (!sniffed || !ALLOWED.has(sniffed)) {
    res.status(400).json({ error: 'Only jpeg, png, webp are allowed' });
    return;
  }

  const existing = await prisma.users.findUnique({
    where: { idx: BigInt(req.userIdx) },
    select: { banner_img_url: true },
  });
  if (!existing) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const ext =
    sniffed === 'image/png' ? 'png' : sniffed === 'image/webp' ? 'webp' : 'jpg';
  const key = `banners/${req.userIdx}/${randomUUID()}.${ext}`;
  const url = await uploadBanner(key, file.buffer, sniffed);

  const user = await prisma.users.update({
    where: { idx: BigInt(req.userIdx) },
    data: { banner_img_url: url, updated_at: new Date() },
  });

  // 새 업로드 성공 뒤에만 기존 R2 삭제
  try {
    await deleteBannerByUrl(existing.banner_img_url);
  } catch (e) {
    console.error('Failed to delete old banner', e);
  }

  res.json({
    banner_img_url: user.banner_img_url,
    theme_color: user.theme_color,
  });
};

export const deleteUserBanner = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const existing = await prisma.users.findUnique({
    where: { idx: BigInt(req.userIdx) },
    select: { banner_img_url: true, theme_color: true },
  });
  if (!existing) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  try {
    await deleteBannerByUrl(existing.banner_img_url);
  } catch (e) {
    console.error('Failed to delete banner from R2', e);
  }

  await prisma.users.update({
    where: { idx: BigInt(req.userIdx) },
    data: { banner_img_url: null, updated_at: new Date() },
  });

  res.json({
    banner_img_url: null,
    theme_color: existing.theme_color,
  });
};