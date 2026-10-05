import { resolve } from 'node:path';
import { loadTrackerFile, seedDatabase, trackerToDataset } from '../prisma/seed';
import { ApplicationsService } from '../src/applications/applications.service';
import { DashboardService } from '../src/dashboard/dashboard.service';
import { EventsService } from '../src/events/events.service';
import { type TestContext, createTestContext } from '../src/test-utils/test-app';

/** Uses the fictional example rows; real tracker data stays local and is never committed. */
const EXAMPLE = resolve(__dirname, '../prisma/data/job-tracker.example.json');

describe('Job tracker seed', () => {
  const file = loadTrackerFile(EXAMPLE);
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
    ctx.clock.set('2026-10-04T10:00:00.000Z');
    await seedDatabase(ctx.prisma.client, file);
  });
  afterAll(() => ctx.module.close());

  it('imports every row with its status', async () => {
    const { stats } = await ctx.module.get(DashboardService).get();
    expect(stats).toMatchObject({ total: 4, interviews: 1, offers: 0, rejections: 1 });
  });

  it('merges company spelling variants case-insensitively', () => {
    const { companies } = trackerToDataset(file);
    expect(companies.map((c) => c.name)).toEqual(['Acme GmbH', 'Globex', 'Initech']);
  });

  it('keeps sheet details in notes, normalizes URLs and drops template text', () => {
    const { applications } = trackerToDataset(file);
    const [first, second, third] = applications;

    expect(first?.url).toBe('https://jobs.acme.example/123');
    expect(first?.nextAction).toBe('Follow up');
    expect(first?.notes).not.toContain('SAMPLE');
    expect(first?.notes).toContain('Note: Follow up after 7 days');
    expect(second?.url).toBeUndefined();
    expect(second?.notes).toContain('Job URL field: jobs@acme.example');
    expect(third?.title).toBe('Role not recorded');
  });

  it('builds a timeline with an honest date note for rejections', async () => {
    const rejected = await ctx.module.get(ApplicationsService).list({ status: ['REJECTED'] });
    expect(rejected).toHaveLength(1);
    const timeline = await ctx.module.get(EventsService).timeline(rejected[0]!.id);
    expect(timeline.map((e) => e.type).sort()).toEqual(
      ['APPLICATION_SUBMITTED', 'CREATED', 'REJECTION', 'STATUS_CHANGED'].sort(),
    );
    expect(timeline.find((e) => e.type === 'REJECTION')?.description).toMatch(
      /exact date not recorded/,
    );
  });
});
