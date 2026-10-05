import {
  type CreateApplicationInput,
  applicationListQuerySchema,
  changeStatusSchema,
  createApplicationSchema,
  updateApplicationSchema,
} from '@lifeos/contracts';
import { ConflictError, NotFoundError } from '../common/errors';
import { CompaniesService } from '../companies/companies.service';
import { EventsRepository } from '../events/events.repository';
import { EventsService } from '../events/events.service';
import { type TestContext, createTestContext, resetDatabase } from '../test-utils/test-app';
import { ApplicationsService } from './applications.service';

describe('ApplicationsService', () => {
  let ctx: TestContext;
  let service: ApplicationsService;
  let events: EventsService;

  const create = (input: Partial<CreateApplicationInput> = {}) =>
    service.create(
      createApplicationSchema.parse({
        companyName: 'Siemens',
        title: 'Software Engineer',
        ...input,
      }),
    );
  const timelineTypes = async (id: string) => (await events.timeline(id)).map((e) => e.type).sort();
  const countRows = async () => ({
    applications: await ctx.prisma.client.application.count(),
    events: await ctx.prisma.client.applicationEvent.count(),
    companies: await ctx.prisma.client.company.count(),
  });

  beforeAll(async () => {
    ctx = await createTestContext();
    service = ctx.module.get(ApplicationsService);
    events = ctx.module.get(EventsService);
  });
  afterAll(() => ctx.module.close());
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    ctx.clock.set('2026-10-04T10:00:00.000Z');
    jest.restoreAllMocks();
  });

  describe('create', () => {
    it('creates the company, the application and a CREATED event', async () => {
      const result = await create({ status: 'SAVED' });

      expect(result.duplicate).toBe(false);
      expect(result.warnings).toEqual([]);
      expect(result.application.company.name).toBe('Siemens');
      expect(result.application.status).toBe('SAVED');
      expect(result.application.appliedAt).toBeNull();
      expect(result.application.lastActivityAt).toBe('2026-10-04T10:00:00.000Z');
      expect(await timelineTypes(result.application.id)).toEqual(['CREATED']);
    });

    it('reuses an existing company by name, case-insensitive and trimmed', async () => {
      const companies = ctx.module.get(CompaniesService);
      const first = await create({ companyName: 'Siemens' });
      const second = await create({ companyName: '  siemens ', title: 'Data Engineer' });

      expect(second.application.company.id).toBe(first.application.company.id);
      expect(await companies.list()).toHaveLength(1);
    });

    it('sets appliedAt to now and records APPLICATION_SUBMITTED for APPLIED or later', async () => {
      const result = await create({ status: 'APPLIED' });

      expect(result.application.appliedAt).toBe('2026-10-04T10:00:00.000Z');
      expect(await timelineTypes(result.application.id)).toEqual([
        'APPLICATION_SUBMITTED',
        'CREATED',
      ]);
    });

    it('keeps a given appliedAt (Berlin calendar date) for the submitted event', async () => {
      const result = await create({ status: 'INTERVIEW', appliedAt: '2026-09-20' });

      expect(result.application.appliedAt).toBe('2026-09-19T22:00:00.000Z');
      const submitted = (await events.timeline(result.application.id)).find(
        (e) => e.type === 'APPLICATION_SUBMITTED',
      );
      expect(submitted?.occurredAt).toBe('2026-09-19T22:00:00.000Z');
    });

    it('stores the URL normalized', async () => {
      const result = await create({
        url: 'HTTPS://Jobs.Siemens.com/job/1/?utm_source=linkedin#top',
      });
      expect(result.application.url).toBe('https://jobs.siemens.com/job/1');
    });
  });

  describe('duplicate detection', () => {
    it('returns the existing application for a known URL and creates nothing', async () => {
      const first = await create({ url: 'https://jobs.siemens.com/job/1' });
      const before = await countRows();

      const second = await create({
        companyName: 'Other GmbH',
        title: 'Something else',
        url: 'https://JOBS.siemens.com/job/1/?utm_campaign=x',
      });

      expect(second.duplicate).toBe(true);
      expect(second.application.id).toBe(first.application.id);
      expect(await countRows()).toEqual(before);
    });

    it('warns (without blocking) when company + title + location match and there is no URL', async () => {
      const first = await create({ title: 'Backend Developer', location: 'Munich' });
      const second = await create({ title: 'backend developer', location: 'munich' });

      expect(second.duplicate).toBe(false);
      expect(second.application.id).not.toBe(first.application.id);
      expect(second.warnings).toEqual([
        expect.objectContaining({
          code: 'POSSIBLE_DUPLICATE',
          applicationId: first.application.id,
        }),
      ]);

      const differentLocation = await create({ title: 'Backend Developer', location: 'Berlin' });
      expect(differentLocation.warnings).toEqual([]);
    });
  });

  describe('changeStatus', () => {
    it('records STATUS_CHANGED with from/to', async () => {
      const { application } = await create({ status: 'APPLIED' });
      ctx.clock.set('2026-10-10T08:00:00.000Z');

      const updated = await service.changeStatus(
        application.id,
        changeStatusSchema.parse({ status: 'INTERVIEW', note: 'Invited to first round' }),
      );

      expect(updated.status).toBe('INTERVIEW');
      expect(updated.lastActivityAt).toBe('2026-10-10T08:00:00.000Z');
      const changed = (await events.timeline(application.id)).find(
        (e) => e.type === 'STATUS_CHANGED',
      );
      expect(changed).toMatchObject({
        metadata: { from: 'APPLIED', to: 'INTERVIEW' },
        description: 'Invited to first round',
        occurredAt: '2026-10-10T08:00:00.000Z',
      });
    });

    it.each([
      ['REJECTED', 'REJECTION'],
      ['OFFER', 'OFFER'],
      ['WITHDRAWN', 'WITHDRAWN'],
    ] as const)('→ %s also records %s', async (status, semantic) => {
      const { application } = await create({ status: 'INTERVIEW' });
      await service.changeStatus(application.id, changeStatusSchema.parse({ status }));

      expect(await timelineTypes(application.id)).toEqual(
        ['APPLICATION_SUBMITTED', 'CREATED', 'STATUS_CHANGED', semantic].sort(),
      );
    });

    it('SAVED → APPLIED records APPLICATION_SUBMITTED and sets appliedAt', async () => {
      const { application } = await create({ status: 'SAVED' });
      const updated = await service.changeStatus(
        application.id,
        changeStatusSchema.parse({ status: 'APPLIED', occurredAt: '2026-10-02' }),
      );

      expect(updated.appliedAt).toBe('2026-10-01T22:00:00.000Z');
      expect(await timelineTypes(application.id)).toEqual(
        ['APPLICATION_SUBMITTED', 'CREATED', 'STATUS_CHANGED'].sort(),
      );
    });

    it('does not overwrite an existing appliedAt', async () => {
      const { application } = await create({ status: 'SAVED', appliedAt: '2026-09-01' });
      const updated = await service.changeStatus(
        application.id,
        changeStatusSchema.parse({ status: 'APPLIED' }),
      );
      expect(updated.appliedAt).toBe('2026-08-31T22:00:00.000Z');
    });

    it('records no semantic event for other transitions, and allows any transition', async () => {
      const { application } = await create({ status: 'REJECTED' });
      await service.changeStatus(application.id, changeStatusSchema.parse({ status: 'SCREENING' }));
      expect(await timelineTypes(application.id)).toEqual(
        ['APPLICATION_SUBMITTED', 'CREATED', 'STATUS_CHANGED'].sort(),
      );
    });

    it('is a no-op when the status is unchanged', async () => {
      const { application } = await create({ status: 'APPLIED' });
      const before = await countRows();

      const result = await service.changeStatus(
        application.id,
        changeStatusSchema.parse({ status: 'APPLIED' }),
      );

      expect(result.status).toBe('APPLIED');
      expect(await countRows()).toEqual(before);
    });

    it('is atomic: if writing events fails, the status is not changed', async () => {
      const { application } = await create({ status: 'APPLIED' });
      const before = await countRows();
      jest
        .spyOn(ctx.module.get(EventsRepository), 'createMany')
        .mockRejectedValueOnce(new Error('simulated failure'));

      await expect(
        service.changeStatus(application.id, changeStatusSchema.parse({ status: 'REJECTED' })),
      ).rejects.toThrow('simulated failure');

      expect((await service.get(application.id)).status).toBe('APPLIED');
      expect(await countRows()).toEqual(before);
    });

    it('is atomic on create: a failure leaves no company, application or events', async () => {
      jest
        .spyOn(ctx.module.get(EventsRepository), 'createMany')
        .mockRejectedValueOnce(new Error('simulated failure'));

      await expect(create({ companyName: 'Brand New AG', status: 'APPLIED' })).rejects.toThrow(
        'simulated failure',
      );
      expect(await countRows()).toEqual({ applications: 0, events: 0, companies: 0 });
    });

    it('throws NotFoundError for an unknown application', async () => {
      await expect(
        service.changeStatus('missing', changeStatusSchema.parse({ status: 'APPLIED' })),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('update', () => {
    it('updates fields, moves company and clears values', async () => {
      const { application } = await create({ location: 'Munich', notes: 'old' });
      const updated = await service.update(
        application.id,
        updateApplicationSchema.parse({ companyName: 'BMW', title: 'Senior Engineer', notes: '' }),
      );

      expect(updated).toMatchObject({ title: 'Senior Engineer', notes: null, location: 'Munich' });
      expect(updated.company.name).toBe('BMW');
    });

    it('rejects a URL already used by another application', async () => {
      await create({ url: 'https://example.com/job/1' });
      const { application } = await create({ title: 'Other', url: 'https://example.com/job/2' });

      await expect(
        service.update(
          application.id,
          updateApplicationSchema.parse({ url: 'https://example.com/job/1?utm_source=x' }),
        ),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('cannot change status (schema rejects it)', () => {
      expect(updateApplicationSchema.safeParse({ status: 'OFFER' }).success).toBe(false);
    });
  });

  describe('list', () => {
    it('filters by search, status and company, and sorts', async () => {
      const a = await create({ companyName: 'Siemens', title: 'Backend', status: 'APPLIED' });
      ctx.clock.set('2026-10-05T10:00:00.000Z');
      await create({ companyName: 'BMW', title: 'Frontend', status: 'SAVED' });

      expect((await service.list()).map((x) => x.title)).toEqual(['Frontend', 'Backend']);
      expect((await service.list({ search: 'siem' })).map((x) => x.title)).toEqual(['Backend']);
      expect((await service.list({ status: ['SAVED'] })).map((x) => x.title)).toEqual(['Frontend']);
      expect(
        (await service.list({ companyId: a.application.company.id })).map((x) => x.title),
      ).toEqual(['Backend']);
      expect(
        (await service.list({ sort: 'company', order: 'asc' })).map((x) => x.company.name),
      ).toEqual(['BMW', 'Siemens']);
    });

    it('filters by applied date range, inclusive of the end day', async () => {
      await create({ title: 'Early', status: 'APPLIED', appliedAt: '2026-09-01' });
      await create({ title: 'Late', status: 'APPLIED', appliedAt: '2026-09-30' });

      const parse = (q: object) => service.list(applicationListQuerySchema.parse(q));
      expect((await parse({ appliedFrom: '2026-09-15' })).map((x) => x.title)).toEqual(['Late']);
      expect((await parse({ appliedTo: '2026-09-30' })).map((x) => x.title).sort()).toEqual([
        'Early',
        'Late',
      ]);
      expect((await parse({ appliedTo: '2026-09-29' })).map((x) => x.title)).toEqual(['Early']);
    });
  });
});
