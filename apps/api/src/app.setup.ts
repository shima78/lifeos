import type { NestExpressApplication } from '@nestjs/platform-express';
import { DomainExceptionFilter } from './common/domain-exception.filter';

/** HTTP-only configuration, shared by main.ts and the e2e tests. */
export function configureHttpApp(app: NestExpressApplication): void {
  // "extended" parses `status[]=A&status[]=B` into an array.
  app.set('query parser', 'extended');
  // Only the web app's origin is allowed (an array makes `cors` omit the header for others).
  app.enableCors({
    origin: [process.env.WEB_ORIGIN ?? 'http://localhost:3000'],
  });
  app.useGlobalFilters(new DomainExceptionFilter());
  app.enableShutdownHooks();
}
