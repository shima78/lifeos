import { berlinWallTimeToUtc, toBerlinDateString } from '@lifeos/contracts';

export {
  calendarDaysBetween,
  formatDate,
  toBerlinDateString,
  berlinWallTimeToUtc,
} from '@lifeos/contracts';

export const DAY_MS = 86_400_000;

export const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);

/** Start (00:00 Europe/Berlin) of the Berlin calendar day after the given instant. */
export function startOfNextBerlinDay(date: Date): Date {
  const [y, m, d] = toBerlinDateString(date).split('-').map(Number);
  const next = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + 1));
  return berlinWallTimeToUtc(next.toISOString().slice(0, 10));
}

export const toIso = (date: Date | null | undefined): string | null =>
  date ? date.toISOString() : null;
