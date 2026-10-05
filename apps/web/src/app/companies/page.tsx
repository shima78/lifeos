'use client';

import { Building2, ExternalLink, MapPin, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/states';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useCompanies } from '@/lib/queries';
import { useDebounced } from '@/lib/use-debounced';

export default function CompaniesPage() {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim());
  const { data, error, isPending, refetch } = useCompanies(debounced || undefined);

  return (
    <>
      <PageHeader
        title="Companies"
        description="Companies are created automatically when you add an application."
      />

      <div className="relative mb-4 sm:w-72">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search companies"
          className="pl-9"
          aria-label="Search companies"
        />
      </div>

      {isPending ? (
        <LoadingRows rows={5} />
      ) : error ? (
        <Card>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Card>
      ) : data.length === 0 ? (
        <Card>
          <EmptyState
            title={debounced ? 'No matches' : 'No companies yet'}
            description={debounced ? undefined : 'Add an application and its company appears here.'}
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((c) => (
            <Card
              key={c.id}
              className="relative flex flex-col gap-3 p-4 transition-colors hover:border-primary/30"
            >
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
                  <Building2 className="size-5" />
                </span>
                <div className="min-w-0">
                  <Link
                    href={`/companies/${c.id}`}
                    className="font-medium after:absolute after:inset-0 focus-visible:outline-none"
                  >
                    {c.name}
                  </Link>
                  {c.location && (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" /> {c.location}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-auto flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  <span className="font-semibold text-foreground tabular-nums">
                    {c.applicationCount}
                  </span>{' '}
                  {c.applicationCount === 1 ? 'application' : 'applications'}
                </span>
                {c.website && (
                  <a
                    href={c.website}
                    target="_blank"
                    rel="noreferrer"
                    className="relative z-10 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Website <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
