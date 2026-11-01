import { SetMetadata } from '@nestjs/common';

/**
 * Access rules. Every route must carry exactly one of these, or the API refuses to start
 * (see `assertEveryRouteHasARule`). Phase 0 ships the markers and the startup check; the
 * guard that enforces them against a session arrives with Phase 1 and Phase 3.
 */
export const ACCESS_RULE = 'inspower:access-rule';

export type AccessRule =
  | { kind: 'public' }
  | { kind: 'signed-in'; stages: readonly string[] }
  | { kind: 'permissions'; all: readonly string[] }
  | { kind: 'any-permission'; any: readonly string[] };

export const Public = () => SetMetadata<string, AccessRule>(ACCESS_RULE, { kind: 'public' });

export const SignedIn = (...stages: string[]) =>
  SetMetadata<string, AccessRule>(ACCESS_RULE, {
    kind: 'signed-in',
    stages: stages.length ? stages : ['active'],
  });

export const RequirePermissions = (...all: string[]) =>
  SetMetadata<string, AccessRule>(ACCESS_RULE, { kind: 'permissions', all });

export const RequireAnyPermission = (...any: string[]) =>
  SetMetadata<string, AccessRule>(ACCESS_RULE, { kind: 'any-permission', any });
