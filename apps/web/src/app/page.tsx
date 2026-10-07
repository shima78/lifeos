'use client';

import { type DashboardDto, toBerlinTimeString } from '@lifeos/contracts';
import { ArrowRight, CircleCheck, Plus } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { StatusBreakdown } from '@/components/charts/pipeline-chart';
import { DailyGoalChart, DailyGoalLegend, goalStreak } from '@/components/charts/daily-goal-chart';
import { Sparkline } from '@/components/charts/weekly-chart';
import { EventIcon } from '@/components/event-icon';
import { EmptyState, ErrorState } from '@/components/states';
import { TodayTasksCard } from '@/components/tasks/task-cards';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatDateTime, relativeDays } from '@/lib/format';
import { useDashboard } from '@/lib/queries';
import { cn } from '@/lib/utils';

/**
 * A status change and its implied event (e.g. Rejected) share a timestamp; show only the more
 * specific one in the activity feed.
 */
function collapseActivity(items: DashboardDto['recentActivity']): DashboardDto['recentActivity'] {
  const key = (i: DashboardDto['recentActivity'][number]) =>
    `${i.application.id}|${i.event.occurredAt}`;
  const hasSemantic = new Set(items.filter((i) => i.event.type !== 'STATUS_CHANGED').map(key));
  return items.filter((i) => i.event.type !== 'STATUS_CHANGED' || !hasSemantic.has(key(i)));
}

function greeting(now: Date): string {
  const hour = Number(toBerlinTimeString(now).slice(0, 2));
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('flex min-w-0 flex-col', className)}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className="flex flex-1 flex-col px-5 pb-5">{children}</div>
    </Card>
  );
}

function StatTile({
  label,
  value,
  caption,
  href,
  aside,
}: {
  label: string;
  value: string | number;
  caption?: ReactNode;
  href: string;
  aside?: ReactNode;
}) {
  return (
    <Link href={href} className="group">
      <Card className="flex h-full items-end justify-between gap-2 p-4 transition-colors group-hover:border-foreground/20">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">{value}</p>
          {caption && <p className="mt-1 truncate text-xs text-muted-foreground">{caption}</p>}
        </div>
        {aside}
      </Card>
    </Link>
  );
}

