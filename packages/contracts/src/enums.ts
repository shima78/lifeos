import { z } from 'zod';

export const APPLICATION_STATUSES = [
  'SAVED',
  'APPLIED',
  'SCREENING',
  'INTERVIEW',
  'OFFER',
  'REJECTED',
  'WITHDRAWN',
] as const;
export const applicationStatusSchema = z.enum(APPLICATION_STATUSES);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

/** Statuses that end a process. */
export const TERMINAL_STATUSES: readonly ApplicationStatus[] = ['OFFER', 'REJECTED', 'WITHDRAWN'];

/** Statuses that imply the application was submitted (used when creating an application). */
export const SUBMITTED_STATUSES: readonly ApplicationStatus[] = [
  'APPLIED',
  'SCREENING',
  'INTERVIEW',
  'OFFER',
  'REJECTED',
];

/** Statuses watched by the "no response" attention rule. */
export const AWAITING_RESPONSE_STATUSES: readonly ApplicationStatus[] = ['APPLIED', 'SCREENING'];

export const isTerminalStatus = (status: ApplicationStatus): boolean =>
  TERMINAL_STATUSES.includes(status);

/** Active = in progress: not terminal and not merely saved. */
export const isActiveStatus = (status: ApplicationStatus): boolean =>
  status !== 'SAVED' && !isTerminalStatus(status);

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  SAVED: 'Saved',
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

export const EVENT_TYPES = [
  'CREATED',
  'STATUS_CHANGED',
  'APPLICATION_SUBMITTED',
  'RECRUITER_CONTACT',
  'INTERVIEW_SCHEDULED',
  'INTERVIEW_COMPLETED',
  'ASSIGNMENT_RECEIVED',
  'FOLLOW_UP',
  'REJECTION',
  'OFFER',
  'WITHDRAWN',
  'NOTE',
] as const;
export const eventTypeSchema = z.enum(EVENT_TYPES);
export type EventType = z.infer<typeof eventTypeSchema>;

/**
 * Event types the user may add by hand. CREATED and STATUS_CHANGED are system-generated:
 * a manual STATUS_CHANGED would disagree with the application's actual status.
 */
export const MANUAL_EVENT_TYPES = [
  'APPLICATION_SUBMITTED',
  'RECRUITER_CONTACT',
  'INTERVIEW_SCHEDULED',
  'INTERVIEW_COMPLETED',
  'ASSIGNMENT_RECEIVED',
  'FOLLOW_UP',
  'REJECTION',
  'OFFER',
  'WITHDRAWN',
  'NOTE',
] as const satisfies readonly EventType[];
export const manualEventTypeSchema = z.enum(MANUAL_EVENT_TYPES);
export type ManualEventType = z.infer<typeof manualEventTypeSchema>;

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  CREATED: 'Created',
  STATUS_CHANGED: 'Status changed',
  APPLICATION_SUBMITTED: 'Application submitted',
  RECRUITER_CONTACT: 'Recruiter contact',
  INTERVIEW_SCHEDULED: 'Interview scheduled',
  INTERVIEW_COMPLETED: 'Interview completed',
  ASSIGNMENT_RECEIVED: 'Assignment received',
  FOLLOW_UP: 'Follow-up',
  REJECTION: 'Rejection',
  OFFER: 'Offer',
  WITHDRAWN: 'Withdrawn',
  NOTE: 'Note',
};
