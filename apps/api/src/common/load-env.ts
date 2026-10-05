import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from 'dotenv';

/** The monorepo root: the nearest ancestor of `start` containing pnpm-workspace.yaml. */
export function findRepoRoot(start: string = __dirname): string | undefined {
  let dir = start;
  for (;;) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Loads the monorepo-root .env. Located from this file rather than the working directory, because
 * MCP clients (Claude Desktop) start the server from an arbitrary cwd. Already-set variables win,
 * so real environment variables always override the file.
 */
export function loadEnv(): void {
  const root = findRepoRoot(__dirname) ?? findRepoRoot(process.cwd());
  const file = root ? resolve(root, '.env') : undefined;
  if (file && existsSync(file)) config({ path: file, quiet: true });
}
