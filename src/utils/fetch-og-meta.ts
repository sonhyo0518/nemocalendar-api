import { lookup } from 'dns/promises';
import http from 'http';
import https from 'https';
import type { IncomingMessage } from 'http';
import net from 'net';

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  const v = ip.toLowerCase();
  if (v === '::1') return true;
  if (v.startsWith('fc') || v.startsWith('fd')) return true;
  if (v.startsWith('fe80')) return true;
  if (v.startsWith(':ffff:')) return isPrivateIp(v.slice(7));
  return false;
}

export type SafeHttpTarget = {
  url: URL;
  addresses: string[];
};

export async function assertSafeHttpUrl(raw: string): Promise<SafeHttpTarget> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('invalid url');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('unsupported protocol');
  }
  if (u.username || u.password) throw new Error('userinfo not allowed');

  const hostname = u.hostname.replace(/^\[|\]$/g, '');
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === 'metadata.google.internal'
  ) {
    throw new Error('blocked host');
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('private ip blocked');
    return { url: u, addresses: [hostname] };
  }

  const records = await lookup(hostname, { all: true });
  const addresses = records.map((r) => r.address);
  if (!addresses.length || addresses.some((a) => isPrivateIp(a))) {
    throw new Error('dns resolved to private ip');
  }
  addresses.sort((a, b) => {
    const a4 = net.isIPv4(a);
    const b4 = net.isIPv4(b);
    if (a4 === b4) return 0;
    return a4 ? -1 : 1;
  });
  return { url: u, addresses };
}

type PinnedResponse = {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  stream: IncomingMessage;
};

function requestPinned(
  target: SafeHttpTarget,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<PinnedResponse> {
  const { url, addresses } = target;
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;
  const ip = addresses[0];
  const family = (net.isIPv6(ip) ? 6 : 4) as 4 | 6;
  const port = url.port ? Number(url.port) : isHttps ? 443 : 80;

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        servername: isHttps ? url.hostname : undefined,
        port,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          ...headers,
          Host: url.host,
        },
        lookup: (_hostname, _opts, cb) => {
          cb(null, ip, family);
        },
        signal,
      },
      (res) => {
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers,
          stream: res,
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

export type OgMeta = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
};

function absUrl(base: string, maybeRelative: string | null): string | null {
  if (!maybeRelative) return null;
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return null;
  }
}

function metaContent(html: string, key: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["'][^>]*>`,
    'i',
  );
  const m = html.match(re);
  return (m?.[1] || m?.[2] || '').trim() || null;
}

function linkHref(html: string, rel: string): string | null {
  const re = new RegExp(
    `<link[^>]+rel=["'][^"']*${rel}[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>|<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*${rel}[^"']*["'][^>]*>`,
    'i',
  );
  const m = html.match(re);
  return (m?.[1] || m?.[2] || '').trim() || null;
}

function pageTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m?.[1]?.trim() || null;
}

const MAX_OG_BYTES = 100_000;

async function readCappedText(
  stream: IncomingMessage,
  maxBytes: number,
): Promise<string> {
  const lenHeader = stream.headers['content-length'];
  if (typeof lenHeader === 'string') {
    const len = Number(lenHeader);
    if (Number.isFinite(len) && len > maxBytes) {
      stream.destroy();
      throw new Error('body too large');
    }
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    stream.on('data', (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.byteLength;
      if (total > maxBytes) {
        stream.destroy();
        reject(new Error('body too large'));
        return;
      }
      chunks.push(buf);
    });
    stream.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    stream.on('error', reject);
  });
}

/** URL HTML을 읽어 OG/기본 메타를 반환. 실패 시 전부 null. */
export async function fetchOgMeta(pageUrl: string): Promise<OgMeta> {
  const empty: OgMeta = {
    title: null,
    description: null,
    imageUrl: null,
    faviconUrl: null,
  };

  function getBotPublicUrl(): string {
    const fromEnv = process.env.APP_PUBLIC_URL?.trim();
    if (fromEnv) return fromEnv;
    const fromCors = process.env.CORS_ORIGINS?.split(',')[0]?.trim();
    if (fromCors) return fromCors;
    return 'http://localhost:3000';
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const headers = {
      'User-Agent': `Mozilla/5.0 (compatible; NemoCalendarBot/1.0; +${getBotPublicUrl()})`,
      Accept: 'text/html,application/xhtml+xml',
    };

    let current = await assertSafeHttpUrl(pageUrl);
    let res: PinnedResponse | null = null;
    const maxRedirects = 5;

    for (let i = 0; i <= maxRedirects; i++) {
      res = await requestPinned(current, headers, controller.signal);

      if (res.statusCode >= 300 && res.statusCode < 400) {
        const locRaw = res.headers.location;
        const loc = Array.isArray(locRaw) ? locRaw[0] : locRaw;
        res.stream.resume();
        if (!loc) {
          clearTimeout(timer);
          return empty;
        }
        current = await assertSafeHttpUrl(new URL(loc, current.url).toString());
        continue;
      }
      break;
    }

    clearTimeout(timer);
    if (!res || res.statusCode < 200 || res.statusCode >= 300) {
      res?.stream.resume();
      return empty;
    }

    const html = await readCappedText(res.stream, MAX_OG_BYTES);
    const finalUrl = current.url.toString();

    const title = metaContent(html, 'og:title') || pageTitle(html);
    const description =
      metaContent(html, 'og:description') || metaContent(html, 'description');
    const imageUrl = absUrl(
      finalUrl,
      metaContent(html, 'og:image') || metaContent(html, 'twitter:image'),
    );
    const faviconUrl =
      absUrl(
        finalUrl,
        linkHref(html, 'icon') || linkHref(html, 'shortcut icon'),
      ) || absUrl(finalUrl, '/favicon.ico');

    return { title, description, imageUrl, faviconUrl };
  } catch {
    return empty;
  }
}