import type { ApplicationStatus, EventType } from './enums';

/** Response shapes. Dates are ISO-8601 strings (UTC). */

export interface CompanyDto {
  id: string;
  name: string;
  website: string | null;
  location: string | null;
  notes: string | null;
  applicationCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyRefDto {
  id: string;
  name: string;
}

export interface ApplicationDto {
  id: string;
  company: CompanyRefDto;
  title: string;
  url: string | null;
  location: string | null;
  employmentType: string | null;
  description: string | null;
  status: ApplicationStatus;
  appliedAt: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  recruiterName: string | null;
  recruiterEmail: string | null;
  notes: string | null;
  /** occurredAt of the latest non-voided event. */
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyDetailDto extends CompanyDto {
  applications: ApplicationDto[];
}

export interface ApplicationWarningDto {
  code: 'POSSIBLE_DUPLICATE';
  message: string;
  applicationId: string;
}

export interface CreateApplicationResultDto {
  application: ApplicationDto;
  /** True when the URL was already tracked; `application` is then the existing one. */
  duplicate: boolean;
  warnings: ApplicationWarningDto[];
}

export interface StatusChangeMetadata {
  from: ApplicationStatus;
  to: ApplicationStatus;
}

export interface ApplicationEventDto {
  id: string;
  applicationId: string;
  type: EventType;
  title: string;
  description: string | null;
  occurredAt: string;
  scheduledFor: string | null;
  metadata: Record<string, unknown> | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
}

export interface ApplicationSummaryDto {
  id: string;
  title: string;
  status: ApplicationStatus;
  company: CompanyRefDto;
}

export type AttentionKind = 'NO_RESPONSE' | 'NEXT_ACTION_DUE' | 'UPCOMING_INTERVIEW';

export interface AttentionReasonDto {
  kind: AttentionKind;
  message: string;
  /** Calendar days relative to today: elapsed for NO_RESPONSE, until (negative = overdue) otherwise. */
  days: number;
}

export interface NeedsAttentionItemDto {
  application: ApplicationSummaryDto;
  reasons: AttentionReasonDto[];
}

export interface EventWithApplicationDto {
  event: ApplicationEventDto;
  application: ApplicationSummaryDto;
}

export interface DashboardDto {
  stats: {
    total: number;
    active: number;
    interviews: number;
    offers: number;
    rejections: number;
    /** Applications with appliedAt in the current Berlin week (Monday start). */
    appliedThisWeek: number;
    /**
     * Share (0–1) of submitted applications that got any answer: status SCREENING, INTERVIEW,
     * OFFER or REJECTED. Null when nothing has been submitted.
     */
    responseRate: number | null;
  };
  byStatus: { status: ApplicationStatus; count: number }[];
  /** Applications submitted per Berlin week (Monday start), oldest first, current week last. */
  weeklyApplications: { weekStart: string; count: number }[];
  /** Applications submitted per Berlin calendar day (YYYY-MM-DD), oldest first, today last (30 days). */
  dailyApplications: { date: string; count: number }[];
  /** Daily application goal (APPLICATION_GOAL_PER_DAY, default 3) and progress against it. */
  goal: {
    perDay: number;
    today: number;
    /** Goal for the current Berlin week (perDay × 7) and applications so far this week. */
    perWeek: number;
    thisWeek: number;
  };
  needsAttention: NeedsAttentionItemDto[];
  upcomingInterviews: EventWithApplicationDto[];
  recentActivity: EventWithApplicationDto[];
}

export type ErrorCode = 'NOT_FOUND' | 'VALIDATION_ERROR' | 'CONFLICT' | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export interface HealthDto {
  status: 'ok' | 'degraded';
  database: 'up' | 'down';
}
