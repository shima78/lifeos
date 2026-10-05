'use client';

import {
  APPLICATION_SORT_FIELDS,
  APPLICATION_STATUSES,
  type ApplicationListQueryInput,
  type ApplicationSortField,
  type ApplicationStatus,
  STATUS_LABELS,
  type SortOrder,
} from '@lifeos/contracts';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ListFilter,
  Plus,
  Search,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ComponentProps, useEffect, useMemo, useState } from 'react';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/states';
import { StatusBadge } from '@/components/status-badge';
import { TruncatedText } from '@/components/truncated-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input, NativeSelect } from '@/components/ui/input';
import { formatDate, formatDateOrDash, isOverdue, relativeDays } from '@/lib/format';
import { useApplications, useCompanies } from '@/lib/queries';
import { useDebounced } from '@/lib/use-debounced';
import { cn } from '@/lib/utils';

const DEFAULT_SORT: ApplicationSortField = 'lastActivityAt';
const DEFAULT_ORDER: SortOrder = 'desc';

/** Reads list filters from the URL (?search=&status=A&status=B&...). */
function useUrlQuery() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const query = useMemo(() => {
    const sortParam = params.get('sort');
    const sort = (APPLICATION_SORT_FIELDS as readonly string[]).includes(sortParam ?? '')
      ? (sortParam as ApplicationSortField)
      : DEFAULT_SORT;
    return {
      search: params.get('search') ?? '',
      status: params
        .getAll('status')
        .filter((s): s is ApplicationStatus =>
          (APPLICATION_STATUSES as readonly string[]).includes(s),
        ),
      companyId: params.get('companyId') ?? '',
      location: params.get('location') ?? '',
      appliedFrom: params.get('appliedFrom') ?? '',
      appliedTo: params.get('appliedTo') ?? '',
      sort,
      order: (params.get('order') === 'asc'
        ? 'asc'
        : params.get('order') === 'desc'
          ? 'desc'
          : DEFAULT_ORDER) as SortOrder,
    };
  }, [params]);

  const update = (patch: Partial<typeof query>) => {
    const next = { ...query, ...patch };
    const sp = new URLSearchParams();
    if (next.search) sp.set('search', next.search);
    next.status.forEach((s) => sp.append('status', s));
    if (next.companyId) sp.set('companyId', next.companyId);
    if (next.location) sp.set('location', next.location);
    if (next.appliedFrom) sp.set('appliedFrom', next.appliedFrom);
    if (next.appliedTo) sp.set('appliedTo', next.appliedTo);
    if (next.sort !== DEFAULT_SORT || next.order !== DEFAULT_ORDER) {
      sp.set('sort', next.sort);
      sp.set('order', next.order);
    }
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return { query, update };
}

