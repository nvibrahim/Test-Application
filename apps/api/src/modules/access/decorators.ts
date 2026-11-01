import { SetMetadata } from '@nestjs/common';

/**
 * Access rules. Every route must carry exactly one of these, or the API refuses to start
 * (see `assertEveryRouteHasARule`). The global `AccessGuard` enforces them.
 */
export const ACCESS_RULE = 'inspower:access-rule';
export const ALLOW_DURING_SETUP = 'inspower:allow-during-setup';
export const SKIP_CSRF = 'inspower:skip-csrf';
export const REQUIRE_STEP_UP = 'inspower:require-step-up';
export const REQUIRE_FEATURE = 'inspower:require-feature';
export const ALLOW_DURING_MAINTENANCE = 'inspower:allow-during-maintenance';

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

/** A sensitive action: the person must have proved it is them within the last few minutes (POST /auth/step-up). */
export const RequireStepUp = () => SetMetadata(REQUIRE_STEP_UP, true);

/** The route exists only while one of these feature switches is on for the person (404 otherwise). */
export const RequireFeature = (...keys: string[]) => SetMetadata(REQUIRE_FEATURE, keys);

/** Still answers while maintenance mode is on: sign-out, the session itself, and what the shell needs to show the message. */
export const AllowDuringMaintenance = () => SetMetadata(ALLOW_DURING_MAINTENANCE, true);
