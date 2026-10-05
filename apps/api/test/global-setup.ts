import { execSync } from 'node:child_process';
import { loadEnv } from '../src/common/load-env';

/** Applies migrations to the test database once per test run. */
export default function globalSetup(): void {
  loadEnv();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set. Copy .env.example to .env.');
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url },
  });
}
