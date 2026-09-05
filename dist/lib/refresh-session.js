"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REFRESH_GRACE_MS = void 0;
exports.hashRefreshToken = hashRefreshToken;
exports.clearRefreshSession = clearRefreshSession;
exports.withinGrace = withinGrace;
const crypto_1 = require("crypto");
exports.REFRESH_GRACE_MS = 10000; // 멀티탭 오탐 완화
function hashRefreshToken(token) {
    return (0, crypto_1.createHash)('sha256').update(token).digest('hex');
}
function clearRefreshSession() {
    return {
        refresh_token_hash: null,
        refresh_prev_hash: null,
        refresh_family: null,
        refresh_rotated_at: null,
    };
}
function withinGrace(rotatedAt) {
    if (!rotatedAt)
        return false;
    return Date.now() - rotatedAt.getTime() < exports.REFRESH_GRACE_MS;
}
