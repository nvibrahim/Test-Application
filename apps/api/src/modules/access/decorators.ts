import { SetMetadata } from '@nestjs/common';

/**
 * Access rules. Every route must carry exactly one of these, or the API refuses to start
 * (see `assertEveryRouteHasARule`). The global `AccessGuard` enforces them.
 */
export const ACCESS_RULE = 'inspower:access-rule';
export const ALLOW_DURING_SETUP = 'inspower:allow-during-setup';
export const SKIP_CSRF = 'inspower:skip-csrf';

export type AccessRule =
  | { kind: 'public' }
  | { kind: 'signed-in'; stages: readonly string[] }
  | { kind: 'permissions'; all: readonly string[] }
  | { kind: 'any-permission'; any: readonly string[] };

export const Public = () => SetMetadata<string, AccessRule>(ACCESS_RULE, { kind: 'public' });

/** A completed sign-in in one of the given stages (default: `active`). */
export const SignedIn = (...stages: string[]) =>
  SetMetadata<string, AccessRule>(ACCESS_RULE, {
    kind: 'signed-in',
    stages: stages.length ? stages : ['active'],
  });

export const RequirePermissions = (...all: string[]) =>
  SetMetadata<string, AccessRule>(ACCESS_RULE, { kind: 'permissions', all });

export const RequireAnyPermission = (...any: string[]) =>
  SetMetadata<string, AccessRule>(ACCESS_RULE, { kind: 'any-permission', any });

/** The rest of the app stays locked until the first-run setup is complete; these routes do not. */
export const AllowDuringSetup = () => SetMetadata(ALLOW_DURING_SETUP, true);

/** For routes no browser calls (machine clients). Nothing in Phase 1 uses it. */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF, true);
