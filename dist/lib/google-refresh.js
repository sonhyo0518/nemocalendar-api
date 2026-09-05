"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveGoogleRefreshToken = resolveGoogleRefreshToken;
const prisma_1 = require("./prisma");
const token_crypto_1 = require("./token-crypto");
/** 평문이면 enc:v1로 올린 뒤 plain 반환 */
async function resolveGoogleRefreshToken(userIdx, stored) {
    const unwrapped = (0, token_crypto_1.unwrapSecret)(stored);
    if (!unwrapped)
        return null;
    if (unwrapped.needsReencrypt) {
        try {
            await prisma_1.prisma.users.update({
                where: { idx: userIdx },
                data: { google_refresh_token: (0, token_crypto_1.encryptSecret)(unwrapped.plain) },
            });
        }
        catch (err) {
            console.error('[google-refresh] re-encrypt failed', err);
        }
    }
    return unwrapped.plain;
}
