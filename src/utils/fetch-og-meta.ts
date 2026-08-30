import { lookup } from 'dns/promises';
import net from 'net';

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  const v = ip.toLowerCase();
  if (v === '::1') return true;
  if (v.startsWith('fc') || v.startsWith('fd')) return true;
  if (v.startsWith('fe80')) return true;
  if (v.startsWith(':ffff:')) return isPrivateIp(v.slice(7));
  return false;
}

async function assertSafeHttpUrl(raw: string): Promise<URL> {
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
    return u;
  }

  const records = await lookup(hostname, { all: true });
  if (!records.length || records.some((r) => isPrivateIp(r.address))) {
    throw new Error('dns resolved to private ip');
  }
  return u;
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
    // property="og:..." or name="description"
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
        'User-Agent':
          `Mozilla/5.0 (compatible; NemoCalendarBot/1.0; +${getBotPublicUrl()})`,
        Accept: 'text/html,application/xhtml+xml',
      };
  
      let current = await assertSafeHttpUrl(pageUrl);
      let res: Response | null = null;
      const maxRedirects = 5;
  
      for (let i = 0; i <= maxRedirects; i++) {
        res = await fetch(current.toString(), {
          signal: controller.signal,
          headers,
          redirect: 'manual',
        });
  
        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get('location');
          if (!loc) {
            clearTimeout(timer);
            return empty;
          }
          current = await assertSafeHttpUrl(new URL(loc, current).toString());
          continue;
        }
        break;
      }
  
      clearTimeout(timer);
      if (!res || !res.ok) return empty;
  
      const html = (await res.text()).slice(0, 80_000);
      const finalUrl = current.toString();
  
      const title = metaContent(html, 'og:title') || pageTitle(html);
      const description =
        metaContent(html, 'og:description') ||
        metaContent(html, 'description');
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