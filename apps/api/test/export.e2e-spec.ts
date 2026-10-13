import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { configureHttpApp } from '../src/app.setup';
import { type TestContext, createTestContext, resetDatabase } from '../src/test-utils/test-app';

describe('Export HTTP API (e2e)', () => {
  let ctx: TestContext;
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    ctx = await createTestContext();
    app = ctx.module.createNestApplication<NestExpressApplication>();
    configureHttpApp(app);
    await app.init();
    http = request(app.getHttpServer());
    await resetDatabase(ctx.prisma);
    ctx.clock.set('2026-10-13T10:00:00.000Z');
  });
  afterAll(() => app.close());

  it.each(['applications', 'tasks'])(
    'GET /export/%s.xlsx downloads an Excel file',
    async (name) => {
      const res = await http.get(`/export/${name}.xlsx`).responseType('blob').expect(200);

      expect(res.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="lifeos-${name}-2026-10-13.xlsx"`,
      );
      // .xlsx files are zip archives: they start with "PK".
      expect((res.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    },
  );

  it('validates filters with the standard error shape', async () => {
    const res = await http.get('/export/applications.xlsx').query({ sort: 'bogus' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
