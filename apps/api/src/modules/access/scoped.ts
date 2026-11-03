import type { AuthContext } from './request-context';

/**
 * Location scoping, in one place. A person sees every location unless their access is
 * restricted (`user_locations` rows) or every role assignment names a location. `null`
 * means no restriction. Services pass the result to `where` clauses; nothing scopes by hand.
 */
export interface ScopeInput {
  isSuperAdmin: boolean;
  /** Restricted locations from user_locations; empty = not restricted */
  restrictedLocationIds: readonly string[];
  /** Location on each role assignment; null = every location */
  assignmentLocationIds: readonly (string | null)[];
}

export function visibleLocationIds(input: ScopeInput): Set<string> | null {
  if (input.isSuperAdmin) return null;
  const restricted = input.restrictedLocationIds.length
    ? new Set(input.restrictedLocationIds)
    : null;
  const anyUnscopedRole = input.assignmentLocationIds.some((id) => id === null);
  const roleScoped = anyUnscopedRole
    ? null
    : new Set(input.assignmentLocationIds.filter((id): id is string => id !== null));
  if (!restricted && !roleScoped) return null;
  if (restricted && roleScoped) return new Set([...restricted].filter((id) => roleScoped.has(id)));
  return restricted ?? roleScoped;
}

/** A Prisma `where` fragment for tables with a `locationId` column. */
export function locationWhere(
  visible: Set<string> | null,
  column = 'locationId',
): Record<string, unknown> {
  if (visible === null) return {};
  return { [column]: { in: [...visible] } };
}

export function canSeeLocation(
  visible: Set<string> | null,
  locationId: string | null | undefined,
): boolean {
  if (visible === null) return true;
  if (!locationId) return false;
  return visible.has(locationId);
}

export function scopeOf(auth: AuthContext): Set<string> | null {
  return visibleLocationIds({
    isSuperAdmin: auth.isSuperAdmin,
    restrictedLocationIds: auth.restrictedLocationIds,
    assignmentLocationIds: auth.assignmentLocationIds,
  });
}
