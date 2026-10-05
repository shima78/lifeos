'use client';

import {
  APPLICATION_STATUSES,
  type ApplicationDto,
  type ApplicationStatus,
  STATUS_LABELS,
} from '@lifeos/contracts';
import { Check, ChevronDown, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useChangeStatus } from '@/lib/queries';

/** Status badge that opens a menu to change status (recorded as a STATUS_CHANGED event). */
export function StatusMenu({ application }: { application: ApplicationDto }) {
  const change = useChangeStatus(application.id);

  const onSelect = (status: ApplicationStatus) => {
    if (status === application.status) return;
    change.mutate(
      { status },
      {
        onSuccess: () =>
          toast.success(`Status changed to ${STATUS_LABELS[status]}`, {
            description: 'Added to the timeline.',
          }),
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 pl-1.5" disabled={change.isPending}>
          <StatusBadge status={application.status} />
          {change.isPending ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <ChevronDown className="text-muted-foreground" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Change status</DropdownMenuLabel>
        {APPLICATION_STATUSES.map((s) => (
          <DropdownMenuItem key={s} onSelect={() => onSelect(s)}>
            <Check className={s === application.status ? 'opacity-100' : 'opacity-0'} />
            <StatusBadge status={s} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
