import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { NextConfig } from 'next';

// The monorepo keeps a single .env at the root.
config({ path: resolve(__dirname, '../../.env'), quiet: true });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: { position: 'bottom-left' },
  // Pin the workspace root to this monorepo (ignores lockfiles in parent directories).
  outputFileTracingRoot: resolve(__dirname, '../../'),
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  },
};

export default nextConfig;
