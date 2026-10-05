import { createApplicationSchema, createEventSchema } from '@lifeos/contracts';
import { ApplicationsService } from '../applications/applications.service';
import { ConflictError, NotFoundError, ValidationError } from '../common/errors';
import { type TestContext, createTestContext, resetDatabase } from '../test-utils/test-app';
import { EventsRepository } from './events.repository';
import { EventsService } from './events.service';

describe('EventsService', () => {
  let ctx: TestContext;
  let service: EventsService;
  let applicationId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    service = ctx.module.get(EventsService);
  });
  afterAll(() => ctx.module.close());
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    ctx.clock.set('2026-10-04T10:00:00.000Z');
    const { application } = await ctx.module.get(ApplicationsService).create(
      createApplicationSchema.parse({
        companyName: 'SAP',
        title: 'Developer',
        status: 'APPLIED',
      }),
    );
    applicationId = application.id;
  });

  it('adds a manual event with a default title and the current time', async () => {
    ctx.clock.set('2026-10-06T09:00:00.000Z');
    const event = await service.add(
      applicationId,
      createEventSchema.parse({ type: 'RECRUITER_CONTACT', description: 'Call with Markus' }),
    );

    expect(event).toMatchObject({
      type: 'RECRUITER_CONTACT',
      title: 'Recruiter contact',
      description: 'Call with Markus',
      occurredAt: '2026-10-06T09:00:00.000Z',
      voidedAt: null,
    });
  });

  it('requires scheduledFor for INTERVIEW_SCHEDULED', async () => {
    await expect(
      service.add(applicationId, { type: 'INTERVIEW_SCHEDULED' }),
    ).rejects.toBeInstanceOf(ValidationError);

    const ok = await service.add(
      applicationId,
      createEventSchema.parse({
        type: 'INTERVIEW_SCHEDULED',
        scheduledFor: '2026-10-08T12:00:00.000Z',
      }),
    );
    expect(ok.scheduledFor).toBe('2026-10-08T12:00:00.000Z');
  });

  it('returns the timeline newest first, including voided events', async () => {
    await service.add(
      applicationId,
      createEventSchema.parse({ type: 'NOTE', occurredAt: '2026-10-01' }),
    );
    await service.add(
      applicationId,
      createEventSchema.parse({ type: 'FOLLOW_UP', occurredAt: '2026-10-09' }),
    );

    const timeline = await service.timeline(applicationId);
    const times = timeline.map((e) => e.occurredAt);
    expect([...times].sort().reverse()).toEqual(times);
    expect(timeline[0]?.type).toBe('FOLLOW_UP');
  });

  it('voids an event: the row stays, gets voidedAt/voidReason and stops counting as activity', async () => {
    ctx.clock.set('2026-10-08T10:00:00.000Z');
    const event = await service.add(applicationId, createEventSchema.parse({ type: 'NOTE' }));
    expect((await ctx.module.get(ApplicationsService).get(applicationId)).lastActivityAt).toBe(
      '2026-10-08T10:00:00.000Z',
    );

    const voided = await service.void(applicationId, event.id, { reason: 'Logged on wrong job' });

    expect(voided).toMatchObject({
      id: event.id,
      voidReason: 'Logged on wrong job',
      voidedAt: '2026-10-08T10:00:00.000Z',
    });
    const timeline = await service.timeline(applicationId);
    expect(timeline.find((e) => e.id === event.id)?.voidedAt).not.toBeNull();
    expect((await ctx.module.get(ApplicationsService).get(applicationId)).lastActivityAt).toBe(
      '2026-10-04T10:00:00.000Z',
    );
  });

  it('cannot void twice, or void an event of another application', async () => {
    const event = await service.add(applicationId, createEventSchema.parse({ type: 'NOTE' }));
    await service.void(applicationId, event.id, { reason: 'mistake' });

    await expect(service.void(applicationId, event.id, { reason: 'again' })).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(service.void('other-app', event.id, { reason: 'x' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('throws NotFoundError for an unknown application', async () => {
    await expect(service.timeline('missing')).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      service.add('missing', createEventSchema.parse({ type: 'NOTE' })),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  describe('append-only guarantees', () => {
    const mutators = /^(update|delete|remove|edit|patch|upsert|destroy)/i;
    const methodsOf = (obj: object) =>
      Object.getOwnPropertyNames(Object.getPrototypeOf(obj)).filter((m) => m !== 'constructor');

    it('no service or repository method can update or delete an event', () => {
      expect(methodsOf(service).filter((m) => mutators.test(m))).toEqual([]);
      expect(methodsOf(ctx.module.get(EventsRepository)).filter((m) => mutators.test(m))).toEqual(
        [],
      );
    });

    it('the database rejects edits and deletes, even bypassing the services', async () => {
      const event = await service.add(applicationId, createEventSchema.parse({ type: 'NOTE' }));
      const events = ctx.prisma.client.applicationEvent;

      await expect(
        events.update({ where: { id: event.id }, data: { title: 'edited' } }),
      ).rejects.toThrow(/append-only/);
      await expect(events.delete({ where: { id: event.id } })).rejects.toThrow(/append-only/);

      await service.void(applicationId, event.id, { reason: 'mistake' });
      await expect(
        events.update({ where: { id: event.id }, data: { voidedAt: null, voidReason: null } }),
      ).rejects.toThrow(/append-only/);
      expect(await events.count({ where: { id: event.id } })).toBe(1);
    });
  });
});
