// Creates .env from .env.example on first install so a fresh clone runs without manual steps.
import { copyFileSync, existsSync } from 'node:fs';

if (!existsSync('.env') && existsSync('.env.example')) {
  copyFileSync('.env.example', '.env');
  console.log('Created .env from .env.example');
}
