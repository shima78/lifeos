/**
 * Cleanly stops the local LifeOS Postgres (data in $LIFEOS_HOME/postgres), even if the process
 * that started it is gone (e.g. a closed terminal).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dataDir = resolve(process.env.LIFEOS_HOME || resolve(homedir(), '.lifeos'), 'postgres');
if (!existsSync(resolve(dataDir, 'postmaster.pid'))) {
  console.log('[postgres] Not running.');
  process.exit(0);
}

// The platform binaries package (a dependency of embedded-postgres) exports the binary paths.
const require = createRequire(import.meta.url);
const os = process.platform === 'win32' ? 'windows' : process.platform;
const binaries = require.resolve(`@embedded-postgres/${os}-${process.arch}`, {
  paths: [dirname(require.resolve('embedded-postgres'))],
});
const { pg_ctl: pgCtl } = await import(pathToFileURL(binaries).href);

const result = spawnSync(pgCtl, ['stop', '-D', dataDir, '-m', 'fast'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
