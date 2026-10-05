/**
 * Date helpers shared by API and web. Everything is stored in UTC and displayed in
 * Europe/Berlin. Calendar-date inputs (YYYY-MM-DD) mean "that day in Berlin" and are
 * stored as Berlin midnight expressed in UTC.
 */
export const DISPLAY_TIME_ZONE = 'Europe/Berlin';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: DISPLAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(date: Date): ZonedParts {
  const parts: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

const toDate = (value: Date | string): Date =>
  typeof value === 'string' ? new Date(value) : value;
const pad = (n: number): string => String(n).padStart(2, '0');

/** "08 Oct 2026" in Berlin time. */
export function formatDate(value: Date | string): string {
  const p = zonedParts(toDate(value));
  return `${pad(p.day)} ${MONTHS[p.month - 1]} ${p.year}`;
}

/** "08 Oct 2026, 14:30" in Berlin time. */
export function formatDateTime(value: Date | string): string {
  const p = zonedParts(toDate(value));
  return `${pad(p.day)} ${MONTHS[p.month - 1]} ${p.year}, ${pad(p.hour)}:${pad(p.minute)}`;
}

/** The Berlin calendar date of an instant, as YYYY-MM-DD. */
export function toBerlinDateString(value: Date | string): string {
  const p = zonedParts(toDate(value));
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Berlin local time of an instant, as HH:mm. */
export function toBerlinTimeString(value: Date | string): string {
  const p = zonedParts(toDate(value));
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Converts a Berlin wall-clock time to the UTC instant it represents (DST-aware). */
export function berlinWallTimeToUtc(dateStr: string, timeStr = '00:00'): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const target = Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0);
  // Start by treating the wall time as UTC, then correct by the observed offset (twice for DST edges).
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess));
    const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    guess += target - wallAsUtc;
  }
  return new Date(guess);
}

/** Whole Berlin calendar days from `from` to `to` (positive when `to` is later). */
export function calendarDaysBetween(from: Date | string, to: Date | string): number {
  const [ay, am, ad] = toBerlinDateString(from).split('-').map(Number);
  const [by, bm, bd] = toBerlinDateString(to).split('-').map(Number);
  const ua = Date.UTC(ay ?? 0, (am ?? 1) - 1, ad ?? 1);
  const ub = Date.UTC(by ?? 0, (bm ?? 1) - 1, bd ?? 1);
  return Math.round((ub - ua) / 86_400_000);
}

/** The Monday (YYYY-MM-DD, Berlin calendar) of the week containing the instant, shifted by `weeks`. */
export function berlinWeekStart(value: Date | string, weeks = 0): string {
  const [y, m, d] = toBerlinDateString(value).split('-').map(Number);
  const day = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  const mondayOffset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - mondayOffset + weeks * 7);
  return day.toISOString().slice(0, 10);
}
