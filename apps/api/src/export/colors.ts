import type { ApplicationStatus, EventType, TaskPriority, TaskStatus } from '@lifeos/contracts';

/**
 * Colors for the Excel exports, matching the web app (apps/web/src/app/globals.css, light theme).
 * Cells get a soft tint of the hue as background and a darker shade as text, so they stay
 * readable when printed or in Excel's dark mode.
 */
const STATUS_HEX: Record<ApplicationStatus, string> = {
  SAVED: 'eb6834',
  APPLIED: '2a78d6',
  SCREENING: 'eda100',
  INTERVIEW: '4a3aa7',
  OFFER: '008300',
  REJECTED: 'e34948',
  WITHDRAWN: '1baf7a',
};

const GRAY = '898781';
const BLUE = '2a78d6';
const RED = 'e34948';
const GREEN = '008300';
const VIOLET = '4a3aa7';
const ORANGE = 'eb6834';

const EVENT_HEX: Partial<Record<EventType, string>> = {
  STATUS_CHANGED: BLUE,
  APPLICATION_SUBMITTED: BLUE,
  INTERVIEW_SCHEDULED: VIOLET,
  INTERVIEW_COMPLETED: VIOLET,
  ASSIGNMENT_RECEIVED: ORANGE,
  REJECTION: RED,
  OFFER: GREEN,
  WITHDRAWN: STATUS_HEX.WITHDRAWN,
};

const TASK_STATUS_HEX: Partial<Record<TaskStatus, string>> = { IN_PROGRESS: BLUE, DONE: GREEN };
const PRIORITY_HEX: Partial<Record<TaskPriority, string>> = { HIGH: RED, LOW: GRAY };

function mix(hex: string, with_: number, amount: number): string {
  const channel = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return [0, 2, 4]
    .map((i) => Math.round(channel(i) + (with_ - channel(i)) * amount))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/** ARGB colors exceljs understands. */
export const argb = (hex: string) => `FF${hex.toUpperCase()}`;
/** Soft background tint (mostly white). */
export const tint = (hex: string) => argb(mix(hex, 255, 0.85));
/** Darker shade for text on the tint. */
export const shade = (hex: string) => argb(mix(hex, 0, 0.3));

export interface Tone {
  fill: string;
  font: string;
}

const tone = (hex: string | undefined): Tone | undefined =>
  hex ? { fill: tint(hex), font: shade(hex) } : undefined;

export const statusTone = (s: ApplicationStatus): Tone => tone(STATUS_HEX[s])!;
export const statusSolid = (s: ApplicationStatus): string => argb(STATUS_HEX[s]);
export const eventTone = (t: EventType): Tone | undefined => tone(EVENT_HEX[t]);
export const taskStatusTone = (s: TaskStatus): Tone | undefined => tone(TASK_STATUS_HEX[s]);
export const priorityTone = (p: TaskPriority): Tone | undefined => tone(PRIORITY_HEX[p]);

export const THEME = {
  header: argb('1F2328'),
  headerFont: argb('FFFFFF'),
  band: argb('F7F7F5'),
  border: argb('E4E3DD'),
  muted: argb(GRAY),
  danger: argb('C42B2B'),
  link: argb(BLUE),
};
