/**
 * Runs PostgreSQL for LifeOS without Docker or an installer (via the embedded-postgres binaries).
 *
 * - Data is stored permanently in $LIFEOS_HOME/postgres (default: ~/.lifeos/postgres), outside the
 *   repository, so it survives reinstalls, `git clean` and moving the project.
 * - Host, port, user, password and database names come from DATABASE_URL / TEST_DATABASE_URL in
 *   the repo-root .env. Missing databases are created.
 * - If something is already serving that port (Docker, a native install, or an earlier run), it
 *   reuses it and just stays idle, so `pnpm dev` works either way.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

/** Minimal .env reader (repo root); real environment variables win. */
function loadEnv() {
  const file = resolve(repoRoot, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function parseUrl(raw, fallbackDb) {
  const url = new URL(raw ?? `postgresql://lifeos:lifeos@localhost:5432/${fallbackDb}`);
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username || 'lifeos'),
    password: decodeURIComponent(url.password || 'lifeos'),
    database: url.pathname.replace(/^\//, '') || fallbackDb,
  };
}

const portInUse = (port, host) =>
  new Promise((done) => {
    const socket = createConnection({ port, host });
    socket.once('connect', () => (socket.destroy(), done(true)));
    socket.once('error', () => done(false));
  });

const idleForever = () => setInterval(() => {}, 1 << 30);

loadEnv();
const main = parseUrl(process.env.DATABASE_URL, 'lifeos');
const test = parseUrl(process.env.TEST_DATABASE_URL, 'lifeos_test');
const dataDir = resolve(process.env.LIFEOS_HOME || resolve(homedir(), '.lifeos'), 'postgres');

if (!['localhost', '127.0.0.1', '::1'].includes(main.host)) {
  console.log(`[postgres] DATABASE_URL points at ${main.host}; not starting a local server.`);
  idleForever();
} else if (await portInUse(main.port, main.host)) {
  console.log(`[postgres] Something is already listening on port ${main.port}; using it.`);
  idleForever();
} else {
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    port: main.port,
    user: main.user,
    password: main.password,
    persistent: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: (msg) => {
      const text = String(msg).trim();
      if (/ERROR|FATAL|PANIC/.test(text)) console.error(`[postgres] ${text}`);
    },
  });

  const fresh = !existsSync(resolve(dataDir, 'PG_VERSION'));
  if (fresh) {
    console.log(`[postgres] Creating a new database cluster in ${dataDir}`);
    await pg.initialise();
  }
  await pg.start();

  for (const name of new Set([main.database, test.database])) {
    try {
      await pg.createDatabase(name);
      console.log(`[postgres] Created database "${name}"`);
    } catch {
      // Already exists.
    }
  }

  console.log(`[postgres] Ready on port ${main.port} (data: ${dataDir}). Ctrl+C to stop.`);

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    console.log('[postgres] Stopping…');
    await pg.stop().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  process.on('SIGHUP', stop);
  idleForever();
}
