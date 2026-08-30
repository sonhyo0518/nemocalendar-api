const CAL_CACHE_TTL_MS = 45_000;

const calCache = new Map<
  string,
  { ts: number; events: unknown; calendars: unknown }
>();

function cacheKey(userIdx: string, from: string, to: string) {
  return `${userIdx}:${from}:${to}`;
}

export function readCalCache(userIdx: string, from: string, to: string) {
  const hit = calCache.get(cacheKey(userIdx, from, to));
  if (!hit) return null;
  if (Date.now() - hit.ts > CAL_CACHE_TTL_MS) {
    calCache.delete(cacheKey(userIdx, from, to));
    return null;
  }
  return hit;
}

export function writeCalCache(
  userIdx: string,
  from: string,
  to: string,
  events: unknown,
  calendars: unknown,
) {
  calCache.set(cacheKey(userIdx, from, to), {
    ts: Date.now(),
    events,
    calendars,
  });
}

export function invalidateCalCache(userIdx: string) {
  for (const key of [...calCache.keys()]) {
    if (key === userIdx || key.startsWith(`${userIdx}:`)) {
      calCache.delete(key);
    }
  }
}