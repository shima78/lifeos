'use client';

import type { ApplicationEventDto } from '@lifeos/contracts';
import { ArrowLeft, Building2, ExternalLink, Mail, MapPin, Pencil, Plus, User } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { AddEventDialog, VoidEventDialog } from '@/components/event-dialogs';
import { EmptyState, ErrorState, LoadingRows } from '@/components/states';
import { StatusMenu } from '@/components/status-menu';
import { ApplicationTasksCard } from '@/components/tasks/task-cards';
import { Timeline } from '@/components/timeline';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatDateOrDash, isOverdue, relativeDays } from '@/lib/format';
import { useApplication, useTimeline } from '@/lib/queries';
import { cn } from '@/lib/utils';

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const application = useApplication(id);
  const timeline = useTimeline(id);
  const [addOpen, setAddOpen] = useState(false);
  const [voiding, setVoiding] = useState<ApplicationEventDto | null>(null);

  if (application.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-16 w-2/3" />
        <LoadingRows rows={6} />
      </div>
    );
  }
  if (application.error) {
    return (
      <Card>
        <ErrorState error={application.error} onRetry={() => void application.refetch()} />
      </Card>
    );
  }

  const app = application.data;
  const nextOverdue = app.nextActionDate !== null && isOverdue(app.nextActionDate);

  return (
    <>
      <Link
        href="/applications"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Applications
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{app.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <Link
              href={`/companies/${app.company.id}`}
              className="inline-flex items-center gap-1.5 hover:text-foreground"
            >
              <Building2 className="size-4" /> {app.company.name}
            </Link>
            {app.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" /> {app.location}
              </span>
            )}
            {app.employmentType && <span>{app.employmentType}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusMenu application={app} />
          {app.url && (
            <Button asChild variant="outline" size="sm">
              <a href={app.url} target="_blank" rel="noreferrer">
                <ExternalLink /> Posting
              </a>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href={`/applications/${app.id}/edit`}>
              <Pencil /> Edit
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* Timeline */}
        <Card className="order-2 lg:order-1">
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus /> Add event
            </Button>
          </CardHeader>
          <CardContent>
            {timeline.isPending ? (
              <LoadingRows rows={4} />
            ) : timeline.error ? (
              <ErrorState error={timeline.error} onRetry={() => void timeline.refetch()} />
            ) : timeline.data.length === 0 ? (
              <EmptyState title="No events yet" />
            ) : (
              <Timeline events={timeline.data} onVoid={setVoiding} />
            )}
          </CardContent>
        </Card>

        {/* Side panel */}
        <div className="order-1 flex flex-col gap-6 lg:order-2">
          <Card>
            <CardContent className="pt-5">
              <dl className="flex flex-col gap-4">
                <Detail label="Applied">{formatDateOrDash(app.appliedAt)}</Detail>
                <Detail label="Next action">
                  {app.nextAction || app.nextActionDate ? (
                    <>
                      <span>{app.nextAction ?? 'Next action'}</span>
                      {app.nextActionDate && (
                        <span
                          className={cn(
                            'block text-xs text-muted-foreground',
                            nextOverdue && 'font-medium text-destructive',
                          )}
                        >
                          {formatDate(app.nextActionDate)} · {relativeDays(app.nextActionDate)}
                        </span>
                      )}
                    </>
                  ) : (
                    '—'
                  )}
                </Detail>
                <Detail label="Recruiter">
                  {app.recruiterName || app.recruiterEmail ? (
                    <span className="flex flex-col gap-1">
                      {app.recruiterName && (
                        <span className="inline-flex items-center gap-1.5">
                          <User className="size-3.5 text-muted-foreground" /> {app.recruiterName}
                        </span>
                      )}
                      {app.recruiterEmail && (
                        <a
                          href={`mailto:${app.recruiterEmail}`}
                          className="inline-flex items-center gap-1.5 text-primary hover:underline"
                        >
                          <Mail className="size-3.5" /> {app.recruiterEmail}
                        </a>
                      )}
                    </span>
                  ) : (
                    '—'
                  )}
                </Detail>
                <Detail label="Last activity">
                  {app.lastActivityAt
                    ? `${formatDate(app.lastActivityAt)} · ${relativeDays(app.lastActivityAt)}`
                    : '—'}
                </Detail>
                <Detail label="Notes">
                  {app.notes ? <span className="whitespace-pre-line">{app.notes}</span> : '—'}
                </Detail>
              </dl>
            </CardContent>
          </Card>

          <ApplicationTasksCard applicationId={app.id} />

          {app.description && (
            <Card>
              <CardHeader>
                <CardTitle>Job description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="max-h-80 overflow-y-auto text-sm whitespace-pre-line text-muted-foreground">
                  {app.description}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <AddEventDialog applicationId={app.id} open={addOpen} onOpenChange={setAddOpen} />
      <VoidEventDialog applicationId={app.id} event={voiding} onClose={() => setVoiding(null)} />
    </>
  );
}
