import { z } from 'zod';
import { berlinWallTimeToUtc } from './dates';
import { APPLICATION_STATUSES, applicationStatusSchema, manualEventTypeSchema } from './enums';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * Accepts either a calendar date (YYYY-MM-DD, meaning that day in Europe/Berlin) or a full
 * ISO-8601 datetime. Output is a Date (UTC instant).
 */
export const dateInputSchema = z
  .string()
  .trim()
  .refine((v) => DATE_ONLY.test(v) || (ISO_DATETIME.test(v) && !Number.isNaN(Date.parse(v))), {
    message: 'Expected a date (YYYY-MM-DD) or an ISO datetime',
  })
  .transform((v) => (DATE_ONLY.test(v) ? berlinWallTimeToUtc(v) : new Date(v)));

/** Blank strings become undefined so forms can send empty optional fields. */
const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
/** For updates: blank strings become null, which clears the field. */
const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max).optional());
const nullableText = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max).nullable().optional());
const optionalDate = z.preprocess(blankToUndefined, dateInputSchema.optional());
const nullableDate = z.preprocess(blankToNull, dateInputSchema.nullable().optional());
const urlSchema = z
  .string()
  .trim()
  .max(2000)
  .url('Must be a valid URL')
  .refine((v) => /^https?:\/\//i.test(v), { message: 'URL must start with http:// or https://' });
const emailSchema = z.string().trim().email('Must be a valid email').max(320);

// ---------- Companies ----------

export const createCompanySchema = z.object({
  name: z.string().trim().min(1, 'Company name is required').max(200),
  website: z.preprocess(blankToUndefined, urlSchema.optional()),
  location: optionalText(200),
  notes: optionalText(5000),
});
export type CreateCompanyInput = z.input<typeof createCompanySchema>;
export type CreateCompanyData = z.output<typeof createCompanySchema>;

export const updateCompanySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    website: z.preprocess(blankToNull, urlSchema.nullable().optional()),
    location: nullableText(200),
    notes: nullableText(5000),
  })
  .strict();
export type UpdateCompanyInput = z.input<typeof updateCompanySchema>;
export type UpdateCompanyData = z.output<typeof updateCompanySchema>;

export const companyListQuerySchema = z.object({
  search: optionalText(200),
});
export type CompanyListQueryInput = z.input<typeof companyListQuerySchema>;
export type CompanyListQuery = z.output<typeof companyListQuerySchema>;

// ---------- Applications ----------

export const createApplicationSchema = z.object({
  companyName: z.string().trim().min(1, 'Company is required').max(200),
  title: z.string().trim().min(1, 'Title is required').max(300),
  url: z.preprocess(blankToUndefined, urlSchema.optional()),
  location: optionalText(200),
  employmentType: optionalText(100),
  description: optionalText(20000),
  status: applicationStatusSchema.default('SAVED'),
  appliedAt: optionalDate,
  nextAction: optionalText(500),
  nextActionDate: optionalDate,
  recruiterName: optionalText(200),
  recruiterEmail: z.preprocess(blankToUndefined, emailSchema.optional()),
  notes: optionalText(20000),
});
export type CreateApplicationInput = z.input<typeof createApplicationSchema>;
export type CreateApplicationData = z.output<typeof createApplicationSchema>;

/** Every field except status, which changes only through the status endpoint. */
export const updateApplicationSchema = z
  .object({
    companyName: z.string().trim().min(1).max(200).optional(),
    title: z.string().trim().min(1).max(300).optional(),
    url: z.preprocess(blankToNull, urlSchema.nullable().optional()),
    location: nullableText(200),
    employmentType: nullableText(100),
    description: nullableText(20000),
    appliedAt: nullableDate,
    nextAction: nullableText(500),
    nextActionDate: nullableDate,
    recruiterName: nullableText(200),
    recruiterEmail: z.preprocess(blankToNull, emailSchema.nullable().optional()),
    notes: nullableText(20000),
  })
  .strict();
export type UpdateApplicationInput = z.input<typeof updateApplicationSchema>;
export type UpdateApplicationData = z.output<typeof updateApplicationSchema>;

export const changeStatusSchema = z.object({
  status: applicationStatusSchema,
  occurredAt: optionalDate,
  note: optionalText(5000),
});
export type ChangeStatusInput = z.input<typeof changeStatusSchema>;
export type ChangeStatusData = z.output<typeof changeStatusSchema>;

export const APPLICATION_SORT_FIELDS = [
  'company',
  'title',
  'status',
  'appliedAt',
  'lastActivityAt',
  'nextActionDate',
] as const;
export type ApplicationSortField = (typeof APPLICATION_SORT_FIELDS)[number];
export type SortOrder = 'asc' | 'desc';

const toArray = (v: unknown) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);

export const applicationListQuerySchema = z.object({
  search: optionalText(200),
  status: z.preprocess(toArray, z.array(z.enum(APPLICATION_STATUSES)).optional()),
  companyId: optionalText(100),
  location: optionalText(200),
  appliedFrom: optionalDate,
  appliedTo: optionalDate,
  sort: z.enum(APPLICATION_SORT_FIELDS).default('lastActivityAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type ApplicationListQueryInput = z.input<typeof applicationListQuerySchema>;
export type ApplicationListQuery = z.output<typeof applicationListQuerySchema>;

// ---------- Events ----------

/** The plain object shape of a manual event, for composing into other schemas (e.g. MCP tools). */
export const createEventFieldsSchema = z.object({
  type: manualEventTypeSchema,
  title: optionalText(300),
  description: optionalText(10000),
  occurredAt: optionalDate,
  scheduledFor: optionalDate,
});

export const createEventSchema = createEventFieldsSchema.superRefine((v, ctx) => {
  if (v.type === 'INTERVIEW_SCHEDULED' && !v.scheduledFor) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['scheduledFor'],
      message: 'Interview date is required for a scheduled interview',
    });
  }
});
export type CreateEventInput = z.input<typeof createEventSchema>;
export type CreateEventData = z.output<typeof createEventSchema>;

export const voidEventSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required').max(1000),
});
export type VoidEventInput = z.input<typeof voidEventSchema>;
export type VoidEventData = z.output<typeof voidEventSchema>;
