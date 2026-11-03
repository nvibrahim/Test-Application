import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  auditLogQuerySchema,
  featureSwitchUpdateSchema,
  jobRunQuerySchema,
  type AuditLogQuery,
} from '@inspower/shared';
import { z } from 'zod';
import { ZodPipe } from '../../platform/http/zod.pipe';
import { RequirePermissions, RequireStepUp, SignedIn } from '../access/decorators';
import { authOf } from '../access/request-context';
import { AuditLogService } from './audit-log.service';
import { FeaturesAdminService } from './features-admin.service';
import { JobsService } from './jobs.service';

const uuid = new ZodPipe(z.string().uuid());
const jobKey = new ZodPipe(z.string().regex(/^[a-z][a-z0-9-]*$/));
const featureKey = new ZodPipe(z.string().regex(/^[a-z][a-z0-9_]*$/));
type RunQuery = ReturnType<typeof jobRunQuerySchema.parse>;
type FeatureUpdate = ReturnType<typeof featureSwitchUpdateSchema.parse>;

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @RequirePermissions('system.read')
  @Get()
  list(@Req() req: Request, @Query(new ZodPipe(jobRunQuerySchema)) q: RunQuery) {
    return this.jobs.list(authOf(req), q);
  }

  @RequirePermissions('system.read')
  @Get('scheduled')
  async scheduled(@Req() req: Request) {
    return { jobs: await this.jobs.scheduled(authOf(req)) };
  }

  @RequirePermissions('jobs.manage')
  @Post('scheduled/:key/pause')
  @HttpCode(204)
  async pause(@Req() req: Request, @Param('key', jobKey) key: string) {
    await this.jobs.pause(req, authOf(req), key);
  }

  @RequirePermissions('jobs.manage')
  @Post('scheduled/:key/resume')
  @HttpCode(204)
  async resume(@Req() req: Request, @Param('key', jobKey) key: string) {
    await this.jobs.resume(req, authOf(req), key);
  }

  @RequirePermissions('jobs.manage')
  @Post('scheduled/:key/run')
  @HttpCode(202)
  async runNow(@Req() req: Request, @Param('key', jobKey) key: string) {
    await this.jobs.runNow(req, authOf(req), key);
    return { queued: true };
  }

  @RequirePermissions('jobs.manage')
  @Post(':id/retry')
  @HttpCode(204)
  async retry(@Req() req: Request, @Param('id', uuid) id: string) {
    await this.jobs.retry(req, authOf(req), id);
  }

  @RequirePermissions('jobs.manage')
  @Post(':id/cancel')
  @HttpCode(204)
  async cancel(@Req() req: Request, @Param('id', uuid) id: string) {
    await this.jobs.cancel(req, authOf(req), id);
  }

  @RequirePermissions('jobs.manage')
  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() req: Request, @Param('id', uuid) id: string) {
    await this.jobs.remove(req, authOf(req), id);
  }
}

@Controller('audit')
export class AuditLogController {
  constructor(private readonly audit: AuditLogService) {}

  @RequirePermissions('audit.read')
  @Get()
  list(@Req() req: Request, @Query(new ZodPipe(auditLogQuerySchema)) q: AuditLogQuery) {
    return this.audit.list(authOf(req), q);
  }

  @RequirePermissions('audit.export')
  @RequireStepUp()
  @Get('export.csv')
  export(
    @Req() req: Request,
    @Query(new ZodPipe(auditLogQuerySchema)) q: AuditLogQuery,
    @Res() res: Response,
  ) {
    return this.audit.exportCsv(req, authOf(req), q, res);
  }
}

@Controller('features')
export class FeaturesController {
  constructor(private readonly features: FeaturesAdminService) {}

  @RequirePermissions('features.manage')
  @Get()
  async list(@Req() req: Request) {
    return { features: await this.features.list(authOf(req)) };
  }

  @SignedIn()
  @Get('mine')
  async mine(@Req() req: Request) {
    return { features: await this.features.mine(authOf(req)) };
  }

  @RequirePermissions('features.manage')
  @RequireStepUp()
  @Put(':key')
  async update(
    @Req() req: Request,
    @Param('key', featureKey) key: string,
    @Body(new ZodPipe(featureSwitchUpdateSchema)) body: FeatureUpdate,
  ) {
    await this.features.update(req, authOf(req), key, body.state, body.userIds);
    return { features: await this.features.list(authOf(req)) };
  }
}
