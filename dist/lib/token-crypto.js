"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptSecret = encryptSecret;
exports.decryptSecret = decryptSecret;
const crypto_1 = require("crypto");
const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const PREFIX = 'enc:v1:';
function getKey() {
    const raw = process.env.TOKEN_ENCRYPTION_KEY ?? '';
    if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
        throw new Error('TOKEN_ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
    }
    return Buffer.from(raw, 'hex');
}
function encryptSecret(plain) {
    const iv = (0, crypto_1.randomBytes)(IV_LEN);
    const cipher = (0, crypto_1.createCipheriv)(ALGO, getKey(), iv);
    const encrypted = Buffer.concat([
        cipher.update(plain, 'utf8'),
        cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}
function decryptSecret(stored) {
    if (!stored)
        return null;
    if (!stored.startsWith(PREFIX)) {
        // 마이그레이션: 기존 평문 token (점진적 제거 가능)
        return stored;
    }
    try {
        const body = stored.slice(PREFIX.length);
        const [ivB64, tagB64, dataB64] = body.split('.');
        if (!ivB64 || !tagB64 || !dataB64)
            return null;
        const iv = Buffer.from(ivB64, 'base64url');
        const tag = Buffer.from(tagB64, 'base64url');
        const data = Buffer.from(dataB64, 'base64url');
        const decipher = (0, crypto_1.createDecipheriv)(ALGO, getKey(), iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    }
    catch {
        return null;
    }
}
