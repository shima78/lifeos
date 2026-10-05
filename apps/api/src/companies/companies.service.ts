import type {
  CompanyDetailDto,
  CompanyDto,
  CompanyListQuery,
  CreateCompanyData,
  UpdateCompanyData,
} from '@lifeos/contracts';
import { Injectable } from '@nestjs/common';
import { toApplicationDto } from '../applications/application.mapper';
import { ConflictError, NotFoundError } from '../common/errors';
import { CompaniesRepository } from './companies.repository';
import { toCompanyDto } from './company.mapper';

@Injectable()
export class CompaniesService {
  constructor(private readonly companies: CompaniesRepository) {}

  async list(query: CompanyListQuery = {}): Promise<CompanyDto[]> {
    const rows = await this.companies.findMany(query.search);
    return rows.map(toCompanyDto);
  }

  async get(id: string): Promise<CompanyDetailDto> {
    const company = await this.companies.findById(id);
    if (!company) throw NotFoundError.entity('Company', id);
    const applications = await this.companies.findApplications(id);
    return { ...toCompanyDto(company), applications: applications.map(toApplicationDto) };
  }

  async create(data: CreateCompanyData): Promise<CompanyDto> {
    if (await this.companies.findByName(data.name)) {
      throw new ConflictError(`A company named "${data.name}" already exists`);
    }
    return toCompanyDto(await this.companies.create(data));
  }

  async update(id: string, data: UpdateCompanyData): Promise<CompanyDto> {
    if (!(await this.companies.findById(id))) throw NotFoundError.entity('Company', id);
    if (data.name !== undefined) {
      const clash = await this.companies.findByName(data.name);
      if (clash && clash.id !== id) {
        throw new ConflictError(`A company named "${data.name}" already exists`);
      }
    }
    return toCompanyDto(await this.companies.update(id, data));
  }

  /** Finds a company by name (trimmed, case-insensitive) or creates it. Returns its id. */
  async findOrCreateByName(name: string): Promise<string> {
    const existing = await this.companies.findByName(name);
    if (existing) return existing.id;
    const created = await this.companies.create({ name });
    return created.id;
  }
}
