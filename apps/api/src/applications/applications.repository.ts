import type { ApplicationSortField, ApplicationStatus, SortOrder } from '@lifeos/contracts';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConflictError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import type { ApplicationWithCompany } from './application.mapper';

const includeCompany = { company: { select: { id: true, name: true } } } as const;

export interface ApplicationFilter {
  search?: string;
  statuses?: ApplicationStatus[];
  companyId?: string;
  location?: string;
  appliedFrom?: Date;
  /** Exclusive upper bound. */
  appliedBefore?: Date;
}

export interface ApplicationWriteData {
  companyId?: string;
  title?: string;
  url?: string | null;
  location?: string | null;
  employmentType?: string | null;
  description?: string | null;
  status?: ApplicationStatus;
  appliedAt?: Date | null;
  nextAction?: string | null;
  nextActionDate?: Date | null;
  recruiterName?: string | null;
  recruiterEmail?: string | null;
  notes?: string | null;
}

export type ApplicationCreateData = ApplicationWriteData & { companyId: string; title: string };

@Injectable()
export class ApplicationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<ApplicationWithCompany | null> {
    return this.prisma.db.application.findUnique({ where: { id }, include: includeCompany });
  }

  findByUrl(url: string): Promise<ApplicationWithCompany | null> {
    return this.prisma.db.application.findUnique({ where: { url }, include: includeCompany });
  }

  /** Same company, same title and same location (case-insensitive; missing location matches missing). */
  findSimilar(
    companyId: string,
    title: string,
    location?: string | null,
  ): Promise<ApplicationWithCompany[]> {
    return this.prisma.db.application.findMany({
      where: {
        companyId,
        title: { equals: title, mode: 'insensitive' },
        location: location ? { equals: location, mode: 'insensitive' } : null,
      },
      include: includeCompany,
    });
  }

  findMany(
    filter: ApplicationFilter = {},
    sort: ApplicationSortField = 'lastActivityAt',
    order: SortOrder = 'desc',
  ): Promise<ApplicationWithCompany[]> {
    const where: Prisma.ApplicationWhereInput = {};
    if (filter.search) {
      where.OR = [
        { title: { contains: filter.search, mode: 'insensitive' } },
        { company: { name: { contains: filter.search, mode: 'insensitive' } } },
      ];
    }
    if (filter.statuses?.length) where.status = { in: filter.statuses };
    if (filter.companyId) where.companyId = filter.companyId;
    if (filter.location) where.location = { contains: filter.location, mode: 'insensitive' };
    if (filter.appliedFrom || filter.appliedBefore) {
      where.appliedAt = {
        ...(filter.appliedFrom && { gte: filter.appliedFrom }),
        ...(filter.appliedBefore && { lt: filter.appliedBefore }),
      };
    }

    return this.prisma.db.application.findMany({
      where,
      include: includeCompany,
      orderBy: [orderByFor(sort, order), { createdAt: 'desc' }, { id: 'asc' }],
    });
  }

  findAll(): Promise<ApplicationWithCompany[]> {
    return this.prisma.db.application.findMany({ include: includeCompany });
  }

  async create(data: ApplicationCreateData): Promise<ApplicationWithCompany> {
    try {
      return await this.prisma.db.application.create({ data, include: includeCompany });
    } catch (err) {
      throw translateUnique(err);
    }
  }

  async update(id: string, data: ApplicationWriteData): Promise<ApplicationWithCompany> {
    try {
      return await this.prisma.db.application.update({
        where: { id },
        data,
        include: includeCompany,
      });
    } catch (err) {
      throw translateUnique(err);
    }
  }
}

function orderByFor(
  sort: ApplicationSortField,
  order: SortOrder,
): Prisma.ApplicationOrderByWithRelationInput {
  switch (sort) {
    case 'company':
      return { company: { name: order } };
    case 'title':
      return { title: order };
    case 'status':
      return { status: order };
    case 'appliedAt':
    case 'lastActivityAt':
    case 'nextActionDate':
      // Empty values always sort last, whichever direction.
      return { [sort]: { sort: order, nulls: 'last' } };
  }
}

function translateUnique(err: unknown): unknown {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return new ConflictError('Another application already uses this URL');
  }
  return err;
}
