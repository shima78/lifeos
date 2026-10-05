import { Controller, Get } from '@nestjs/common';
import type { HealthDto } from '@lifeos/contracts';
import { DatabaseHealthRepository } from '../prisma/database-health.repository';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseHealthRepository) {}

  @Get()
  async check(): Promise<HealthDto> {
    const up = await this.database.ping();
    return { status: up ? 'ok' : 'degraded', database: up ? 'up' : 'down' };
  }
}
