import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResultRow, types as pgTypes } from 'pg';

/**
 * Return `date` columns as the plain `YYYY-MM-DD` string Postgres stores.
 *
 * By default node-pg turns OID 1082 into a JS Date at local midnight, which
 * JSON-serialises as a full UTC timestamp — `event_date` reached the app as
 * "2026-08-05T00:00:00.000Z". The calendar keys its lookups by "2026-08-05",
 * so no day ever matched and no event indicator was ever drawn.
 *
 * It is also wrong on its own terms: a calendar date has no time or zone, and
 * converting it to one shifts the day for anyone west of UTC.
 *
 * Registered at module load, before any pool is created, so every connection
 * inherits it. Timestamps (1114/1184) are untouched and stay Dates.
 */
const PG_DATE_OID = 1082;
pgTypes.setTypeParser(PG_DATE_OID, (value: string) => value);

/**
 * Thin wrapper over a pg connection pool.
 *
 * Deliberately not an ORM: the schema lives in migrations/*.sql and queries are
 * written as SQL. This keeps one source of truth for the schema, the same way
 * the previous hosted setup did.
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  /**
   * The pool is built here rather than in onModuleInit because
   * NestFactory.create() does not run lifecycle hooks — they fire on init()/
   * listen(). Anything that touches the database before the server starts
   * listening (migrations, most obviously) would otherwise find `pool`
   * undefined. `new Pool()` is synchronous and connects lazily, so there is
   * nothing to await here anyway.
   */
  constructor(private readonly config: ConfigService) {
    const connectionString = this.config.getOrThrow<string>('DATABASE_URL');
    const sslMode = this.config.get<string>('DATABASE_SSL', 'disable');

    this.pool = new Pool({
      connectionString,
      max: Number(this.config.get('DATABASE_POOL_MAX', '10')),
      // Managed providers (Neon, RDS, Railway) terminate TLS with certificates
      // that are not in Node's default trust store.
      ssl: sslMode === 'require' ? { rejectUnauthorized: false } : undefined,
    });

    // A pool-level error means an idle client died (network blip, DB restart).
    // Without this listener Node treats it as an unhandled error and exits.
    this.pool.on('error', (err) => {
      this.logger.error(`Idle client error: ${err.message}`, err.stack);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  async query<T extends QueryResultRow>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    const result = await this.pool.query<T>(sql, params as unknown[]);
    return result.rows;
  }

  /** Returns the first row, or null when the query matched nothing. */
  async queryOne<T extends QueryResultRow>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  /**
   * Runs `fn` inside a transaction, rolling back on any thrown error. Always
   * use this for multi-statement writes — the pool hands out a different client
   * per query otherwise, so BEGIN and COMMIT would land on different connections.
   */
  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Used by the health endpoint to prove the database is actually reachable. */
  async ping(): Promise<boolean> {
    try {
      await this.pool.query('select 1');
      return true;
    } catch {
      return false;
    }
  }
}
