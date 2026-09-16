if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv/config');
}

import { app } from './app';

const port = Number(process.env.PORT ?? 5000);

function assertRequiredEnv(): void {
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'TOKEN_ENCRYPTION_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI',
  ];
  if (process.env.NODE_ENV === 'production') {
    required.push('CORS_ORIGINS');
  }

  const missing = required.filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    console.error(`[boot] Missing env: ${missing.join(', ')}`);
    process.exit(1);
  }

  const enc = process.env.TOKEN_ENCRYPTION_KEY ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(enc)) {
    console.error('[boot] TOKEN_ENCRYPTION_KEY must be 64 hex chars');
    process.exit(1);
  }
}

assertRequiredEnv();

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});