import {
  APPLICATION_STATUSES,
  type DashboardDto,
  type EventWithApplicationDto,
  type ApplicationStatus,
  type NeedsAttentionItemDto,
  berlinWeekStart,
  toBerlinDateString,
  isActiveStatus,
} from '@lifeos/contracts';
import { Injectable } from '@nestjs/common';
import { toApplicationSummaryDto } from '../applications/application.mapper';
import { ApplicationsRepository } from '../applications/applications.repository';
import { Clock } from '../common/clock';
import { DAY_MS } from '../common/dates';
import { toEventDto } from '../events/event.mapper';
import { type EventWithApplication, EventsRepository } from '../events/events.repository';
import {
  UPCOMING_INTERVIEW_WINDOW_DAYS,
  attentionReasons,
  compareUrgency,
} from './attention.rules';

export const RECENT_ACTIVITY_LIMIT = 10;
export const UPCOMING_INTERVIEWS_LIMIT = 10;
/** Weeks shown in the applications-per-week chart (current week included). */
export const WEEKLY_CHART_WEEKS = 8;
/** Days shown in the daily goal chart (today included). */
export const DAILY_CHART_DAYS = 30;

/** Daily application goal from APPLICATION_GOAL_PER_DAY (positive integer), default 3. */
export function applicationGoalPerDay(): number {
  const value = Number(process.env.APPLICATION_GOAL_PER_DAY);
  return Number.isInteger(value) && value > 0 ? value : 3;
}

/** Statuses that mean the company answered. */
const RESPONDED_STATUSES: readonly ApplicationStatus[] = [
  'SCREENING',
  'INTERVIEW',
  'OFFER',
  'REJECTED',
];

const withApplication = (e: EventWithApplication): EventWithApplicationDto => ({
  event: toEventDto(e),
  application: toApplicationSummaryDto(e.application),
});

@Injectable()
export class DashboardService {
  constructor(
    private readonly applications: ApplicationsRepository,
    private readonly events: EventsRepository,
    private readonly clock: Clock,
  ) {}

  async get(): Promise<DashboardDto> {
    const now = this.clock.now();
    const [apps, upcoming, recent] = await Promise.all([
      this.applications.findAll(),
      this.events.findScheduledInterviews(now),
      this.events.findRecent(RECENT_ACTIVITY_LIMIT),
    ]);

    const counts = new Map(APPLICATION_STATUSES.map((s) => [s, 0]));
    for (const app of apps) counts.set(app.status, (counts.get(app.status) ?? 0) + 1);

    const interviewWindowEnd = now.getTime() + UPCOMING_INTERVIEW_WINDOW_DAYS * DAY_MS;
    const interviewsByApp = new Map<string, Date[]>();
    for (const e of upcoming) {
      if (!e.scheduledFor || e.scheduledFor.getTime() > interviewWindowEnd) continue;
      interviewsByApp.set(e.applicationId, [
        ...(interviewsByApp.get(e.applicationId) ?? []),
        e.scheduledFor,
      ]);
    }

    const needsAttention: NeedsAttentionItemDto[] = apps
      .map((app) => ({
        application: toApplicationSummaryDto(app),
        reasons: attentionReasons(
          {
            status: app.status,
            lastActivityAt: app.lastActivityAt,
            nextActionDate: app.nextActionDate,
            interviewDates: interviewsByApp.get(app.id) ?? [],
          },
          now,
        ),
      }))
      .filter((item) => item.reasons.length > 0)
      .sort((a, b) => compareUrgency(a.reasons, b.reasons));

    const submitted = apps.filter((a) => a.appliedAt !== null);
    const responded = submitted.filter((a) => RESPONDED_STATUSES.includes(a.status)).length;

    const weekCounts = new Map<string, number>();
    for (const a of submitted) {
      const week = berlinWeekStart(a.appliedAt!);
      weekCounts.set(week, (weekCounts.get(week) ?? 0) + 1);
    }
    const thisWeek = berlinWeekStart(now);
    const weeklyApplications = Array.from({ length: WEEKLY_CHART_WEEKS }, (_, i) => {
      const weekStart = berlinWeekStart(now, i - (WEEKLY_CHART_WEEKS - 1));
      return { weekStart, count: weekCounts.get(weekStart) ?? 0 };
    });

    const dayCounts = new Map<string, number>();
    for (const a of submitted) {
      const day = toBerlinDateString(a.appliedAt!);
      dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    }
    const today = toBerlinDateString(now);
    const [ty, tm, td] = today.split('-').map(Number);
    const dailyApplications = Array.from({ length: DAILY_CHART_DAYS }, (_, i) => {
      const date = new Date(
        Date.UTC(ty ?? 0, (tm ?? 1) - 1, (td ?? 1) - (DAILY_CHART_DAYS - 1 - i)),
      )
        .toISOString()
        .slice(0, 10);
      return { date, count: dayCounts.get(date) ?? 0 };
    });
    const perDay = applicationGoalPerDay();

    return {
      stats: {
        total: apps.length,
        active: apps.filter((a) => isActiveStatus(a.status)).length,
        interviews: counts.get('INTERVIEW') ?? 0,
        offers: counts.get('OFFER') ?? 0,
        rejections: counts.get('REJECTED') ?? 0,
        appliedThisWeek: weekCounts.get(thisWeek) ?? 0,
        responseRate: submitted.length ? responded / submitted.length : null,
      },
      byStatus: APPLICATION_STATUSES.map((status) => ({ status, count: counts.get(status) ?? 0 })),
      weeklyApplications,
      dailyApplications,
      goal: {
        perDay,
        today: dayCounts.get(today) ?? 0,
        perWeek: perDay * 7,
        thisWeek: weekCounts.get(thisWeek) ?? 0,
      },
      needsAttention,
      upcomingInterviews: upcoming.slice(0, UPCOMING_INTERVIEWS_LIMIT).map(withApplication),
      recentActivity: recent.map(withApplication),
    };
  }
}
