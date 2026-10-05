import {
  type AttentionInput,
  NO_RESPONSE_THRESHOLD_DAYS,
  attentionReasons,
} from './attention.rules';

const NOW = new Date('2026-10-04T10:00:00.000Z'); // 12:00 in Berlin
const daysFromNow = (d: number) => new Date(NOW.getTime() + d * 86_400_000);

const input = (overrides: Partial<AttentionInput>): AttentionInput => ({
  status: 'APPLIED',
  lastActivityAt: NOW,
  nextActionDate: null,
  interviewDates: [],
  ...overrides,
});

const kinds = (overrides: Partial<AttentionInput>) =>
  attentionReasons(input(overrides), NOW).map((r) => r.kind);

describe('attention rules', () => {
  describe('no response', () => {
    it.each(['APPLIED', 'SCREENING'] as const)(
      'flags %s with no activity for 14+ days',
      (status) => {
        const reasons = attentionReasons(input({ status, lastActivityAt: daysFromNow(-20) }), NOW);
        expect(reasons).toEqual([
          { kind: 'NO_RESPONSE', days: 20, message: 'No response for 20 days' },
        ]);
      },
    );

    it('uses the threshold constant (14 days) as the boundary', () => {
      expect(NO_RESPONSE_THRESHOLD_DAYS).toBe(14);
      expect(kinds({ lastActivityAt: daysFromNow(-14) })).toEqual(['NO_RESPONSE']);
      expect(kinds({ lastActivityAt: daysFromNow(-13) })).toEqual([]);
    });

    it('ignores other statuses', () => {
      for (const status of ['SAVED', 'INTERVIEW'] as const) {
        expect(kinds({ status, lastActivityAt: daysFromNow(-30) })).toEqual([]);
      }
    });
  });

  describe('next action due', () => {
    it('flags overdue, today and within 3 days, but not later', () => {
      expect(attentionReasons(input({ nextActionDate: daysFromNow(-2) }), NOW)[0]?.message).toBe(
        'Next action overdue by 2 days',
      );
      expect(attentionReasons(input({ nextActionDate: NOW }), NOW)[0]?.message).toBe(
        'Next action due today',
      );
      expect(attentionReasons(input({ nextActionDate: daysFromNow(3) }), NOW)[0]?.message).toBe(
        'Next action due in 3 days',
      );
      expect(kinds({ nextActionDate: daysFromNow(4) })).toEqual([]);
    });
  });

  describe('upcoming interview', () => {
    it('flags interviews in the next 7 days', () => {
      expect(
        attentionReasons(input({ status: 'INTERVIEW', interviewDates: [daysFromNow(3)] }), NOW),
      ).toEqual([{ kind: 'UPCOMING_INTERVIEW', days: 3, message: 'Interview in 3 days' }]);
      expect(kinds({ interviewDates: [daysFromNow(8)] })).toEqual([]);
      expect(kinds({ interviewDates: [daysFromNow(-1)] })).toEqual([]);
    });

    it('reports the soonest interview', () => {
      const reasons = attentionReasons(
        input({ interviewDates: [daysFromNow(6), daysFromNow(1)] }),
        NOW,
      );
      expect(reasons[0]).toMatchObject({ days: 1, message: 'Interview tomorrow' });
    });
  });

  describe('terminal statuses', () => {
    it.each(['OFFER', 'REJECTED', 'WITHDRAWN'] as const)(
      '%s never needs attention for silence or actions',
      (status) => {
        expect(
          kinds({ status, lastActivityAt: daysFromNow(-60), nextActionDate: daysFromNow(-1) }),
        ).toEqual([]);
      },
    );

    it('still surfaces an upcoming interview', () => {
      expect(
        kinds({ status: 'OFFER', nextActionDate: NOW, interviewDates: [daysFromNow(2)] }),
      ).toEqual(['UPCOMING_INTERVIEW']);
    });
  });

  it('combines several reasons', () => {
    expect(
      kinds({
        status: 'SCREENING',
        lastActivityAt: daysFromNow(-18),
        nextActionDate: daysFromNow(-1),
      }),
    ).toEqual(['NEXT_ACTION_DUE', 'NO_RESPONSE']);
  });
});
