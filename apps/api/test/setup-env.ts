import 'reflect-metadata';
import { loadEnv } from '../src/common/load-env';

loadEnv();

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error('TEST_DATABASE_URL is not set. Copy .env.example to .env.');
}
// Tests never touch the development database.
process.env.DATABASE_URL = testUrl;
