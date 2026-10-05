import type { CompanyDto } from '@lifeos/contracts';
import type { CompanyWithCount } from './companies.repository';

export function toCompanyDto(company: CompanyWithCount): CompanyDto {
  return {
    id: company.id,
    name: company.name,
    website: company.website,
    location: company.location,
    notes: company.notes,
    applicationCount: company._count.applications,
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
  };
}
