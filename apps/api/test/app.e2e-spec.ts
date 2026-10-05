import type {
  ApplicationDto,
  ApplicationEventDto,
  CompanyDetailDto,
  CreateApplicationResultDto,
  DashboardDto,
} from '@lifeos/contracts';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { configureHttpApp } from '../src/app.setup';
import { type TestContext, createTestContext, resetDatabase } from '../src/test-utils/test-app';

describe('LifeOS HTTP API (e2e)', () => {
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
  });
  afterAll(() => app.close());

  it('GET /health reports the database', async () => {
    await http.get('/health').expect(200, { status: 'ok', database: 'up' });
  });

  describe('application lifecycle', () => {
    const url = 'https://jobs.siemens.com/careers/job/42?utm_source=linkedin';
    let applicationId: string;

    it('1. POST /applications with a URL and APPLIED creates company, application and APPLICATION_SUBMITTED', async () => {
      ctx.clock.set('2026-10-01T09:00:00.000Z');
      const res = await http
        .post('/applications')
        .send({
          companyName: 'Siemens',
          title: 'Software Engineer',
          url,
          status: 'APPLIED',
          location: 'Munich',
        })
        .expect(201);
      const body = res.body as CreateApplicationResultDto;

      expect(body.duplicate).toBe(false);
      expect(body.application).toMatchObject({
        title: 'Software Engineer',
        status: 'APPLIED',
        url: 'https://jobs.siemens.com/careers/job/42',
        appliedAt: '2026-10-01T09:00:00.000Z',
        company: { name: 'Siemens' },
      });
      applicationId = body.application.id;

      const company = (await http.get(`/companies/${body.application.company.id}`).expect(200))
        .body as CompanyDetailDto;
      expect(company.applications.map((a) => a.id)).toEqual([applicationId]);

      const timeline = (await http.get(`/applications/${applicationId}/timeline`).expect(200))
        .body as ApplicationEventDto[];
      expect(timeline.map((e) => e.type).sort()).toEqual(['APPLICATION_SUBMITTED', 'CREATED']);
    });

    it('2. posting the same URL again returns duplicate: true and creates nothing', async () => {
      const before = await ctx.prisma.client.applicationEvent.count();
      const res = await http
        .post('/applications')
        .send({
          companyName: 'Another Company',
          title: 'Different',
          url: 'https://JOBS.siemens.com/careers/job/42/#apply',
        })
        .expect(200);
      const body = res.body as CreateApplicationResultDto;

      expect(body.duplicate).toBe(true);
      expect(body.application.id).toBe(applicationId);
      expect(await ctx.prisma.client.application.count()).toBe(1);
      expect(await ctx.prisma.client.company.count()).toBe(1);
      expect(await ctx.prisma.client.applicationEvent.count()).toBe(before);
    });

    it('3. POST /applications/:id/status to INTERVIEW creates STATUS_CHANGED', async () => {
      ctx.clock.set('2026-10-03T09:00:00.000Z');
      const res = await http
        .post(`/applications/${applicationId}/status`)
        .send({ status: 'INTERVIEW', note: 'First round invite' })
        .expect(200);
      expect((res.body as ApplicationDto).status).toBe('INTERVIEW');

      await http
        .post(`/applications/${applicationId}/events`)
        .send({
          type: 'INTERVIEW_SCHEDULED',
          scheduledFor: '2026-10-07T12:00:00.000Z',
          description: 'Video call',
        })
        .expect(201);
    });

    it('4. GET /applications/:id/timeline shows all events, newest first', async () => {
      const timeline = (await http.get(`/applications/${applicationId}/timeline`).expect(200))
        .body as ApplicationEventDto[];

      expect(timeline.map((e) => e.type)).toEqual([
        'INTERVIEW_SCHEDULED',
        'STATUS_CHANGED',
        // Same occurredAt: the later insert (submission) comes first.
        'APPLICATION_SUBMITTED',
        'CREATED',
      ]);
      expect(timeline[1]).toMatchObject({
        metadata: { from: 'APPLIED', to: 'INTERVIEW' },
        description: 'First round invite',
      });
    });

    it('5. GET /dashboard reflects the application', async () => {
      ctx.clock.set('2026-10-04T09:00:00.000Z');
      const dashboard = (await http.get('/dashboard').expect(200)).body as DashboardDto;

      expect(dashboard.stats).toEqual({
        total: 1,
        active: 1,
        interviews: 1,
        offers: 0,
        rejections: 0,
        appliedThisWeek: 1,
        responseRate: 1,
      });
      expect(dashboard.byStatus.find((s) => s.status === 'INTERVIEW')?.count).toBe(1);
      expect(dashboard.upcomingInterviews.map((i) => i.application.id)).toEqual([applicationId]);
      expect(dashboard.needsAttention).toEqual([
        expect.objectContaining({
          application: expect.objectContaining({ id: applicationId }),
          reasons: [
            expect.objectContaining({ kind: 'UPCOMING_INTERVIEW', message: 'Interview in 3 days' }),
          ],
        }),
      ]);
      expect(dashboard.recentActivity[0]?.event.type).toBe('INTERVIEW_SCHEDULED');
    });

    it('voids an event via POST /applications/:id/events/:eventId/void', async () => {
      const timeline = (await http.get(`/applications/${applicationId}/timeline`))
        .body as ApplicationEventDto[];
      const interview = timeline[0]!;

      const res = await http
        .post(`/applications/${applicationId}/events/${interview.id}/void`)
        .send({ reason: 'Cancelled by recruiter' })
        .expect(200);
      expect(res.body).toMatchObject({ id: interview.id, voidReason: 'Cancelled by recruiter' });

      const after = (await http.get(`/applications/${applicationId}/timeline`))
        .body as ApplicationEventDto[];
      expect(after).toHaveLength(timeline.length);
    });

    it('PATCH /applications/:id updates fields but not status', async () => {
      const res = await http
        .patch(`/applications/${applicationId}`)
        .send({ nextAction: 'Prepare' })
        .expect(200);
      expect((res.body as ApplicationDto).nextAction).toBe('Prepare');

      await http.patch(`/applications/${applicationId}`).send({ status: 'OFFER' }).expect(400);
    });

    it('GET /applications supports filters and sorting', async () => {
      const res = await http
        .get('/applications')
        .query('status[]=INTERVIEW&status[]=OFFER&sort=company&order=asc')
        .expect(200);
      expect((res.body as ApplicationDto[]).map((a) => a.id)).toEqual([applicationId]);

      const none = await http.get('/applications').query({ search: 'nothing-matches' }).expect(200);
      expect(none.body).toEqual([]);
    });
  });

  describe('6. errors use the standard shape', () => {
    it('invalid input returns 400 with code VALIDATION_ERROR and details', async () => {
      const res = await http
        .post('/applications')
        .send({ title: '', url: 'not-a-url' })
        .expect(400);

      expect(res.body).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request',
          details: expect.arrayContaining([
            expect.objectContaining({ path: 'companyName' }),
            expect.objectContaining({ path: 'title' }),
            expect.objectContaining({ path: 'url' }),
          ]),
        },
      });
    });

    it('INTERVIEW_SCHEDULED without scheduledFor returns 400', async () => {
      const app = (await http.get('/applications')).body as ApplicationDto[];
      const res = await http
        .post(`/applications/${app[0]!.id}/events`)
        .send({ type: 'INTERVIEW_SCHEDULED' })
        .expect(400);
      expect(res.body.error.details).toEqual([expect.objectContaining({ path: 'scheduledFor' })]);
    });

    it('invalid query params return 400', async () => {
      const res = await http.get('/applications').query({ sort: 'bogus' }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('unknown ids return 404 NOT_FOUND', async () => {
      const res = await http.get('/applications/does-not-exist').expect(404);
      expect(res.body).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: 'Application does-not-exist not found',
          details: expect.any(Object),
        },
      });
    });

    it('unknown routes return 404 in the same shape', async () => {
      const res = await http.get('/nope').expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('duplicate company names return 409 CONFLICT', async () => {
      const res = await http.post('/companies').send({ name: 'SIEMENS' }).expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('malformed JSON returns 400', async () => {
      const res = await http
        .post('/applications')
        .set('Content-Type', 'application/json')
        .send('{"broken":')
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  it('allows CORS only for the web origin', async () => {
    const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
    const allowed = await http.get('/health').set('Origin', origin);
    expect(allowed.headers['access-control-allow-origin']).toBe(origin);
    const other = await http.get('/health').set('Origin', 'http://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});
