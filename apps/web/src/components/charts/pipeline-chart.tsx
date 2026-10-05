'use client';

import { type ApplicationStatus, STATUS_LABELS } from '@lifeos/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { statusColor } from '@/components/status-badge';
import { cn } from '@/lib/utils';
import { type Slice, StatusDonut, toSlices } from './status-donut';

type StatusCount = { status: ApplicationStatus; count: number };

/**
 * Applications by status as labelled horizontal bars. Every bar has its status name and count as
 * text, so identity never relies on color alone (the status hues are validated as a set). The bar
 * sits under its label so it keeps a usable length in narrow columns.
 */
export function PipelineChart({
  data,
  total,
  active = null,
  onActiveChange,
}: {
  data: StatusCount[];
  total: number;
  active?: Slice['key'] | null;
  onActiveChange?: (key: Slice['key'] | null) => void;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <ul className="flex flex-col">
      {data.map((d) => {
        const share = total ? Math.round((d.count / total) * 100) : 0;
        const highlighted = active === d.status;
        return (
          <li key={d.status}>
            <Link
              href={`/applications?status=${d.status}`}
              title={`${STATUS_LABELS[d.status]}: ${d.count} (${share}%)`}
              onMouseEnter={() => d.count > 0 && onActiveChange?.(d.status)}
              onMouseLeave={() => onActiveChange?.(null)}
              onFocus={() => d.count > 0 && onActiveChange?.(d.status)}
              onBlur={() => onActiveChange?.(null)}
              className={cn(
                'group block rounded-md px-1.5 py-1.5 transition-colors hover:bg-accent',
                highlighted && 'bg-accent',
              )}
            >
              <span className="flex items-center justify-between gap-2 text-sm">
                <span
                  className={cn(
                    'flex items-center gap-2 text-muted-foreground group-hover:text-foreground',
                    highlighted && 'text-foreground',
                  )}
                >
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ backgroundColor: statusColor(d.status) }}
                  />
                  {STATUS_LABELS[d.status]}
                </span>
                <span className="tabular-nums">
                  <span className="font-medium">{d.count}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">{share}%</span>
                </span>
              </span>
              <span className="mt-1.5 block h-1.5 rounded-r-[4px] bg-muted">
                {d.count > 0 && (
                  <span
                    className="block h-1.5 rounded-r-[4px]"
                    style={{
                      width: `${Math.max(1.5, (d.count / max) * 100)}%`,
                      backgroundColor: statusColor(d.status),
                    }}
                  />
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Donut (part-to-whole at a glance) above the labelled bars, which double as its legend. */
export function StatusBreakdown({ data, total }: { data: StatusCount[]; total: number }) {
  const [active, setActive] = useState<Slice['key'] | null>(null);
  const slices = toSlices(data);
  return (
    <div className="flex flex-col gap-4">
      {/* Two slices or fewer say less than the numbers below; skip the donut then. */}
      {slices.length > 2 && (
        <StatusDonut slices={slices} total={total} active={active} onActiveChange={setActive} />
      )}
      <PipelineChart data={data} total={total} active={active} onActiveChange={setActive} />
    </div>
  );
}
