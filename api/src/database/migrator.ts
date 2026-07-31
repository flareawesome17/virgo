import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from './database.service';

const logger = new Logger('Migrator');

/**
 * Applies migrations/*.sql in filename order, once each, tracked in
 * schema_migrations. Each file runs inside its own transaction, so a failure
 * leaves the database on the last fully-applied migration rather than halfway
 * through a broken one.
 */
export async function runMigrations(db: DatabaseService): Promise<void> {
  const dir = resolve(
    process.env.MIGRATIONS_DIR ?? join(process.cwd(), 'migrations'),
  );

  await db.query(`
    create table if not exists schema_migrations (
      name        text primary key,
      applied_at  timestamptz not null default now()
    )
  `);

  const applied = new Set(
    (
      await db.query<{ name: string }>('select name from schema_migrations')
    ).map((r) => r.name),
  );

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    logger.log(`No pending migrations (${applied.size} already applied)`);
    return;
  }

  for (const file of pending) {
    const sql = readFileSync(join(dir, file), 'utf8');
    await db.transaction(async (client: PoolClient) => {
      await client.query(sql);
      await client.query('insert into schema_migrations (name) values ($1)', [
        file,
      ]);
    });
    logger.log(`Applied ${file}`);
  }

  logger.log(`Applied ${pending.length} migration(s)`);
}