/** A text input that edits locally and writes to the URL after a short pause. */
function DebouncedInput({
  value,
  onCommit,
  ...props
}: { value: string; onCommit: (v: string) => void } & Omit<
  ComponentProps<typeof Input>,
  'value' | 'onChange'
>) {
  const [local, setLocal] = useState(value);
  const debounced = useDebounced(local);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    if (debounced !== value) onCommit(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  return <Input value={local} onChange={(e) => setLocal(e.target.value)} {...props} />;
}

const COLUMNS: { field: ApplicationSortField; label: string; className?: string }[] = [
  { field: 'company', label: 'Company' },
  { field: 'title', label: 'Position' },
  { field: 'status', label: 'Status' },
  { field: 'appliedAt', label: 'Applied' },
  { field: 'lastActivityAt', label: 'Last activity' },
  { field: 'nextActionDate', label: 'Next action' },
];

export function ApplicationsView() {
  const { query, update } = useUrlQuery();
  const companies = useCompanies();

  const apiQuery: ApplicationListQueryInput = {
    search: query.search || undefined,
    status: query.status.length ? query.status : undefined,
    companyId: query.companyId || undefined,
    location: query.location || undefined,
    appliedFrom: query.appliedFrom || undefined,
    appliedTo: query.appliedTo || undefined,
    sort: query.sort,
    order: query.order,
  };
  const { data, error, isPending, isFetching, refetch } = useApplications(apiQuery);

  const hasFilters = Boolean(
    query.search ||
    query.status.length ||
    query.companyId ||
    query.location ||
    query.appliedFrom ||
    query.appliedTo,
  );

  const toggleSort = (field: ApplicationSortField) => {
    if (query.sort === field) update({ order: query.order === 'asc' ? 'desc' : 'asc' });
    else
      update({
        sort: field,
        order: field === 'company' || field === 'title' || field === 'status' ? 'asc' : 'desc',
      });
  };

  const toggleStatus = (status: ApplicationStatus) =>
    update({
      status: query.status.includes(status)
        ? query.status.filter((s) => s !== status)
        : [...query.status, status],
    });

  return (
    <>
      <PageHeader
        title="Applications"
        description={
          data
            ? `${data.length} ${data.length === 1 ? 'application' : 'applications'}${hasFilters ? ' matching filters' : ''}`
            : ' '
        }
      />

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="relative lg:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <DebouncedInput
            value={query.search}
            onCommit={(search) => update({ search })}
            placeholder="Search company or position"
            className="pl-9"
            aria-label="Search"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={cn('justify-between', query.status.length && 'border-primary/40')}
              >
                <span className="flex items-center gap-2">
                  <ListFilter />
                  {query.status.length === 0
                    ? 'All statuses'
                    : query.status.length === 1
                      ? STATUS_LABELS[query.status[0]!]
                      : `${query.status.length} statuses`}
                </span>
                <ChevronDown className="text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {APPLICATION_STATUSES.map((s) => (
                <DropdownMenuCheckboxItem
                  key={s}
                  checked={query.status.includes(s)}
                  onCheckedChange={() => toggleStatus(s)}
                  onSelect={(e) => e.preventDefault()}
                >
                  <StatusBadge status={s} />
                </DropdownMenuCheckboxItem>
              ))}
              {query.status.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={false}
                    onCheckedChange={() => update({ status: [] })}
                  >
                    Clear statuses
                  </DropdownMenuCheckboxItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <NativeSelect
            value={query.companyId}
            onChange={(e) => update({ companyId: e.target.value })}
            aria-label="Company"
            className="sm:w-44"
          >
            <option value="">All companies</option>
            {companies.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>

          <DebouncedInput
            value={query.location}
            onCommit={(location) => update({ location })}
            placeholder="Location"
            aria-label="Location"
            className="sm:w-36"
          />

          <div className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="whitespace-nowrap">Applied</span>
            <Input
              type="date"
              value={query.appliedFrom}
              max={query.appliedTo || undefined}
              onChange={(e) => update({ appliedFrom: e.target.value })}
              aria-label="Applied from"
              className="sm:w-38"
            />
            <span>–</span>
            <Input
              type="date"
              value={query.appliedTo}
              min={query.appliedFrom || undefined}
              onChange={(e) => update({ appliedTo: e.target.value })}
              aria-label="Applied to"
              className="sm:w-38"
            />
          </div>
        </div>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="self-start lg:self-auto"
            onClick={() =>
              update({
                search: '',
                status: [],
                companyId: '',
                location: '',
                appliedFrom: '',
                appliedTo: '',
              })
            }
          >
            <X /> Clear filters
          </Button>
        )}
      </div>

      <Card
        className={cn(
          'overflow-hidden transition-opacity',
          isFetching && !isPending && 'opacity-70',
        )}
      >
        {isPending ? (
          <LoadingRows rows={8} className="p-4" />
        ) : error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : data.length === 0 ? (
          hasFilters ? (
            <EmptyState title="No matches" description="No applications match these filters." />
          ) : (
            <EmptyState
              title="No applications yet"
              description="Track the first job you're interested in. Everything else builds from there."
              action={
                <Button asChild>
                  <Link href="/applications/new">
                    <Plus /> Add application
                  </Link>
                </Button>
              }
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  {COLUMNS.map((col) => {
                    const active = query.sort === col.field;
                    const Icon = !active
                      ? ArrowUpDown
                      : query.order === 'asc'
                        ? ArrowUp
                        : ArrowDown;
                    return (
                      <th
                        key={col.field}
                        className="px-4 py-2.5 font-medium"
                        aria-sort={
                          active ? (query.order === 'asc' ? 'ascending' : 'descending') : 'none'
                        }
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(col.field)}
                          className={cn(
                            'inline-flex cursor-pointer items-center gap-1 rounded hover:text-foreground',
                            active && 'text-foreground',
                          )}
                        >
                          {col.label}
                          <Icon className={cn('size-3.5', !active && 'opacity-40')} />
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.map((app) => {
                  const href = `/applications/${app.id}`;
                  const nextOverdue = app.nextActionDate !== null && isOverdue(app.nextActionDate);
                  return (
                    <tr key={app.id} className="group relative transition-colors hover:bg-muted/40">
                      <td className="px-4 py-3 font-medium">
                        {/* The whole row is clickable via this stretched link. */}
                        <Link
                          href={href}
                          className="after:absolute after:inset-0 focus-visible:outline-none"
                        >
                          {app.company.name}
                        </Link>
                      </td>
                      <td className="max-w-[18rem] px-4 py-3">
                        <TruncatedText text={app.title} href={href} />
                        {app.location && (
                          <TruncatedText
                            text={app.location}
                            href={href}
                            className="w-fit max-w-full text-xs text-muted-foreground"
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={app.status} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {formatDateOrDash(app.appliedAt)}
                      </td>
                      <td
                        className="px-4 py-3 whitespace-nowrap text-muted-foreground"
                        title={app.lastActivityAt ? formatDate(app.lastActivityAt) : undefined}
                      >
                        {app.lastActivityAt ? relativeDays(app.lastActivityAt) : '—'}
                      </td>
                      <td className="max-w-[14rem] px-4 py-3">
                        {app.nextAction || app.nextActionDate ? (
                          <>
                            <TruncatedText text={app.nextAction ?? 'Next action'} href={href} />
                            {app.nextActionDate && (
                              <div
                                className={cn(
                                  'text-xs text-muted-foreground',
                                  nextOverdue && 'font-medium text-destructive',
                                )}
                              >
                                {formatDate(app.nextActionDate)}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
