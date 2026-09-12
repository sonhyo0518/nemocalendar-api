import { Request, Response } from 'express';

type Condition = 'sunny' | 'partly' | 'cloudy' | 'rain';

type WeatherPayload = {
  location: string;
  condition: Condition;
  temp: number;
  high: number;
  low: number;
  desc: string;
};

const CACHE_TTL_MS = 1000 * 60 * 60 * 2; // fresh: 2시간
const STALE_TTL_MS = 1000 * 60 * 60 * 24; // stale: 24시간
const FORECAST_RETRIES = 1; // 5xx/네트워크만 최대 1회 재시도
const FORECAST_RETRY_MS = 400;
const WEATHER_API_BASE = 'https://api.weatherapi.com/v1';
const cache = new Map<string, { at: number; data: WeatherPayload }>();

/** 같은 지역 중복 호출 방지 (서울/Seoul 등) */
function coordKey(lat: number, lon: number) {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

const KNOWN_CITIES: Record<string, { name: string; lat: number; lon: number }> =
  {
    서울: { name: '서울', lat: 37.566, lon: 126.9784 },
    부산: { name: '부산', lat: 35.10168, lon: 129.03004 },
    제주: { name: '제주', lat: 33.50972, lon: 126.52194 },
    대구: { name: '대구', lat: 35.8714, lon: 128.6014 },
    인천: { name: '인천', lat: 37.4563, lon: 126.7052 },
  };

const NAME_ALIASES: Record<string, string> = {
  서울: 'Seoul',
  부산: 'Busan',
  제주: 'Jeju',
  대구: 'Daegu',
  인천: 'Incheon',
};

/** WeatherAPI condition.code → 위젯 아이콘 4분류 */
function mapConditionCode(code: number): {
  condition: Condition;
  desc: string;
} {
  if (code === 1000) return { condition: 'sunny', desc: '맑음' };
  if (code === 1003) return { condition: 'partly', desc: '구름 조금' };
  if (
    code === 1006 ||
    code === 1009 ||
    code === 1030 ||
    code === 1135 ||
    code === 1147
  ) {
    return { condition: 'cloudy', desc: '흐림' };
  }
  // 비·눈·뇌우·이슬비 등
  if (
    (code >= 1063 && code <= 1201) ||
    (code >= 1240 && code <= 1246) ||
    (code >= 1273 && code <= 1282) ||
    code === 1066 ||
    code === 1069 ||
    code === 1072 ||
    (code >= 1210 && code <= 1237) ||
    (code >= 1249 && code <= 1264)
  ) {
    const snow =
      (code >= 1066 && code <= 1072) ||
      (code >= 1210 && code <= 1237) ||
      (code >= 1249 && code <= 1264) ||
      code === 1279 ||
      code === 1282;
    return { condition: 'rain', desc: snow ? '눈' : '비' };
  }
  return { condition: 'cloudy', desc: '흐림' };
}

function getWeatherApiKey(): string | null {
  const key = process.env.WEATHER_API_KEY?.trim();
  return key || null;
}

type WeatherApiForecast = {
  location?: { name?: string; lat?: number; lon?: number };
  current?: {
    temp_c?: number;
    condition?: { text?: string; code?: number };
  };
  forecast?: {
    forecastday?: Array<{
      day?: { maxtemp_c?: number; mintemp_c?: number };
    }>;
  };
};

type WeatherApiSearchItem = {
  name: string;
  region?: string;
  country?: string;
  lat: number;
  lon: number;
};

function buildQueryCandidates(city: string): string[] {
  const q = city.trim();
  if (!q) return [];

  const known = KNOWN_CITIES[q];
  if (known) return [`${known.lat},${known.lon}`];

  const tried = new Set<string>();
  const candidates: string[] = [];
  const push = (s: string) => {
    if (!s || tried.has(s)) return;
    tried.add(s);
    candidates.push(s);
  };

  push(q);
  if (/[가-힣]/.test(q) && !/[시군구]$/.test(q)) {
    push(`${q}시`);
    push(`${q}군`);
    push(`${q}구`);
  }
  const alias = NAME_ALIASES[q];
  if (alias) push(alias);
  const base = q.replace(/[시군구]$/, '');
  if (base !== q && NAME_ALIASES[base]) push(NAME_ALIASES[base]);

  return candidates;
}

async function fetchForecastByQuery(
  q: string,
): Promise<{ ok: true; body: WeatherApiForecast } | { ok: false; notFound?: boolean }> {
  const key = getWeatherApiKey();
  if (!key) {
    console.error('[weather] WEATHER_API_KEY is missing');
    return { ok: false };
  }

  const url =
    `${WEATHER_API_BASE}/forecast.json` +
    `?key=${encodeURIComponent(key)}` +
    `&q=${encodeURIComponent(q)}` +
    `&days=1&lang=ko&aqi=no`;

  for (let attempt = 0; attempt <= FORECAST_RETRIES; attempt++) {
    try {
      const wxRes = await fetch(url);
      if (wxRes.ok) {
        const body = (await wxRes.json()) as WeatherApiForecast;
        return { ok: true, body };
      }

      const text = await wxRes.text().catch(() => '');
      console.error(
        `[weather] forecast upstream status=${wxRes.status} attempt=${attempt + 1}`,
        text.slice(0, 300),
      );

      if (wxRes.status === 400) return { ok: false, notFound: true };
      // 401/403/429·기타 4xx는 재시도하지 않음
      if (wxRes.status === 429 || wxRes.status < 500) return { ok: false };
    } catch (err) {
      console.error(
        `[weather] forecast fetch error attempt=${attempt + 1}`,
        err,
      );
    }

    if (attempt < FORECAST_RETRIES) {
      await new Promise((r) => setTimeout(r, FORECAST_RETRY_MS * (attempt + 1)));
    }
  }
  return { ok: false };
}

async function searchLocations(query: string): Promise<WeatherApiSearchItem[]> {
  const key = getWeatherApiKey();
  if (!key) {
    console.error('[weather] WEATHER_API_KEY is missing');
    return [];
  }

  const url =
    `${WEATHER_API_BASE}/search.json` +
    `?key=${encodeURIComponent(key)}` +
    `&q=${encodeURIComponent(query)}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(
      `[weather] search upstream status=${res.status}`,
      text.slice(0, 300),
    );
    return [];
  }

  const body = (await res.json()) as WeatherApiSearchItem[];
  return Array.isArray(body) ? body : [];
}

function toPayload(
  body: WeatherApiForecast,
  displayName: string,
): WeatherPayload | null {
  const temp = body.current?.temp_c;
  const high = body.forecast?.forecastday?.[0]?.day?.maxtemp_c;
  const low = body.forecast?.forecastday?.[0]?.day?.mintemp_c;
  const code = body.current?.condition?.code;
  if (
    typeof temp !== 'number' ||
    typeof high !== 'number' ||
    typeof low !== 'number' ||
    typeof code !== 'number'
  ) {
    return null;
  }

  const mapped = mapConditionCode(code);
  const text = body.current?.condition?.text?.trim();
  return {
    location: displayName,
    condition: mapped.condition,
    temp: Math.round(temp),
    high: Math.round(high),
    low: Math.round(low),
    desc: text || mapped.desc,
  };
}

function respondStaleOrFail(
  res: Response,
  city: string,
  cached: { at: number; data: WeatherPayload } | undefined,
) {
  if (cached && Date.now() - cached.at < STALE_TTL_MS) {
    console.warn(`[weather] serving stale cache city=${city}`);
    res.setHeader('X-Weather-Cache', 'stale');
    res.json(cached.data);
    return;
  }
  res.status(502).json({ error: 'forecast failed' });
}

async function getWeatherForCity(cityInput: string, res: Response) {
  const city = cityInput.trim();
  if (!city) {
    res.status(400).json({ error: 'city is required' });
    return;
  }

  if (!getWeatherApiKey()) {
    res.status(502).json({ error: 'weather unavailable' });
    return;
  }

  const cachedByCity = cache.get(city);
  if (cachedByCity && Date.now() - cachedByCity.at < CACHE_TTL_MS) {
    res.setHeader('X-Weather-Cache', 'fresh');
    res.json(cachedByCity.data);
    return;
  }

  try {
    const known = KNOWN_CITIES[city];
    const displayName = known?.name ?? city;
    const candidates = buildQueryCandidates(city);

    let payload: WeatherPayload | null = null;
    let lat: number | undefined;
    let lon: number | undefined;
    let sawNotFound = false;

    for (const q of candidates) {
      const result = await fetchForecastByQuery(q);
      if (!result.ok) {
        if (result.notFound) {
          sawNotFound = true;
          continue;
        }
        break;
      }

      payload = toPayload(result.body, displayName);
      if (!payload) continue;

      lat = result.body.location?.lat ?? known?.lat;
      lon = result.body.location?.lon ?? known?.lon;
      break;
    }

    if (!payload) {
      if (sawNotFound && !cachedByCity) {
        res.status(404).json({ error: 'city not found' });
        return;
      }
      respondStaleOrFail(res, city, cachedByCity);
      return;
    }

    const entry = { at: Date.now(), data: payload };
    if (typeof lat === 'number' && typeof lon === 'number') {
      cache.set(coordKey(lat, lon), entry);
    }
    cache.set(city, entry);
    res.setHeader('X-Weather-Cache', 'miss');
    res.json(payload);
  } catch (err) {
    console.error('[weather] weather fetch failed', err);
    respondStaleOrFail(res, city, cachedByCity);
  }
}

export const getWeather = async (req: Request, res: Response) => {
  return getWeatherForCity(String(req.query.city ?? ''), res);
};

type SuggestItem = {
  name: string;
  label: string;
  lat: number;
  lon: number;
};

export const suggestLocations = async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 1) {
    res.json({ suggestions: [] as SuggestItem[] });
    return;
  }

  try {
    const local: SuggestItem[] = Object.keys(KNOWN_CITIES)
      .filter((name) => name.includes(q))
      .map((name) => {
        const c = KNOWN_CITIES[name];
        return { name: c.name, label: c.name, lat: c.lat, lon: c.lon };
      });

    const results = await searchLocations(q);
    const remote: SuggestItem[] = results.map((r) => ({
      name: r.name,
      label: r.region ? `${r.name} · ${r.region}` : r.name,
      lat: r.lat,
      lon: r.lon,
    }));

    const seen = new Set(local.map((s) => s.name));
    const merged = [
      ...local,
      ...remote.filter((s) => !seen.has(s.name)),
    ].slice(0, 8);

    res.json({ suggestions: merged });
  } catch {
    res.status(502).json({ error: 'suggest failed' });
  }
};

/** 비로그인 사용자용 — 항상 서울 날씨 */
export const getGuestWeather = async (_req: Request, res: Response) => {
  return getWeatherForCity('서울', res);
};
