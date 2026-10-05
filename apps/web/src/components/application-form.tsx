'use client';

import {
  APPLICATION_STATUSES,
  type ApplicationDto,
  type ApplicationStatus,
  STATUS_LABELS,
  SUBMITTED_STATUSES,
  createApplicationSchema,
  updateApplicationSchema,
} from '@lifeos/contracts';
import { CircleAlert, ExternalLink, LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { CompanyCombobox } from '@/components/company-combobox';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { ApiError } from '@/lib/api-client';
import { toBerlinDateString } from '@/lib/format';
import { useCreateApplication, useUpdateApplication } from '@/lib/queries';

interface FormValues {
  companyName: string;
  title: string;
  url: string;
  location: string;
  employmentType: string;
  status: ApplicationStatus;
  appliedAt: string;
  nextAction: string;
  nextActionDate: string;
  recruiterName: string;
  recruiterEmail: string;
  notes: string;
  description: string;
}

type Errors = Partial<Record<keyof FormValues, string>>;

const EMPLOYMENT_TYPES = [
  'Full-time',
  'Part-time',
  'Contract',
  'Internship',
  'Working student',
  'Freelance',
];

function initialValues(app?: ApplicationDto): FormValues {
  return {
    companyName: app?.company.name ?? '',
    title: app?.title ?? '',
    url: app?.url ?? '',
    location: app?.location ?? '',
    employmentType: app?.employmentType ?? '',
    status: app?.status ?? 'SAVED',
    appliedAt: app?.appliedAt ? toBerlinDateString(app.appliedAt) : '',
    nextAction: app?.nextAction ?? '',
    nextActionDate: app?.nextActionDate ? toBerlinDateString(app.nextActionDate) : '',
    recruiterName: app?.recruiterName ?? '',
    recruiterEmail: app?.recruiterEmail ?? '',
    notes: app?.notes ?? '',
    description: app?.description ?? '',
  };
}

function issuesToErrors(issues: { path: string | (string | number)[]; message: string }[]): Errors {
  const errors: Errors = {};
  for (const issue of issues) {
    const key = (Array.isArray(issue.path) ? issue.path.join('.') : issue.path) as keyof FormValues;
    errors[key] ??= issue.message;
  }
  return errors;
}

/** Create form when `application` is absent, edit form otherwise. Status is changed on the detail page. */
export function ApplicationForm({ application }: { application?: ApplicationDto }) {
  const isEdit = Boolean(application);
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(() => initialValues(application));
  const [errors, setErrors] = useState<Errors>({});
  const [duplicateOf, setDuplicateOf] = useState<ApplicationDto | null>(null);

  const create = useCreateApplication();
  const update = useUpdateApplication(application?.id ?? '');
  const pending = create.isPending || update.isPending;

  const set =
    <K extends keyof FormValues>(key: K) =>
    (value: FormValues[K]) => {
      setValues((v) => ({ ...v, [key]: value }));
      setErrors((e) => ({ ...e, [key]: undefined }));
    };
  const bind = (key: Exclude<keyof FormValues, 'status' | 'companyName'>) => ({
    id: key,
    value: values[key],
    'aria-invalid': errors[key] ? true : undefined,
    onChange: (e: { target: { value: string } }) => set(key)(e.target.value),
  });

  const handleApiError = (err: unknown) => {
    if (err instanceof ApiError && err.fieldIssues.length)
      setErrors(issuesToErrors(err.fieldIssues));
    if (err instanceof ApiError && err.code === 'CONFLICT')
      setErrors((e) => ({ ...e, url: err.message }));
    toast.error(err instanceof Error ? err.message : 'Could not save');
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setDuplicateOf(null);
    const { status, ...rest } = values;

    if (isEdit && application) {
      const parsed = updateApplicationSchema.safeParse(rest);
      if (!parsed.success) return setErrors(issuesToErrors(parsed.error.issues));
      try {
        await update.mutateAsync(rest);
        toast.success('Application updated');
        router.push(`/applications/${application.id}`);
      } catch (err) {
        handleApiError(err);
      }
      return;
    }

    const input = { ...rest, status };
    const parsed = createApplicationSchema.safeParse(input);
    if (!parsed.success) return setErrors(issuesToErrors(parsed.error.issues));
    try {
      const result = await create.mutateAsync(input);
      if (result.duplicate) {
        setDuplicateOf(result.application);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      toast.success('Application added');
      for (const warning of result.warnings) {
        toast.warning('Possible duplicate', {
          description: warning.message,
          duration: 10_000,
          action: {
            label: 'View',
            onClick: () => router.push(`/applications/${warning.applicationId}`),
          },
        });
      }
      router.push(`/applications/${result.application.id}`);
    } catch (err) {
      handleApiError(err);
    }
  };

  const showAppliedHint =
    !isEdit && SUBMITTED_STATUSES.includes(values.status) && !values.appliedAt;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {duplicateOf && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-50 p-4 text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:bg-amber-500/10 dark:text-amber-200"
        >
          <div className="flex gap-3">
            <CircleAlert className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-medium">You already tracked this</p>
              <p className="text-sm opacity-90">
                {duplicateOf.title} at {duplicateOf.company.name} uses the same job URL. Nothing new
                was created.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href={`/applications/${duplicateOf.id}`}>Open existing</Link>
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
          <Field id="companyName" label="Company" error={errors.companyName}>
            <CompanyCombobox
              id="companyName"
              value={values.companyName}
              onChange={set('companyName')}
              invalid={Boolean(errors.companyName)}
            />
          </Field>
          <Field id="title" label="Position" error={errors.title}>
            <Input {...bind('title')} placeholder="e.g. Backend Engineer" autoFocus={!isEdit} />
          </Field>
          <Field
            id="url"
            label="Job posting URL"
            error={errors.url}
            hint="Tracking parameters are removed automatically."
            className="sm:col-span-2"
          >
            <div className="flex gap-2">
              <Input {...bind('url')} type="url" inputMode="url" placeholder="https://…" />
              {values.url && /^https?:\/\//.test(values.url) && (
                <Button asChild variant="outline" size="icon" aria-label="Open URL">
                  <a href={values.url} target="_blank" rel="noreferrer">
                    <ExternalLink />
                  </a>
                </Button>
              )}
            </div>
          </Field>
          <Field id="location" label="Location" error={errors.location}>
            <Input {...bind('location')} placeholder="e.g. Munich, Remote" />
          </Field>
          <Field id="employmentType" label="Employment type" error={errors.employmentType}>
            <Input {...bind('employmentType')} list="employment-types" placeholder="Full-time" />
            <datalist id="employment-types">
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>

          {!isEdit && (
            <Field id="status" label="Status" error={errors.status}>
              <NativeSelect
                id="status"
                value={values.status}
                onChange={(e) => set('status')(e.target.value as ApplicationStatus)}
              >
                {APPLICATION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field
            id="appliedAt"
            label="Applied on"
            error={errors.appliedAt}
            hint={showAppliedHint ? 'Defaults to today for this status.' : undefined}
          >
            <Input {...bind('appliedAt')} type="date" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
          <Field id="nextAction" label="Next action" error={errors.nextAction}>
            <Input {...bind('nextAction')} placeholder="e.g. Follow up with recruiter" />
          </Field>
          <Field id="nextActionDate" label="Next action date" error={errors.nextActionDate}>
            <Input {...bind('nextActionDate')} type="date" />
          </Field>
          <Field id="recruiterName" label="Recruiter name" error={errors.recruiterName}>
            <Input {...bind('recruiterName')} autoComplete="off" />
          </Field>
          <Field id="recruiterEmail" label="Recruiter email" error={errors.recruiterEmail}>
            <Input {...bind('recruiterEmail')} type="email" autoComplete="off" />
          </Field>
          <Field id="notes" label="Notes" error={errors.notes} className="sm:col-span-2">
            <Textarea {...bind('notes')} rows={3} placeholder="Anything worth remembering" />
          </Field>
          <Field
            id="description"
            label="Job description"
            error={errors.description}
            className="sm:col-span-2"
          >
            <Textarea
              {...bind('description')}
              rows={6}
              placeholder="Paste the job description for reference"
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <LoaderCircle className="animate-spin" />}
          {isEdit ? 'Save changes' : 'Add application'}
        </Button>
      </div>
    </form>
  );
}
