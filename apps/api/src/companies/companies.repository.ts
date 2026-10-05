import { Injectable } from '@nestjs/common';
import { type Company, Prisma } from '@prisma/client';
import type { ApplicationWithCompany } from '../applications/application.mapper';
import { ConflictError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';

export type CompanyWithCount = Company & { _count: { applications: number } };

export const companyNameKey = (name: string): string => name.trim().toLowerCase();

const withCount = { _count: { select: { applications: true } } } as const;

@Injectable()
export class CompaniesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(search?: string): Promise<CompanyWithCount[]> {
    return this.prisma.db.company.findMany({
      where: search ? { name: { contains: search, mode: 'insensitive' } } : undefined,
      include: withCount,
      orderBy: { name: 'asc' },
    });
  }

  findById(id: string): Promise<CompanyWithCount | null> {
    return this.prisma.db.company.findUnique({ where: { id }, include: withCount });
  }

  /** The company's applications, most recent activity first. */
  findApplications(companyId: string): Promise<ApplicationWithCompany[]> {
    return this.prisma.db.application.findMany({
      where: { companyId },
      include: { company: { select: { id: true, name: true } } },
      orderBy: [{ lastActivityAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
  }

  findByName(name: string): Promise<Company | null> {
    return this.prisma.db.company.findUnique({ where: { nameKey: companyNameKey(name) } });
  }

  async create(data: {
    name: string;
    website?: string | null;
    location?: string | null;
    notes?: string | null;
  }): Promise<CompanyWithCount> {
    try {
      return await this.prisma.db.company.create({
        data: { ...data, name: data.name.trim(), nameKey: companyNameKey(data.name) },
        include: withCount,
      });
    } catch (err) {
      throw this.translate(err, data.name);
    }
  }

  async update(
    id: string,
    data: {
      name?: string;
      website?: string | null;
      location?: string | null;
      notes?: string | null;
    },
  ): Promise<CompanyWithCount> {
    try {
      return await this.prisma.db.company.update({
        where: { id },
        data: {
          ...data,
          ...(data.name !== undefined && {
            name: data.name.trim(),
            nameKey: companyNameKey(data.name),
          }),
        },
        include: withCount,
      });
    } catch (err) {
      throw this.translate(err, data.name ?? '');
    }
  }

  private translate(err: unknown, name: string): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictError(`A company named "${name.trim()}" already exists`);
    }
    return err;
  }
}
