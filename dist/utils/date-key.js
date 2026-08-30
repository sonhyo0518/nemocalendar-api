"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDateKey = isDateKey;
exports.parseDateKey = parseDateKey;
exports.formatDateKey = formatDateKey;
exports.extractDateKey = extractDateKey;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
function isDateKey(value) {
    return DATE_KEY_RE.test(value);
}
/** yyyy-mm-dd → Date (@db.Date 저장용, UTC 자정) */
function parseDateKey(value) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}
/** Date → yyyy-mm-dd (@db.Date 조회용, UTC 기준) */
function formatDateKey(d) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
/** ISO datetime 또는 yyyy-mm-dd에서 날짜 키 추출 */
function extractDateKey(value) {
    if (!value)
        return null;
    const key = value.slice(0, 10);
    return isDateKey(key) ? key : null;
}
