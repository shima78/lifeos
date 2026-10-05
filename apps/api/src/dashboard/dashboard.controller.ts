import type { DashboardDto } from '@lifeos/contracts';
import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(): Promise<DashboardDto> {
    return this.dashboard.get();
  }
}
