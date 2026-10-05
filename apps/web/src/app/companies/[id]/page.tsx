'use client';

import { ArrowLeft, ExternalLink, MapPin, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/states';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDateOrDash, relativeDays } from '@/lib/format';
import { useCompany } from '@/lib/queries';

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, isPending, refetch } = useCompany(id);

  return (
    <>
      <Link
        href="/companies"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Companies
      </Link>

      {isPending ? (
        <LoadingRows rows={5} />
      ) : error ? (
        <Card>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Card>
      ) : (
        <>
          <PageHeader
            title={data.name}
            description={
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {data.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" /> {data.location}
                  </span>
                )}
                {data.website && (
                  <a
                    href={data.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    {new URL(data.website).hostname} <ExternalLink className="size-3.5" />
                  </a>
                )}
                <span>
                  {data.applicationCount}{' '}
                  {data.applicationCount === 1 ? 'application' : 'applications'}
                </span>
              </span>
            }
            actions={
              <Button asChild variant="outline">
                <Link href={`/applications?companyId=${data.id}`}>Open in list</Link>
              </Button>
            }
          />
          {data.notes && (
            <p className="mb-4 text-sm whitespace-pre-line text-muted-foreground">{data.notes}</p>
          )}

          <Card className="overflow-hidden">
            {data.applications.length === 0 ? (
              <EmptyState
                title="No applications"
                action={
                  <Button asChild>
                    <Link href="/applications/new">
                      <Plus /> Add application
                    </Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y">
                {data.applications.map((app) => (
                  <li key={app.id}>
                    <Link
                      href={`/applications/${app.id}`}
                      className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{app.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {app.location ?? 'No location'} · Applied{' '}
                          {formatDateOrDash(app.appliedAt)}
                          {app.lastActivityAt &&
                            ` · Last activity ${relativeDays(app.lastActivityAt)}`}
                        </p>
                      </div>
                      <StatusBadge status={app.status} className="self-start sm:self-auto" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}
