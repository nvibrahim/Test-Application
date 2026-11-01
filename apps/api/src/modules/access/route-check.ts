import type { INestApplication } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { ACCESS_RULE, type AccessRule } from './decorators';

/**
 * Deny by default, checked at boot: every controller method that is an HTTP route must
 * declare an access rule. A missing rule fails the start with the offending routes named.
 */
export function unguardedRoutes(app: INestApplication): string[] {
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  const reflector = app.get(Reflector);
  const missing: string[] = [];

  for (const wrapper of discovery.getControllers()) {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) continue;
    const prototype = Object.getPrototypeOf(instance) as object;
    for (const method of scanner.getAllMethodNames(prototype)) {
      const handler = (prototype as Record<string, unknown>)[method];
      if (typeof handler !== 'function') continue;
      const isRoute = Reflect.getMetadata('path', handler) !== undefined;
      if (!isRoute) continue;
      const rule =
        reflector.get<AccessRule | undefined>(ACCESS_RULE, handler) ??
        reflector.get<AccessRule | undefined>(ACCESS_RULE, metatype);
      if (!rule) missing.push(`${metatype.name}.${method}`);
    }
  }
  return missing;
}

export function assertEveryRouteHasARule(app: INestApplication): void {
  const missing = unguardedRoutes(app);
  if (missing.length) {
    throw new Error(
      `Every route needs @Public(), @SignedIn() or @RequirePermissions(). Missing on:\n  ${missing.join('\n  ')}`,
    );
  }
}