/** One goal figure: label, value against target, and a meter (fill on a lighter step of the same hue). */
function GoalMeter({ label, value, target }: { label: string; value: number; target: number }) {
  const met = value >= target;
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {met && <CircleCheck className="size-3.5 text-signal-good" aria-label="Goal met" />}
      </p>
      <p className="mt-1 text-lg font-semibold tracking-tight">
        {value}
        <span className="text-sm font-normal text-muted-foreground"> / {target}</span>
      </p>
      <div
        className="mt-1.5 h-1.5 rounded-full bg-chart-series/15"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={value}
      >
        <div className="h-1.5 rounded-full bg-chart-series" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function GoalSummary({ data }: { data: DashboardDto }) {
  const { goal, dailyApplications } = data;
  const daysMet = dailyApplications.filter((d) => d.count >= goal.perDay).length;
  const streak = goalStreak(dailyApplications, goal.perDay);
  return (
    <div className="mb-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
      <GoalMeter label="Today" value={goal.today} target={goal.perDay} />
      <GoalMeter label="This week" value={goal.thisWeek} target={goal.perWeek} />
      <div>
        <p className="text-xs text-muted-foreground">Days on goal</p>
        <p className="mt-1 text-lg font-semibold tracking-tight">
          {daysMet}
          <span className="text-sm font-normal text-muted-foreground">
            {' '}
            of {dailyApplications.length}
          </span>
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Streak</p>
        <p className="mt-1 text-lg font-semibold tracking-tight">
          {streak}
          <span className="text-sm font-normal text-muted-foreground">
            {' '}
            {streak === 1 ? 'day' : 'days'}
          </span>
        </p>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="h-12 w-72" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}

function Header({ data }: { data: DashboardDto }) {
  const now = new Date();
  return (
    <div className="mb-6">
      <div>
        <p className="text-sm text-muted-foreground">{formatDate(now)}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{greeting(now)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.stats.active} active {data.stats.active === 1 ? 'application' : 'applications'}
        </p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data, error, isPending, refetch } = useDashboard();

  if (isPending) return <DashboardSkeleton />;
  if (error) {
    return (
      <Card>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Card>
    );
  }
  if (data.stats.total === 0) {
    return (
      <Card>
        <EmptyState
          title="Nothing tracked yet"
          description="Add your first application, or ask Claude to add one for you."
          action={
            <Button asChild>
              <Link href="/applications/new">
                <Plus /> Add application
              </Link>
            </Button>
          }
        />
      </Card>
    );
  }

  const { stats } = data;
  const responseRate =
    stats.responseRate === null ? '—' : `${Math.round(stats.responseRate * 100)}%`;

  return (
    <>
      <Header data={data} />

      <div className="flex flex-col gap-6">
        {/* Key numbers */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
          <StatTile
            label="Applications"
            value={stats.total}
            caption={`${data.goal.today}/${data.goal.perDay} today`}
            href="/applications"
            aside={<Sparkline data={data.weeklyApplications} />}
          />
          <StatTile
            label="Active"
            value={stats.active}
            caption="Applied, screening or interviewing"
            href="/applications?status=APPLIED&status=SCREENING&status=INTERVIEW"
          />
          <StatTile
            label="Response rate"
            value={responseRate}
            caption="Of submitted applications"
            href="/applications?status=SCREENING&status=INTERVIEW&status=OFFER&status=REJECTED"
          />
          <StatTile
            label="Interviews"
            value={stats.interviews}
            caption="In interview stage"
            href="/applications?status=INTERVIEW"
          />
          <StatTile
            label="Offers"
            value={stats.offers}
            caption="Received"
            href="/applications?status=OFFER"
          />
          <StatTile
            label="Rejections"
            value={stats.rejections}
            caption="So far"
            href="/applications?status=REJECTED"
          />
        </div>

        {/* Charts */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel
            title="Daily goal"
            description={`${data.goal.perDay} applications a day · last ${data.dailyApplications.length} days`}
            className="lg:col-span-2"
            action={<DailyGoalLegend />}
          >
            <GoalSummary data={data} />
            <DailyGoalChart data={data.dailyApplications} goal={data.goal.perDay} />
          </Panel>
          <Panel title="Pipeline" description="Applications by current status">
            <StatusBreakdown data={data.byStatus} total={stats.total} />
          </Panel>
        </div>

        {/* Tasks, upcoming interviews and recent activity */}
        <div className="grid gap-6 lg:grid-cols-3">
          <TodayTasksCard className="min-w-0" />
          <Panel title="Upcoming interviews">
            {data.upcomingInterviews.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">No interviews scheduled.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.upcomingInterviews.map(({ event, application }) => (
                  <li key={event.id}>
                    <Link
                      href={`/applications/${application.id}`}
                      className="flex items-center gap-3 rounded-lg border p-2.5 transition-colors hover:bg-accent"
                    >
                      <div className="grid w-11 shrink-0 place-items-center rounded-md bg-muted py-1">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase">
                          {formatDate(event.scheduledFor!).slice(3, 6)}
                        </span>
                        <span className="text-base leading-none font-semibold">
                          {formatDate(event.scheduledFor!).slice(0, 2)}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{application.company.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {toBerlinTimeString(event.scheduledFor!)} ·{' '}
                          {relativeDays(event.scheduledFor!)}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Recent activity"
            action={
              <Button asChild variant="ghost" size="sm" className="-mt-1 -mr-2">
                <Link href="/applications">
                  All <ArrowRight />
                </Link>
              </Button>
            }
          >
            <ul className="-mx-2 flex flex-col">
              {collapseActivity(data.recentActivity)
                .slice(0, 6)
                .map(({ event, application }) => (
                  <li key={event.id}>
                    <Link
                      href={`/applications/${application.id}`}
                      className="flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-accent"
                    >
                      <EventIcon type={event.type} className="size-7 ring-0 [&_svg]:size-3.5" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{event.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {application.company.name}
                        </p>
                      </div>
                      <span
                        className="shrink-0 text-xs text-muted-foreground"
                        title={formatDateTime(event.occurredAt)}
                      >
                        {relativeDays(event.occurredAt)}
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
