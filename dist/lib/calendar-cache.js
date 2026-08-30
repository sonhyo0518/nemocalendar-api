"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readCalCache = readCalCache;
exports.writeCalCache = writeCalCache;
exports.invalidateCalCache = invalidateCalCache;
const CAL_CACHE_TTL_MS = 45000;
const calCache = new Map();
function cacheKey(userIdx, from, to) {
    return `${userIdx}:${from}:${to}`;
}
function readCalCache(userIdx, from, to) {
    const hit = calCache.get(cacheKey(userIdx, from, to));
    if (!hit)
        return null;
    if (Date.now() - hit.ts > CAL_CACHE_TTL_MS) {
        calCache.delete(cacheKey(userIdx, from, to));
        return null;
    }
    return hit;
}
function writeCalCache(userIdx, from, to, events, calendars) {
    calCache.set(cacheKey(userIdx, from, to), {
        ts: Date.now(),
        events,
        calendars,
    });
}
function invalidateCalCache(userIdx) {
    for (const key of [...calCache.keys()]) {
        if (key === userIdx || key.startsWith(`${userIdx}:`)) {
            calCache.delete(key);
        }
    }
}
