import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { DatabaseService } from './database/database.service';
import { runMigrations } from './database/migrator';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
  });
  const config = app.get(ConfigService);

  // Behind a Cloudflare Tunnel there is exactly one hop in front of us
  // (cloudflared), so trust a single proxy — `true` would trust an
  // arbitrarily long X-Forwarded-For chain and let a caller claim any IP.
  // Rate limiting does not depend on this: CloudflareThrottlerGuard reads
  // CF-Connecting-IP, which Cloudflare overwrites and clients cannot forge.
  if (config.get<string>('TRUST_PROXY') === 'true') {
    app.set('trust proxy', 1);
  }

  app.use(helmet());

  // Explicit allow-list. A wildcard origin combined with credentials is
  // rejected by browsers anyway, and would be wrong here regardless.
  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins.length > 0 ? origins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      // Strip unknown properties rather than passing them through: without
      // this, a client could post user_id and have it reach the repository.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.enableShutdownHooks();

  // Auto-migrate is convenient in development but races when several instances
  // boot at once, so production should run `npm run migrate` as a release step.
  const autoMigrate =
    config.get<string>('RUN_MIGRATIONS_ON_BOOT') === 'true' ||
    config.get<string>('NODE_ENV') !== 'production';

  if (autoMigrate) {
    await runMigrations(app.get(DatabaseService));
  }

  const port = Number(config.get('PORT', '3000'));
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}`);
}

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start:', err);
  process.exit(1);
});
