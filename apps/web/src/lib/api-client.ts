import type {
  ApiErrorBody,
  AssistantStatusDto,
  ApplicationDto,
  ApplicationEventDto,
  ApplicationListQueryInput,
  ChangeStatusInput,
  CompanyDetailDto,
  CompanyDto,
  CreateApplicationInput,
  CreateApplicationResultDto,
  CreateCompanyInput,
  CreateEventInput,
  DashboardDto,
  ErrorCode,
  UpdateApplicationInput,
  UpdateCompanyInput,
  VoidEventInput,
} from '@lifeos/contracts';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const BASE_URL = API_BASE_URL;

export interface FieldIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK_ERROR',
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }

  /** Field-level validation issues, if the API returned any. */
  get fieldIssues(): FieldIssue[] {
    return Array.isArray(this.details)
      ? (this.details as FieldIssue[]).filter((d) => typeof d?.path === 'string')
      : [];
  }
}

type QueryValue = string | number | boolean | string[] | undefined | null;

function toSearchParams(query: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(`${key}[]`, v));
    else params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      `Cannot reach the LifeOS API at ${BASE_URL}. Is it running?`,
    );
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'INTERNAL_ERROR',
      err?.message ?? res.statusText,
      err?.details,
    );
  }
  return data as T;
}

/** Typed client for the LifeOS REST API. Input types come from the shared contracts. */
export const api = {
  dashboard: () => request<DashboardDto>('GET', '/dashboard'),

  assistant: {
    status: () => request<AssistantStatusDto>('GET', '/assistant/status'),
  },

  companies: {
    list: (search?: string) =>
      request<CompanyDto[]>('GET', `/companies${toSearchParams({ search })}`),
    get: (id: string) => request<CompanyDetailDto>('GET', `/companies/${id}`),
    create: (input: CreateCompanyInput) => request<CompanyDto>('POST', '/companies', input),
    update: (id: string, input: UpdateCompanyInput) =>
      request<CompanyDto>('PATCH', `/companies/${id}`, input),
  },

  applications: {
    list: (query: ApplicationListQueryInput = {}) =>
      request<ApplicationDto[]>(
        'GET',
        `/applications${toSearchParams(query as Record<string, QueryValue>)}`,
      ),
    get: (id: string) => request<ApplicationDto>('GET', `/applications/${id}`),
    create: (input: CreateApplicationInput) =>
      request<CreateApplicationResultDto>('POST', '/applications', input),
    update: (id: string, input: UpdateApplicationInput) =>
      request<ApplicationDto>('PATCH', `/applications/${id}`, input),
    changeStatus: (id: string, input: ChangeStatusInput) =>
      request<ApplicationDto>('POST', `/applications/${id}/status`, input),
    timeline: (id: string) => request<ApplicationEventDto[]>('GET', `/applications/${id}/timeline`),
    addEvent: (id: string, input: CreateEventInput) =>
      request<ApplicationEventDto>('POST', `/applications/${id}/events`, input),
    voidEvent: (id: string, eventId: string, input: VoidEventInput) =>
      request<ApplicationEventDto>('POST', `/applications/${id}/events/${eventId}/void`, input),
  },
};
