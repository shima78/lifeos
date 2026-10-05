import {
  type ApplicationStatus,
  AWAITING_RESPONSE_STATUSES,
  type AttentionReasonDto,
  isTerminalStatus,
} from '@lifeos/contracts';
import { DAY_MS, calendarDaysBetween } from '../common/dates';

/** No non-voided event for this many days while APPLIED/SCREENING → "No response". */
export const NO_RESPONSE_THRESHOLD_DAYS = 14;
/** Next action due today, overdue, or within this many days → "Next action due". */
export const NEXT_ACTION_WINDOW_DAYS = 3;
/** Interview scheduled within this many days → "Interview in N days". */
export const UPCOMING_INTERVIEW_WINDOW_DAYS = 7;

export interface AttentionInput {
  status: ApplicationStatus;
  lastActivityAt: Date | null;
  nextActionDate: Date | null;
  /** scheduledFor of the application's non-voided INTERVIEW_SCHEDULED events. */
  interviewDates: Date[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Pure "needs attention" rules for one application. Days are Europe/Berlin calendar days. */
export function attentionReasons(app: AttentionInput, now: Date): AttentionReasonDto[] {
  const reasons: AttentionReasonDto[] = [];

  const nextInterview = app.interviewDates
    .filter(
      (d) => d >= now && d.getTime() - now.getTime() <= UPCOMING_INTERVIEW_WINDOW_DAYS * DAY_MS,
    )
    .sort((a, b) => a.getTime() - b.getTime())[0];
  if (nextInterview) {
    const days = calendarDaysBetween(now, nextInterview);
    reasons.push({
      kind: 'UPCOMING_INTERVIEW',
      days,
      message:
        days === 0
          ? 'Interview today'
          : days === 1
            ? 'Interview tomorrow'
            : `Interview in ${days} days`,
    });
  }

  // Terminal applications only surface for an upcoming interview.
  if (isTerminalStatus(app.status)) return reasons;

  if (app.nextActionDate) {
    const days = calendarDaysBetween(now, app.nextActionDate);
    if (days <= NEXT_ACTION_WINDOW_DAYS) {
      reasons.push({
        kind: 'NEXT_ACTION_DUE',
        days,
        message:
          days < 0
            ? `Next action overdue by ${plural(-days, 'day')}`
            : days === 0
              ? 'Next action due today'
              : `Next action due in ${plural(days, 'day')}`,
      });
    }
  }

  if (AWAITING_RESPONSE_STATUSES.includes(app.status)) {
    const cutoff = now.getTime() - NO_RESPONSE_THRESHOLD_DAYS * DAY_MS;
    if (!app.lastActivityAt || app.lastActivityAt.getTime() <= cutoff) {
      const days = app.lastActivityAt
        ? calendarDaysBetween(app.lastActivityAt, now)
        : NO_RESPONSE_THRESHOLD_DAYS;
      reasons.push({ kind: 'NO_RESPONSE', days, message: `No response for ${days} days` });
    }
  }

  return reasons;
}

const KIND_PRIORITY: Record<AttentionReasonDto['kind'], number> = {
  UPCOMING_INTERVIEW: 0,
  NEXT_ACTION_DUE: 1,
  NO_RESPONSE: 2,
};

/** Most urgent first: interviews and due actions by date, then the longest silences. */
export function compareUrgency(a: AttentionReasonDto[], b: AttentionReasonDto[]): number {
  const [ra, rb] = [a[0], b[0]];
  if (!ra || !rb) return 0;
  const byKind = KIND_PRIORITY[ra.kind] - KIND_PRIORITY[rb.kind];
  if (byKind !== 0) return byKind;
  return ra.kind === 'NO_RESPONSE' ? rb.days - ra.days : ra.days - rb.days;
}
