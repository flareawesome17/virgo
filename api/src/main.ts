import 'reflect-metadata';
import { setDefaultResultOrder } from 'node:dns';
import { setDefaultAutoSelectFamily } from 'node:net';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';
import { DatabaseService } from './database/database.service';
import { runMigrations } from './database/migrator';

/**
 * Connect to one address at a time, IPv4 first.
 *
 * Node 20 turned on Happy Eyeballs by default: `net.connect` races the
 * resolved addresses, abandoning each after `autoSelectFamilyAttemptTimeout`
 * — 250ms — and moving to the next. Backblaze publishes eight records for its
 * S3 endpoint (four A, four AAAA) and its TLS handshake from here takes
 * 600ms-8s, comfortably longer than 250ms. So every attempt was cancelled
 * mid-handshake and the whole connection failed after about a second, even
 * though each address works fine when dialled directly.
 *
 * Measured in the API container:
 *   default (racing, 250ms)   ETIMEDOUT after 1033ms
 *   autoSelectFamily: false   connected in 637ms
 *
 * The visible symptom was every upload failing at the confirm step with
 * "Could not reach storage", on files that had already reached the bucket —
 * devices upload straight to B2 and are not affected, only the API's own
 * HEAD is.
 *
 * `ipv4first` pairs with it: with the race off, the first address is the one
 * that gets used, and the bridge network has no IPv6 route.
 *
 * Both set at module scope so they apply before anything opens a socket.
 */
setDefaultResultOrder('ipv4first');
setDefaultAutoSelectFamily(false);

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
    // Keeps the untouched request body on `request.rawBody`.
    //
    // PayMongo signs the exact bytes it sent, so the signature has to be
    // checked against those and not against a re-serialised object: JSON.parse
    // followed by JSON.stringify reorders nothing but does change whitespace
    // and unicode escaping, and either is enough to make a legitimate webhook
    // look forged.
    rawBody: true,
  });
  const config = app.get(ConfigService);

  // Plain `ws`, not socket.io: React Native and the browser both speak the
  // WebSocket protocol natively, so no client library is needed on either.
  app.useWebSocketAdapter(new WsAdapter(app));

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
