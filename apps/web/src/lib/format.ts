import { calendarDaysBetween, formatDate } from '@lifeos/contracts';

export {
  formatDate,
  formatDateTime,
  toBerlinDateString,
  toBerlinTimeString,
} from '@lifeos/contracts';

/** formatDate, or a dash for empty values. */
export const formatDateOrDash = (value: string | null | undefined): string =>
  value ? formatDate(value) : '—';

/** "today", "yesterday", "3 days ago", "in 2 days" (Berlin calendar days). */
export function relativeDays(value: string, now: Date = new Date()): string {
  const days = calendarDaysBetween(now, value);
  if (days === 0) return 'today';
  if (days === -1) return 'yesterday';
  if (days === 1) return 'tomorrow';
  return days < 0 ? `${-days} days ago` : `in ${days} days`;
}

/** True when the date's Berlin calendar day is before today. */
export const isOverdue = (value: string, now: Date = new Date()): boolean =>
  calendarDaysBetween(now, value) < 0;
