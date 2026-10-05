import type { EventType } from '@lifeos/contracts';
import {
  ArrowRight,
  Ban,
  CalendarCheck,
  CalendarClock,
  CircleX,
  ClipboardList,
  type LucideIcon,
  Phone,
  Reply,
  Send,
  Sparkles,
  StickyNote,
  Trophy,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ICONS: Record<EventType, { icon: LucideIcon; tone: string }> = {
  CREATED: {
    icon: Sparkles,
    tone: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300',
  },
  STATUS_CHANGED: {
    icon: ArrowRight,
    tone: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300',
  },
  APPLICATION_SUBMITTED: {
    icon: Send,
    tone: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300',
  },
  RECRUITER_CONTACT: {
    icon: Phone,
    tone: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300',
  },
  INTERVIEW_SCHEDULED: {
    icon: CalendarClock,
    tone: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
  },
  INTERVIEW_COMPLETED: {
    icon: CalendarCheck,
    tone: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
  },
  ASSIGNMENT_RECEIVED: {
    icon: ClipboardList,
    tone: 'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300',
  },
  FOLLOW_UP: { icon: Reply, tone: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300' },
  REJECTION: {
    icon: CircleX,
    tone: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
  },
  OFFER: {
    icon: Trophy,
    tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  WITHDRAWN: {
    icon: Ban,
    tone: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  },
  NOTE: {
    icon: StickyNote,
    tone: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300',
  },
};

export function EventIcon({
  type,
  voided,
  className,
}: {
  type: EventType;
  voided?: boolean;
  className?: string;
}) {
  const { icon: Icon, tone } = ICONS[type];
  return (
    <span
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-full ring-4 ring-card',
        voided ? 'bg-muted text-muted-foreground' : tone,
        className,
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}
