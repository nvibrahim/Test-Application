import { DEFAULT_APP_NAME } from '@inspower/shared';

/**
 * The product name shown on every page. Phase 4 reads it from Settings -> General through
 * the public settings endpoint; until then it is the default from the shared package.
 */
export function appName(): string {
  return process.env['APP_NAME'] ?? DEFAULT_APP_NAME;
}
