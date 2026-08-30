"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.r2 = void 0;
exports.publicUrlForKey = publicUrlForKey;
exports.keyFromPublicUrl = keyFromPublicUrl;
exports.uploadBanner = uploadBanner;
exports.deleteBannerByUrl = deleteBannerByUrl;
const client_s3_1 = require("@aws-sdk/client-s3");
const accountId = process.env.R2_ACCOUNT_ID;
const bucket = process.env.R2_BUCKET_NAME;
const publicBase = (process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
exports.r2 = new client_s3_1.S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    },
});
function publicUrlForKey(key) {
    return `${publicBase}/${key}`;
}
function keyFromPublicUrl(url) {
    if (!url || !publicBase || !url.startsWith(publicBase + '/'))
        return null;
    return url.slice(publicBase.length + 1);
}
async function uploadBanner(key, body, contentType) {
    await exports.r2.send(new client_s3_1.PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
    }));
    return publicUrlForKey(key);
}
async function deleteBannerByUrl(url) {
    const key = url ? keyFromPublicUrl(url) : null;
    if (!key || !bucket)
        return;
    await exports.r2.send(new client_s3_1.DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
