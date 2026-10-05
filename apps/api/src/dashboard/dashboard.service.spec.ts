import { seedDemoData } from '../../test/fixtures/demo-data';
import { type TestContext, createTestContext, resetDatabase } from '../test-utils/test-app';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let ctx: TestContext;
  let service: DashboardService;
  const NOW = new Date('2026-10-04T10:00:00.000Z');

  beforeAll(async () => {
    ctx = await createTestContext();
    service = ctx.module.get(DashboardService);
  });
  afterAll(() => ctx.module.close());

  it('returns zeros for an empty database', async () => {
    await resetDatabase(ctx.prisma);
    const dashboard = await service.get();
    expect(dashboard.stats).toEqual({
      total: 0,
      active: 0,
      interviews: 0,
      offers: 0,
      rejections: 0,
      appliedThisWeek: 0,
      responseRate: null,
    });
    expect(dashboard.weeklyApplications).toHaveLength(8);
    expect(dashboard.weeklyApplications.every((w) => w.count === 0)).toBe(true);
    expect(dashboard.needsAttention).toEqual([]);
    expect(dashboard.recentActivity).toEqual([]);
  });

  describe('with seed data', () => {
    beforeAll(async () => {
      await seedDemoData(ctx.prisma.client, NOW);
      ctx.clock.set(NOW);
    });

    it('counts match the seeded data', async () => {
      const { stats, byStatus } = await service.get();

      expect(stats).toEqual({
        total: 12,
        active: 6,
        interviews: 2,
        offers: 1,
        rejections: 2,
        appliedThisWeek: 1,
        // 10 submitted; 6 answered (1 screening, 2 interviews, 1 offer, 2 rejections).
        responseRate: 0.6,
      });
      expect(Object.fromEntries(byStatus.map((s) => [s.status, s.count]))).toEqual({
        SAVED: 2,
        APPLIED: 3,
        SCREENING: 1,
        INTERVIEW: 2,
        OFFER: 1,
        REJECTED: 2,
        WITHDRAWN: 1,
      });
    });

    it('counts applications per Berlin week (Monday start), oldest first', async () => {
      const { weeklyApplications } = await service.get();
      expect(weeklyApplications).toEqual([
        { weekStart: '2026-08-10', count: 2 },
        { weekStart: '2026-08-17', count: 1 },
        { weekStart: '2026-08-24', count: 2 },
        { weekStart: '2026-08-31', count: 1 },
        { weekStart: '2026-09-07', count: 2 },
        { weekStart: '2026-09-14', count: 1 },
        { weekStart: '2026-09-21', count: 0 },
        { weekStart: '2026-09-28', count: 1 },
      ]);
    });

    it('counts applications per Berlin day for the last 30 days and reports goal progress', async () => {
      const { dailyApplications, goal } = await service.get();
      expect(dailyApplications).toHaveLength(30);
      expect(dailyApplications[0]?.date).toBe('2026-09-05');
      expect(dailyApplications.at(-1)).toEqual({ date: '2026-10-04', count: 0 });
      // Applied 9, 12, 18 and 28 Sep fall inside the window (4 Sep is just outside).
      expect(dailyApplications.filter((d) => d.count > 0).map((d) => d.date)).toEqual([
        '2026-09-09',
        '2026-09-12',
        '2026-09-18',
        '2026-09-28',
      ]);
      expect(goal).toEqual({ perDay: 3, today: 0, perWeek: 21, thisWeek: 1 });
    });

    it('reads the daily goal from APPLICATION_GOAL_PER_DAY', async () => {
      process.env.APPLICATION_GOAL_PER_DAY = '5';
      try {
        expect((await service.get()).goal).toMatchObject({ perDay: 5, perWeek: 35 });
      } finally {
        delete process.env.APPLICATION_GOAL_PER_DAY;
      }
    });

    it('lists every needs-attention case, most urgent first, excluding terminal applications', async () => {
      const { needsAttention } = await service.get();
      const summary = needsAttention.map((n) => [
        `${n.application.company.name}: ${n.application.title}`,
        n.reasons.map((r) => r.message),
      ]);

      expect(summary).toEqual([
        [
          'Siemens: Software Engineer, Industrial IoT',
          ['Interview in 3 days', 'Next action due in 2 days'],
        ],
        ['Bosch: Software Engineer, Automated Driving', ['Interview in 6 days']],
        [
          'BMW: Frontend Engineer (React)',
          ['Next action overdue by 1 day', 'No response for 18 days'],
        ],
        ['SAP: Cloud Engineer', ['Next action due in 2 days']],
        ['Siemens: Backend Developer (Node.js)', ['No response for 25 days']],
        ['SAP: Senior TypeScript Developer', ['No response for 16 days']],
      ]);
      // The SAP offer has a next action due in 2 days but is terminal.
      expect(summary.some(([name]) => String(name).includes('SAP BTP'))).toBe(false);
    });

    it('lists upcoming interviews without voided events', async () => {
      const { upcomingInterviews } = await service.get();
      expect(upcomingInterviews.map((i) => i.application.company.name)).toEqual([
        'Siemens',
        'Bosch',
      ]);
      expect(upcomingInterviews.every((i) => i.event.voidedAt === null)).toBe(true);
    });

    it('shows the 10 latest non-voided events as recent activity', async () => {
      const { recentActivity } = await service.get();
      expect(recentActivity).toHaveLength(10);
      expect(recentActivity.every((a) => a.event.voidedAt === null)).toBe(true);
      const times = recentActivity.map((a) => a.event.occurredAt);
      expect([...times].sort().reverse()).toEqual(times);
    });
  });
});
