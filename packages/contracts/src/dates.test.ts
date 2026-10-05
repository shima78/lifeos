import {
  berlinWallTimeToUtc,
  berlinWeekStart,
  calendarDaysBetween,
  formatDate,
  formatDateTime,
  toBerlinDateString,
} from './dates';
import { createEventSchema, dateInputSchema } from './schemas';

describe('dates', () => {
  it('formats as DD Mon YYYY in Berlin time', () => {
    expect(formatDate('2026-10-08T10:00:00Z')).toBe('08 Oct 2026');
    // 23:30 UTC on 31 Dec is already 1 Jan in Berlin.
    expect(formatDate('2026-12-31T23:30:00Z')).toBe('01 Jan 2027');
    expect(formatDateTime('2026-10-08T12:30:00Z')).toBe('08 Oct 2026, 14:30');
  });

  it('converts Berlin wall time to UTC across DST', () => {
    expect(berlinWallTimeToUtc('2026-07-01').toISOString()).toBe('2026-06-30T22:00:00.000Z');
    expect(berlinWallTimeToUtc('2026-01-15', '09:30').toISOString()).toBe(
      '2026-01-15T08:30:00.000Z',
    );
    expect(toBerlinDateString(berlinWallTimeToUtc('2026-03-29'))).toBe('2026-03-29');
    expect(toBerlinDateString(berlinWallTimeToUtc('2026-10-25'))).toBe('2026-10-25');
  });

  it('counts Berlin calendar days', () => {
    // 22:30Z on 4 Oct is already 00:30 on 5 Oct in Berlin (CEST).
    expect(calendarDaysBetween('2026-10-04T22:30:00Z', '2026-10-05T07:00:00Z')).toBe(0);
    expect(calendarDaysBetween('2026-10-04T21:00:00Z', '2026-10-05T07:00:00Z')).toBe(1);
    expect(calendarDaysBetween('2026-10-04T10:00:00Z', '2026-10-07T10:00:00Z')).toBe(3);
    expect(calendarDaysBetween('2026-10-07T10:00:00Z', '2026-10-04T10:00:00Z')).toBe(-3);
  });

  it('parses date-only and datetime inputs', () => {
    expect(dateInputSchema.parse('2026-10-08').toISOString()).toBe('2026-10-07T22:00:00.000Z');
    expect(dateInputSchema.parse('2026-10-08T10:00:00.000Z').toISOString()).toBe(
      '2026-10-08T10:00:00.000Z',
    );
    expect(dateInputSchema.safeParse('yesterday').success).toBe(false);
  });

  it('requires scheduledFor for INTERVIEW_SCHEDULED', () => {
    expect(createEventSchema.safeParse({ type: 'INTERVIEW_SCHEDULED' }).success).toBe(false);
    expect(
      createEventSchema.safeParse({ type: 'INTERVIEW_SCHEDULED', scheduledFor: '2026-10-10' })
        .success,
    ).toBe(true);
  });
});

describe('berlinWeekStart', () => {
  it('returns the Monday of the Berlin week', () => {
    // Sunday 4 Oct 2026 → Monday 28 Sep.
    expect(berlinWeekStart('2026-10-04T10:00:00Z')).toBe('2026-09-28');
    // 22:30Z on Sunday is already Monday 5 Oct in Berlin.
    expect(berlinWeekStart('2026-10-04T22:30:00Z')).toBe('2026-10-05');
    expect(berlinWeekStart('2026-10-04T10:00:00Z', -1)).toBe('2026-09-21');
  });
});
