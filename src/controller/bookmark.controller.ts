import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { fetchOgMeta } from '../utils/fetch-og-meta';
import { requireOwned } from '../utils/owned';

function toBookmark(row: {
  idx: bigint;
  folder_idx: bigint | null;
  url: string;
  title: string;
  description: string | null;
  favicon_url: string | null;
  preview_image_url: string | null;
  sequence: number;
}) {
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

function isHttpUrl(raw: string) {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** null 허용. 값이 있으면 http(s)만 통과, 아니면 400용 Error */
function optionalHttpUrl(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (!isHttpUrl(s)) {
    const err = new Error('invalid media url') as Error & { status: number };
    err.status = 400;
    throw err;
  }
  return s;
}

function defaultTitle(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export const getBookmarks = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const rows = await prisma.bookmarks.findMany({
    where: { user_idx: BigInt(req.userIdx) },
    orderBy: [{ sequence: 'asc' }, { created_at: 'desc' }],
  });
  res.json({ bookmarks: rows.map(toBookmark) });
};

export const createBookmark = async (req: AuthRequest, res: Response) => {
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
  let description =
    req.body?.description == null
      ? null
      : String(req.body.description).trim() || null;
      let favicon_url: string | null;
      let preview_image_url: string | null;
      try {
        favicon_url = optionalHttpUrl(req.body?.faviconUrl);
        preview_image_url = optionalHttpUrl(req.body?.previewImageUrl);
      } catch {
        res.status(400).json({
          error: 'faviconUrl and previewImageUrl must be http(s) URLs',
        });
        return;
      }

      let folder_idx: bigint | null = null;
      if (req.body?.folderId != null && req.body.folderId !== '') {
        const folder = await prisma.bookmark_folders.findFirst({
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
  const og = await fetchOgMeta(url);
  if (!title) title = og.title?.trim() || defaultTitle(url);
  if (!description) description = og.description;
  if (!favicon_url) favicon_url = og.faviconUrl;
  if (!preview_image_url) preview_image_url = og.imageUrl;

  if (favicon_url && !isHttpUrl(favicon_url)) favicon_url = null;
  if (preview_image_url && !isHttpUrl(preview_image_url)) {
    preview_image_url = null;
  }

  const max = await prisma.bookmarks.aggregate({
    where: { user_idx: BigInt(req.userIdx) },
    _max: { sequence: true },
  });
  const sequence = (max._max.sequence ?? -1) + 1;

  const row = await prisma.bookmarks.create({
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

export const updateBookmark = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const existing = await requireOwned(req, res, (args) =>
    prisma.bookmarks.findFirst(args),
  );
  if (!existing) return;

  const data: {
    url?: string;
    title?: string;
    description?: string | null;
    favicon_url?: string | null;
    preview_image_url?: string | null;
    folder_idx?: bigint | null;
    sequence?: number;
  } = {};
  
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
  if (req.body?.title != null) data.title = String(req.body.title).trim();
  if (req.body?.description !== undefined) {
    data.description =
      req.body.description == null
        ? null
        : String(req.body.description).trim() || null;
  }
  if (req.body?.faviconUrl !== undefined) {
    try {
      data.favicon_url = optionalHttpUrl(req.body.faviconUrl);
    } catch {
      res.status(400).json({ error: 'faviconUrl must be http(s) URL' });
      return;
    }
  }
  if (req.body?.previewImageUrl !== undefined) {
    try {
      data.preview_image_url = optionalHttpUrl(req.body.previewImageUrl);
    } catch {
      res.status(400).json({ error: 'previewImageUrl must be http(s) URL' });
      return;
    }
  }
  if (req.body?.folderId !== undefined) {
    if (req.body.folderId == null || req.body.folderId === '') {
      data.folder_idx = null;
    } else {
      const folder = await prisma.bookmark_folders.findFirst({
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
    const og = await fetchOgMeta(data.url);
    if (req.body?.title == null && og.title) data.title = og.title;
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
  
  const row = await prisma.bookmarks.update({
    where: { idx: existing.idx },
    data,
  });

  res.json({ bookmark: toBookmark(row) });
};

export const deleteBookmark = async (req: AuthRequest, res: Response) => {
  if (!req.userIdx) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const existing = await requireOwned(req, res, (args) =>
    prisma.bookmarks.findFirst(args),
  );
  if (!existing) return;
  await prisma.bookmarks.delete({ where: { idx: existing.idx } });
  res.status(204).send();
};