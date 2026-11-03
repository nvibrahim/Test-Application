import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createBackupTargetSchema, restoreRequestSchema } from '@inspower/shared';
import { z } from 'zod';
import { ZodPipe } from '../../platform/http/zod.pipe';
import { RequirePermissions, RequireStepUp } from '../access/decorators';
import { authOf } from '../access/request-context';
import { BackupsService } from './backups.service';

const uuid = new ZodPipe(z.string().uuid());
type CreateTarget = ReturnType<typeof createBackupTargetSchema.parse>;

/** Backups: read for backups.read, run/download/verify for backups.run (step-up), restore reserved. */
@Controller('backups')
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  @RequirePermissions('backups.read')
  @Get()
  list(@Req() req: Request) {
    return this.backups.list(authOf(req));
  }

  @RequirePermissions('backups.run')
  @RequireStepUp()
  @Post()
  @HttpCode(202)
  runNow(@Req() req: Request) {
    return this.backups.runNow(req, authOf(req));
  }

  @RequirePermissions('backups.read')
  @Get('targets')
  targets(@Req() req: Request) {
    return this.backups.targets(authOf(req));
  }

  @RequirePermissions('backups.run')
  @RequireStepUp()
  @Post('targets')
  createTarget(
    @Req() req: Request,
    @Body(new ZodPipe(createBackupTargetSchema)) body: CreateTarget,
  ) {
    return this.backups.createTarget(req, authOf(req), body);
  }

  @RequirePermissions('backups.run')
  @RequireStepUp()
  @Delete('targets/:id')
  @HttpCode(204)
  async deleteTarget(@Req() req: Request, @Param('id', uuid) id: string) {
    await this.backups.deleteTarget(req, authOf(req), id);
  }

  @RequirePermissions('backups.run')
  @Post(':id/verify')
  @HttpCode(202)
  verify(@Req() req: Request, @Param('id', uuid) id: string) {
    return this.backups.verify(authOf(req), id);
  }

  @RequirePermissions('backups.run')
  @RequireStepUp()
  @Get(':id/download')
  download(@Req() req: Request, @Param('id', uuid) id: string, @Res() res: Response) {
    return this.backups.download(req, authOf(req), id, res);
  }

  @RequirePermissions('backups.restore')
  @RequireStepUp()
  @Post(':id/restore')
  @HttpCode(202)
  restore(
    @Req() req: Request,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(restoreRequestSchema)) _body: unknown,
  ) {
    return this.backups.scheduleRestore(req, authOf(req), id);
  }
}
