import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public, RequirePermissions } from '../../modules/access/decorators';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  @HttpCode(200)
  async shallow(@Res({ passthrough: true }) res: Response) {
    const result = await this.health.shallow();
    res.setHeader('Cache-Control', 'no-store');
    if (result.status === 'down') res.status(503);
    return result;
  }

  /** Full details: every dependency. Needs the system.read permission (the Super Admin always has it). */
  @RequirePermissions('system.read')
  @Get('details')
  async details(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return this.health.details();
  }
}
