import { createApplicationSchema, createTaskSchema, updateTaskSchema } from '@lifeos/contracts';
import { ApplicationsService } from '../applications/applications.service';
import { NotFoundError } from '../common/errors';
import { type TestContext, createTestContext, resetDatabase } from '../test-utils/test-app';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  let ctx: TestContext;
  let service: TasksService;

  const add = (input: Parameters<typeof createTaskSchema.parse>[0]) =>
    service.create(createTaskSchema.parse(input));

  beforeAll(async () => {
    ctx = await createTestContext();
    service = ctx.module.get(TasksService);
  });
  afterAll(() => ctx.module.close());
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    ctx.clock.set('2026-10-06T10:00:00.000Z'); // Tuesday, noon in Berlin
  });

  it('creates a task with defaults', async () => {
    const task = await add({ title: 'Update CV' });
    expect(task).toMatchObject({
      title: 'Update CV',
      status: 'TODO',
      priority: 'MEDIUM',
      dueDate: null,
      completedAt: null,
      bucket: 'someday',
      application: null,
    });
  });

  it('buckets by Berlin calendar day', async () => {
    await add({ title: 'late', dueDate: '2026-10-05' });
    await add({ title: 'now', dueDate: '2026-10-06' });
    await add({ title: 'soon', dueDate: '2026-10-09' });
    await add({ title: 'whenever' });
    await add({ title: 'finished', status: 'DONE', dueDate: '2026-10-01' });

    const byTitle = Object.fromEntries((await service.list()).map((t) => [t.title, t.bucket]));
    expect(byTitle).toEqual({
      late: 'overdue',
      now: 'today',
      soon: 'upcoming',
      whenever: 'someday',
      finished: 'done',
    });
  });

  it('orders overdue → today → upcoming → someday → done, high priority first on the same day', async () => {
    await add({ title: 'someday' });
    await add({ title: 'today low', dueDate: '2026-10-06', priority: 'LOW' });
    await add({ title: 'today high', dueDate: '2026-10-06', priority: 'HIGH' });
    await add({ title: 'overdue', dueDate: '2026-10-01' });
    await add({ title: 'done', status: 'DONE' });

    expect((await service.list()).map((t) => t.title)).toEqual([
      'overdue',
      'today high',
      'today low',
      'someday',
      'done',
    ]);
  });

  it('filters by bucket, status and search', async () => {
    await add({ title: 'Call recruiter', dueDate: '2026-10-06' });
    await add({ title: 'Write cover letter', dueDate: '2026-10-01' });
    await add({ title: 'Old', status: 'DONE' });

    const q = (query: object) => service.list(query);
    expect((await q({ bucket: ['today', 'overdue'] })).map((t) => t.title)).toEqual([
      'Write cover letter',
      'Call recruiter',
    ]);
    expect((await q({ status: ['DONE'] })).map((t) => t.title)).toEqual(['Old']);
    expect((await q({ search: 'recruiter' })).map((t) => t.title)).toEqual(['Call recruiter']);
  });

  it('stamps completedAt when done and clears it when reopened', async () => {
    const task = await add({ title: 'Send follow-up' });
    ctx.clock.set('2026-10-06T15:00:00.000Z');

    const done = await service.update(task.id, updateTaskSchema.parse({ status: 'DONE' }));
    expect(done).toMatchObject({
      status: 'DONE',
      completedAt: '2026-10-06T15:00:00.000Z',
      bucket: 'done',
    });

    const reopened = await service.update(task.id, updateTaskSchema.parse({ status: 'TODO' }));
    expect(reopened).toMatchObject({ status: 'TODO', completedAt: null });
  });

  it('links to an application and lists by application', async () => {
    const { application } = await ctx.module
      .get(ApplicationsService)
      .create(
        createApplicationSchema.parse({ companyName: 'Acme GmbH', title: 'Frontend Engineer' }),
      );

    const task = await add({ title: 'Prepare for interview', applicationId: application.id });
    expect(task.application).toMatchObject({ id: application.id, company: { name: 'Acme GmbH' } });
    expect(await service.list({ applicationId: application.id })).toHaveLength(1);

    const unlinked = await service.update(task.id, updateTaskSchema.parse({ applicationId: '' }));
    expect(unlinked.application).toBeNull();
  });

  it('rejects unknown applications and tasks', async () => {
    await expect(add({ title: 'x', applicationId: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.get('nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.delete('nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deletes a task', async () => {
    const task = await add({ title: 'Temporary' });
    await service.delete(task.id);
    await expect(service.get(task.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
