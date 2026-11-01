import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { ApiException, forbidden, unauthenticated } from '../../platform/http/api-error';
import { SessionsService } from '../auth/sessions.service';
import { CsrfService } from '../auth/csrf.service';
import {
  ACCESS_RULE,
  ALLOW_DURING_SETUP,
  REQUIRE_STEP_UP,
  SKIP_CSRF,
  type AccessRule,
} from './decorators';
import { StepUpService } from '../two-factor/step-up.service';
import type { AuthenticatedRequest } from './request-context';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Deny by default. Reads the route's access rule, loads the session from the cookie, checks
 * the stage, the setup lock and the permissions, and verifies CSRF on state-changing requests.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
    private readonly csrf: CsrfService,
    private readonly stepUp: StepUpService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const handler = context.getHandler();
    const cls = context.getClass();
    const rule =
      this.reflector.get<AccessRule | undefined>(ACCESS_RULE, handler) ??
      this.reflector.get<AccessRule | undefined>(ACCESS_RULE, cls);
    if (!rule) throw forbidden('No access rule on this route');

    const skipCsrf = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF, [handler, cls]) === true;
    if (!skipCsrf && STATE_CHANGING.has(req.method)) this.csrf.verify(req as Request);
    this.csrf.ensureCookie(req as Request, res);

    if (rule.kind === 'public') return true;

    const auth = await this.sessions.authenticate(req as Request, res);
    if (!auth) throw unauthenticated();
    req.auth = auth;

    const stages = rule.kind === 'signed-in' ? rule.stages : ['active'];
    if (!stages.includes(auth.stage)) {
      throw new ApiException(
        'wrong_stage',
        `This needs a session in stage ${stages.join(' or ')}`,
        { stage: auth.stage },
      );
    }

    const allowDuringSetup =
      this.reflector.getAllAndOverride<boolean>(ALLOW_DURING_SETUP, [handler, cls]) === true;
    if (auth.stage === 'active' && !auth.setupComplete && !allowDuringSetup) {
      throw new ApiException('setup_required', 'Finish the organization setup first');
    }

    if (rule.kind === 'permissions') {
      if (!auth.isSuperAdmin && !rule.all.every((p) => auth.permissions.has(p))) throw forbidden();
    } else if (rule.kind === 'any-permission') {
      if (!auth.isSuperAdmin && !rule.any.some((p) => auth.permissions.has(p))) throw forbidden();
    }
    const needsStepUp =
      this.reflector.getAllAndOverride<boolean>(REQUIRE_STEP_UP, [handler, cls]) === true;
    if (needsStepUp && !(await this.stepUp.hasGrant(auth.sessionId))) {
      throw new ApiException('step_up_required', 'Confirm it is you to continue');
    }
    return true;
  }
}
