import 'reflect-metadata';
import { loadDotEnv } from './platform/config/dotenv';
loadDotEnv();
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupApp } from './app.setup';
import { type Env, InvalidEnvironmentError, isPlaceholderKey } from './platform/config/config';
import { ENV } from './platform/config/config.module';
import { LOGGER } from './platform/logging/logging.module';
import { RealtimeGateway } from './modules/realtime/realtime.gateway';
import type { Logger } from './platform/logging/logger';

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  setupApp(app);
  const env = app.get<Env>(ENV);
  const logger = app.get<Logger>(LOGGER);

  for (const name of ['AUTH_ENCRYPTION_KEY', 'BACKUP_ENCRYPTION_KEY'] as const) {
    if (isPlaceholderKey(env[name])) {
      logger.warn(
        `${name} is a placeholder; a fixed local key is in use. Set a real key before sharing data.`,
      );
    }
  }

  app.get(RealtimeGateway).start();
  await app.listen(env.API_PORT, env.API_HOST);
  logger.info(
    { host: env.API_HOST, port: env.API_PORT, version: env.APP_VERSION },
    'API listening',
  );
}

main().catch((error: unknown) => {
  if (error instanceof InvalidEnvironmentError) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
});
