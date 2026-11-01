import type { INestApplication } from '@nestjs/common';
import { API_BASE_PATH } from '@inspower/shared';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import helmet from 'helmet';
import { assertEveryRouteHasARule } from './modules/access/route-check';
import type { Env } from './platform/config/config';
import { ENV } from './platform/config/config.module';
import { NestLogger } from './platform/logging/logging.module';

/** Shared by main.ts and the integration tests, so tests run the real HTTP setup. */
export function setupApp(app: INestApplication): INestApplication {
  const env = app.get<Env>(ENV);
  app.useLogger(app.get(NestLogger));
  app.setGlobalPrefix(API_BASE_PATH.replace(/^\//, ''));

  const express = app.getHttpAdapter().getInstance() as Express;
  express.disable('x-powered-by');
  express.set(
    'trust proxy',
    env.TRUST_PROXY.split(',').map((s) => s.trim()),
  );

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      strictTransportSecurity: env.COOKIE_SECURE
        ? { maxAge: 31_536_000, includeSubDomains: true }
        : false,
    }),
  );
  app.use(cookieParser());
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  app.enableShutdownHooks();

  assertEveryRouteHasARule(app);
  return app;
}
