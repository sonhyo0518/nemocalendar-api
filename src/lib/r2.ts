import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
  } from '@aws-sdk/client-s3';
  
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicBase = (process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
  
  export const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    },
  });
  
  export function publicUrlForKey(key: string) {
    return `${publicBase}/${key}`;
  }
  
  export function keyFromPublicUrl(url: string): string | null {
    if (!url || !publicBase || !url.startsWith(publicBase + '/')) return null;
    return url.slice(publicBase.length + 1);
  }
  
  export async function uploadBanner(key: string, body: Buffer, contentType: string) {
    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return publicUrlForKey(key);
  }
  
  export async function deleteBannerByUrl(url: string | null | undefined) {
    const key = url ? keyFromPublicUrl(url) : null;
    if (!key || !bucket) return;
    await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }