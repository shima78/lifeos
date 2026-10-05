import type { TaskDto } from '@lifeos/contracts';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { configureHttpApp } from '../src/app.setup';
import { type TestContext, createTestContext, resetDatabase } from '../src/test-utils/test-app';

describe('Tasks HTTP API (e2e)', () => {
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
    ctx.clock.set('2026-10-06T10:00:00.000Z');
  });
  afterAll(() => app.close());

  it('creates, lists by bucket, completes and deletes a task', async () => {
    const created = (
      await http
        .post('/tasks')
        .send({ title: 'Email recruiter', dueDate: '2026-10-06', priority: 'HIGH' })
        .expect(201)
    ).body as TaskDto;
    expect(created).toMatchObject({ title: 'Email recruiter', bucket: 'today', priority: 'HIGH' });

    const today = (await http.get('/tasks').query('bucket=today').expect(200)).body as TaskDto[];
    expect(today.map((t) => t.id)).toEqual([created.id]);

    const done = (await http.patch(`/tasks/${created.id}`).send({ status: 'DONE' }).expect(200))
      .body as TaskDto;
    expect(done).toMatchObject({ status: 'DONE', bucket: 'done' });
    expect(done.completedAt).not.toBeNull();

    await http.delete(`/tasks/${created.id}`).expect(204);
    await http.get(`/tasks/${created.id}`).expect(404);
  });

  it('validates input with the standard error shape', async () => {
    const res = await http.post('/tasks').send({ title: '', priority: 'URGENT' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(
      expect.arrayContaining(['title', 'priority']),
    );
  });

  it('rejects a link to an unknown application', async () => {
    const res = await http.post('/tasks').send({ title: 'x', applicationId: 'nope' }).expect(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' });
  });
});
