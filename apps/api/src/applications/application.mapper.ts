import type { ApplicationDto, ApplicationSummaryDto } from '@lifeos/contracts';
import type { Application, Company } from '@prisma/client';
import { toIso } from '../common/dates';

export type ApplicationWithCompany = Application & { company: Pick<Company, 'id' | 'name'> };

export function toApplicationDto(app: ApplicationWithCompany): ApplicationDto {
  return {
    id: app.id,
    company: { id: app.company.id, name: app.company.name },
    title: app.title,
    url: app.url,
    location: app.location,
    employmentType: app.employmentType,
    description: app.description,
    status: app.status,
    appliedAt: toIso(app.appliedAt),
    nextAction: app.nextAction,
    nextActionDate: toIso(app.nextActionDate),
    recruiterName: app.recruiterName,
    recruiterEmail: app.recruiterEmail,
    notes: app.notes,
    lastActivityAt: toIso(app.lastActivityAt),
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
  };
}

export function toApplicationSummaryDto(app: ApplicationWithCompany): ApplicationSummaryDto {
  return {
    id: app.id,
    title: app.title,
    status: app.status,
    company: { id: app.company.id, name: app.company.name },
  };
}
