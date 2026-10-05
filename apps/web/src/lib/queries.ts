'use client';

import type {
  ApplicationListQueryInput,
  ChangeStatusInput,
  CreateApplicationInput,
  CreateEventInput,
  UpdateApplicationInput,
  VoidEventInput,
} from '@lifeos/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api-client';

export const queryKeys = {
  dashboard: ['dashboard'] as const,
  companies: (search?: string) => ['companies', search ?? ''] as const,
  company: (id: string) => ['company', id] as const,
  applications: (query: ApplicationListQueryInput) => ['applications', query] as const,
  application: (id: string) => ['application', id] as const,
  timeline: (id: string) => ['timeline', id] as const,
};

export const useDashboard = () =>
  useQuery({ queryKey: queryKeys.dashboard, queryFn: api.dashboard });

export const useCompanies = (search?: string) =>
  useQuery({
    queryKey: queryKeys.companies(search),
    queryFn: () => api.companies.list(search),
    placeholderData: keepPreviousData,
  });

export const useCompany = (id: string) =>
  useQuery({ queryKey: queryKeys.company(id), queryFn: () => api.companies.get(id) });

export const useApplications = (query: ApplicationListQueryInput) =>
  useQuery({
    queryKey: queryKeys.applications(query),
    queryFn: () => api.applications.list(query),
    placeholderData: keepPreviousData,
  });

export const useApplication = (id: string) =>
  useQuery({ queryKey: queryKeys.application(id), queryFn: () => api.applications.get(id) });

export const useTimeline = (id: string) =>
  useQuery({ queryKey: queryKeys.timeline(id), queryFn: () => api.applications.timeline(id) });

/** Any write can affect lists, the dashboard, companies and the application itself. */
function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

export function useCreateApplication() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: CreateApplicationInput) => api.applications.create(input),
    onSuccess: invalidate,
  });
}

export function useUpdateApplication(id: string) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: UpdateApplicationInput) => api.applications.update(id, input),
    onSuccess: invalidate,
  });
}

export function useChangeStatus(id: string) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: ChangeStatusInput) => api.applications.changeStatus(id, input),
    onSuccess: invalidate,
  });
}

export function useAddEvent(id: string) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: CreateEventInput) => api.applications.addEvent(id, input),
    onSuccess: invalidate,
  });
}

export function useVoidEvent(id: string) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ eventId, ...input }: VoidEventInput & { eventId: string }) =>
      api.applications.voidEvent(id, eventId, input),
    onSuccess: invalidate,
  });
}
