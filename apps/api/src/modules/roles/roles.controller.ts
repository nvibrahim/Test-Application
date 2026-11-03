import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { createRoleRequestSchema, updateRoleRequestSchema } from '@inspower/shared';
import { z } from 'zod';
import { ZodPipe } from '../../platform/http/zod.pipe';
import { RequirePermissions, RequireStepUp } from '../access/decorators';
import { authOf } from '../access/request-context';
import { RolesService } from './roles.service';

type Create = ReturnType<typeof createRoleRequestSchema.parse>;
type Update = ReturnType<typeof updateRoleRequestSchema.parse>;
const uuid = new ZodPipe(z.string().uuid());

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  /** Roles, the registry and its modules: everything the matrix screen needs. */
  @RequirePermissions('roles.read')
  @Get()
  list(@Req() req: Request) {
    return this.roles.list(authOf(req));
  }

  @RequirePermissions('roles.read')
  @Get(':id')
  get(@Req() req: Request, @Param('id', uuid) id: string) {
    return this.roles.get(authOf(req), id);
  }

  @RequirePermissions('roles.manage')
  @RequireStepUp()
  @Post()
  create(@Req() req: Request, @Body(new ZodPipe(createRoleRequestSchema)) body: Create) {
    return this.roles.create(req, authOf(req), body);
  }

  @RequirePermissions('roles.manage')
  @RequireStepUp()
  @Put(':id')
  update(
    @Req() req: Request,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(updateRoleRequestSchema)) body: Update,
  ) {
    return this.roles.update(req, authOf(req), id, body);
  }

  @RequirePermissions('roles.manage')
  @RequireStepUp()
  @Post(':id/reset')
  @HttpCode(200)
  reset(@Req() req: Request, @Param('id', uuid) id: string) {
    return this.roles.resetToDefault(req, authOf(req), id);
  }

  @RequirePermissions('roles.manage')
  @RequireStepUp()
  @Delete(':id')
  @HttpCode(204)
  async delete(@Req() req: Request, @Param('id', uuid) id: string): Promise<void> {
    await this.roles.delete(req, authOf(req), id);
  }
}
