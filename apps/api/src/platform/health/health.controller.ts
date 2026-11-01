import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../modules/access/decorators';
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

  /**
   * Full details. Phase 0 has no sessions yet, so this is marked Public and limited to
   * loopback; Phase 3 replaces the marker with @RequirePermissions('system.read').
   */
  @Public()
  @Get('details')
  async details(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return this.health.details();
  }
}
