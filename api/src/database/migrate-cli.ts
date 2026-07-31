/**
 * Standalone migration runner: `npm run migrate`.
 *
 * Boots only the config + database providers rather than the whole Nest app, so
 * migrations can run in CI or a release step without starting an HTTP listener.
 */
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { runMigrations } from './migrator';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [DatabaseService, ConfigService],
})
class MigrateModule {}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(MigrateModule, {
    logger: ['log', 'error', 'warn'],
  });
  try {
    await runMigrations(app.get(DatabaseService));
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
