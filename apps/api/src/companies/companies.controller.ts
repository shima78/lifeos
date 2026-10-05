import {
  type CompanyDetailDto,
  type CompanyDto,
  type CompanyListQuery,
  type CreateCompanyData,
  type UpdateCompanyData,
  companyListQuerySchema,
  createCompanySchema,
  updateCompanySchema,
} from '@lifeos/contracts';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CompaniesService } from './companies.service';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(companyListQuerySchema)) query: CompanyListQuery,
  ): Promise<CompanyDto[]> {
    return this.companies.list(query);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createCompanySchema)) body: CreateCompanyData,
  ): Promise<CompanyDto> {
    return this.companies.create(body);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<CompanyDetailDto> {
    return this.companies.get(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCompanySchema)) body: UpdateCompanyData,
  ): Promise<CompanyDto> {
    return this.companies.update(id, body);
  }
}
