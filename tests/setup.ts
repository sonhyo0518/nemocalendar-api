import path from 'path';
import { config } from 'dotenv';

const loaded = config({
  path: path.resolve(__dirname, '../.env.test'),
  override: true,
});

if (loaded.error) {
  throw new Error(
    `Failed to load .env.test: ${loaded.error.message}. Create backend/.env.test first.`,
  );
}

process.env.NODE_ENV = 'test';

const required = [
  'DATABASE_URL',
  'JWT_SECRET',
  'TOKEN_ENCRYPTION_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
] as const;

for (const key of required) {
  if (!process.env[key]?.trim()) {
    throw new Error(`Missing ${key} in .env.test`);
  }
}

if (!process.env.DATABASE_URL!.includes('nemocalendar_test')) {
  throw new Error(
    'Refusing to run tests: DATABASE_URL must point to nemocalendar_test',
  );
}