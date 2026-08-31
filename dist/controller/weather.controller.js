"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGuestWeather = exports.suggestLocations = exports.getWeather = void 0;
const CACHE_TTL_MS = 1000 * 60 * 15; // 15분
const cache = new Map();
const KNOWN_CITIES = {
    서울: { name: '서울', lat: 37.566, lon: 126.9784 },
    부산: { name: '부산', lat: 35.10168, lon: 129.03004 },
    제주: { name: '제주', lat: 33.50972, lon: 126.52194 },
    대구: { name: '대구', lat: 35.8714, lon: 128.6014 },
    인천: { name: '인천', lat: 37.4563, lon: 126.7052 },
};
const NAME_ALIASES = {
    서울: 'Seoul',
    부산: 'Busan',
    제주: 'Jeju',
    대구: 'Daegu',
    인천: 'Incheon',
};
function mapWeatherCode(code) {
    if (code === 0)
        return { condition: 'sunny', desc: '맑음' };
    if (code <= 3)
        return { condition: 'partly', desc: '구름 조금' };
    if (code <= 48)
        return { condition: 'cloudy', desc: '흐림' };
    if (code <= 67 || (code >= 80 && code <= 82)) {
        return { condition: 'rain', desc: '비' };
    }
    if (code <= 77 || code >= 85)
        return { condition: 'rain', desc: '눈' };
    return { condition: 'cloudy', desc: '흐림' };
}
function hasHangul(s) {
    return /[가-힣]/.test(s);
}
/** Open-Meteo 1회 호출 */
async function fetchGeo(query, count) {
    const url = `https://geocoding-api.open-meteo.com/v1/search` +
        `?name=${encodeURIComponent(query)}` +
        `&count=${count}&language=ko&countryCode=KR`;
    const res = await fetch(url);
    if (!res.ok)
        return [];
    const geo = (await res.json());
    return geo.results ?? [];
}
/**
 * 한글 실패 시:
 *  1) 원문
 *  2) 원문 + 시/군/구  (전주 → 전주시)
 *  3) NAME_ALIASES 영문  (전주 → Jeonju)
 */
async function geocodeKorea(query, count) {
    const q = query.trim();
    if (!q)
        return [];
    const tried = new Set();
    const candidates = [];
    const push = (s) => {
        if (!s || tried.has(s))
            return;
        tried.add(s);
        candidates.push(s);
    };
    push(q);
    // 행정구역 접미사 보정 (한글일 때만)
    if (hasHangul(q) && !/[시군구]$/.test(q)) {
        push(`${q}시`);
        push(`${q}군`);
        push(`${q}구`);
    }
    // 영문 별칭
    const alias = NAME_ALIASES[q];
    if (alias)
        push(alias);
    // "전주시"처럼 접미사가 있으면 본명 별칭도 시도
    const base = q.replace(/[시군구]$/, '');
    if (base !== q && NAME_ALIASES[base]) {
        push(NAME_ALIASES[base]);
    }
    for (const candidate of candidates) {
        const results = await fetchGeo(candidate, count);
        if (results.length > 0)
            return results;
    }
    return [];
}
async function getWeatherForCity(cityInput, res) {
    const city = cityInput.trim();
    if (!city) {
        res.status(400).json({ error: 'city is required' });
        return;
    }
    const cached = cache.get(city);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        res.json(cached.data);
        return;
    }
    try {
        const known = KNOWN_CITIES[city];
        let place = known
            ? { name: known.name, latitude: known.lat, longitude: known.lon }
            : null;
        if (!place) {
            const results = await geocodeKorea(city, 1);
            const found = results[0];
            if (!found) {
                res.status(404).json({ error: 'city not found' });
                return;
            }
            place = {
                name: found.name,
                latitude: found.latitude,
                longitude: found.longitude,
            };
        }
        const wxRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=Asia/Seoul`);
        if (!wxRes.ok) {
            res.status(502).json({ error: 'forecast failed' });
            return;
        }
        const wx = (await wxRes.json());
        const mapped = mapWeatherCode(wx.current.weather_code);
        const data = {
            location: place.name,
            condition: mapped.condition,
            temp: Math.round(wx.current.temperature_2m),
            high: Math.round(wx.daily.temperature_2m_max[0]),
            low: Math.round(wx.daily.temperature_2m_min[0]),
            desc: mapped.desc,
        };
        cache.set(city, { at: Date.now(), data });
        res.json(data);
    }
    catch {
        res.status(502).json({ error: 'weather fetch failed' });
    }
}
const getWeather = async (req, res) => {
    return getWeatherForCity(String(req.query.city ?? ''), res);
};
exports.getWeather = getWeather;
const suggestLocations = async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 1) {
        res.json({ suggestions: [] });
        return;
    }
    try {
        // 프리셋/별칭에서 먼저 매칭
        const local = Object.keys(KNOWN_CITIES)
            .filter((name) => name.includes(q))
            .map((name) => {
            const c = KNOWN_CITIES[name];
            return { name: c.name, label: c.name, lat: c.lat, lon: c.lon };
        });
        const results = await geocodeKorea(q, 8);
        const remote = results.map((r) => ({
            name: r.name, // "전주시"
            label: r.admin1 ? `${r.name} · ${r.admin1}` : r.name,
            lat: r.latitude,
            lon: r.longitude,
        }));
        // name 기준 중복 제거 (로컬 우선)
        const seen = new Set(local.map((s) => s.name));
        const merged = [
            ...local,
            ...remote.filter((s) => !seen.has(s.name)),
        ].slice(0, 8);
        res.json({ suggestions: merged });
    }
    catch {
        res.status(502).json({ error: 'suggest failed' });
    }
};
exports.suggestLocations = suggestLocations;
/** 비로그인 사용자용 — 항상 서울 날씨 */
const getGuestWeather = async (_req, res) => {
    return getWeatherForCity('서울', res);
};
exports.getGuestWeather = getGuestWeather;
