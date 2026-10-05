import { type ApplicationStatus, STATUS_LABELS } from '@lifeos/contracts';
import { cn } from '@/lib/utils';

/**
 * Status colors are CSS variables (globals.css, validated light/dark). Following the data-viz
 * rules, color is carried by a mark (dot, bar) and text always stays in ink.
 */
export const statusColor = (status: ApplicationStatus): string =>
  `var(--status-${status.toLowerCase()})`;

export function StatusDot({
  status,
  className,
}: {
  status: ApplicationStatus;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-2 shrink-0 rounded-full', className)}
      style={{ backgroundColor: statusColor(status) }}
    />
  );
}

export function StatusBadge({
  status,
  className,
}: {
  status: ApplicationStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-0.5 text-xs font-medium whitespace-nowrap text-foreground',
        className,
      )}
    >
      <StatusDot status={status} />
      {STATUS_LABELS[status]}
    </span>
  );
}
