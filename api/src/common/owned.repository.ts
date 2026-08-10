import { QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service';

/** Postgres identifier: lowercase word characters only. */
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function assertIdentifier(value: string, kind: string): string {
  if (!IDENTIFIER.test(value)) {
    throw new Error(`Unsafe ${kind} identifier: ${value}`);
  }
  return value;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  /** Column name from `filterableColumns` mapped to an exact-match value. */
  filters?: Record<string, unknown>;
  /** Column name from `sortableColumns`. */
  orderBy?: string;
  direction?: 'asc' | 'desc';
}

/**
 * Base repository for user-owned rows.
 *
 * REPLACES ROW LEVEL SECURITY. The previous backend used `auth.uid() = user_id` policies
 * were the last line of defence — every query was filtered by the database no
 * matter what the caller did. On vanilla Postgres that guarantee is gone, so it
 * is reconstructed here: every method takes `userId` as its first argument and
 * every generated statement carries `where user_id = $n`. There is no method on
 * this class that can read or write a row without scoping it to an owner.
 *
 * Feature code must go through these methods rather than calling
 * DatabaseService directly for owned tables. A raw query that forgets the
 * predicate is a cross-tenant data leak with nothing behind it to catch the
 * mistake.
 *
 * Table and column names are interpolated rather than parameterized, because
 * Postgres does not accept bind parameters for identifiers. They come only from
 * subclass constants, never from request data, and are validated against
 * IDENTIFIER as a second line of defence. All *values* are parameterized.
 */
export abstract class OwnedRepository<Row extends QueryResultRow> {
  /** Table name. Must be a literal in the subclass, never request-derived. */
  protected abstract readonly table: string;

  /** Columns accepted from clients on create/update. */
  protected abstract readonly writableColumns: readonly string[];

  /** Columns clients may filter on via query string. */
  protected readonly filterableColumns: readonly string[] = [];

  /** Columns clients may sort by. */
  protected readonly sortableColumns: readonly string[] = ['created_at'];

  protected readonly defaultOrderBy: string = 'created_at';
  protected readonly defaultDirection: 'asc' | 'desc' = 'desc';
  protected readonly maxLimit: number = 100;

  constructor(protected readonly db: DatabaseService) {}

  private get safeTable(): string {
    return assertIdentifier(this.table, 'table');
  }

  async findAll(userId: string, options: ListOptions = {}): Promise<Row[]> {
    const params: unknown[] = [userId];
    const where: string[] = ['user_id = $1'];

    for (const [column, value] of Object.entries(options.filters ?? {})) {
      if (value === undefined || value === null) continue;
      if (!this.filterableColumns.includes(column)) continue;
      params.push(value);
      where.push(`${assertIdentifier(column, 'column')} = $${params.length}`);
    }

    const orderColumn = this.sortableColumns.includes(options.orderBy ?? '')
      ? (options.orderBy as string)
      : this.defaultOrderBy;
    const direction =
      options.direction === 'asc' || options.direction === 'desc'
        ? options.direction
        : this.defaultDirection;

    const limit = Math.min(Math.max(options.limit ?? 50, 1), this.maxLimit);
    const offset = Math.max(options.offset ?? 0, 0);

    params.push(limit, offset);

    return this.db.query<Row>(
      `select * from ${this.safeTable}
        where ${where.join(' and ')}
        order by ${assertIdentifier(orderColumn, 'column')} ${direction.toUpperCase()}
        limit $${params.length - 1} offset $${params.length}`,
      params,
    );
  }

  async count(
    userId: string,
    filters: Record<string, unknown> = {},
  ): Promise<number> {
    const params: unknown[] = [userId];
    const where: string[] = ['user_id = $1'];

    for (const [column, value] of Object.entries(filters)) {
      if (value === undefined || value === null) continue;
      if (!this.filterableColumns.includes(column)) continue;
      params.push(value);
      where.push(`${assertIdentifier(column, 'column')} = $${params.length}`);
    }

    const row = await this.db.queryOne<{ count: string }>(
      `select count(*)::text as count from ${this.safeTable} where ${where.join(' and ')}`,
      params,
    );
    return Number(row?.count ?? 0);
  }

  async findOne(userId: string, id: string): Promise<Row | null> {
    return this.db.queryOne<Row>(
      `select * from ${this.safeTable} where id = $1 and user_id = $2`,
      [id, userId],
    );
  }

  /** True when the row exists AND belongs to this user. */
  async existsForUser(userId: string, id: string): Promise<boolean> {
    const row = await this.db.queryOne<{ one: number }>(
      `select 1 as one from ${this.safeTable} where id = $1 and user_id = $2`,
      [id, userId],
    );
    return row !== null;
  }

  async create(userId: string, data: Record<string, unknown>): Promise<Row> {
    const entries = Object.entries(data).filter(
      ([column, value]) =>
        value !== undefined && this.writableColumns.includes(column),
    );

    // user_id is taken from the authenticated principal and prepended here, so
    // a client-supplied user_id in the body is ignored rather than honoured.
    const columns = ['user_id', ...entries.map(([c]) => c)];
    const values = [userId, ...entries.map(([, v]) => v)];
    const placeholders = values.map((_, i) => `$${i + 1}`);

    const row = await this.db.queryOne<Row>(
      `insert into ${this.safeTable} (${columns
        .map((c) => assertIdentifier(c, 'column'))
        .join(', ')})
       values (${placeholders.join(', ')})
       returning *`,
      values,
    );
    // INSERT ... RETURNING always yields a row when it does not throw.
    return row as Row;
  }

  async update(
    userId: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<Row | null> {
    const entries = Object.entries(data).filter(
      ([column, value]) =>
        value !== undefined && this.writableColumns.includes(column),
    );

    if (entries.length === 0) return this.findOne(userId, id);

    const params: unknown[] = entries.map(([, v]) => v);
    const assignments = entries.map(
      ([column], i) => `${assertIdentifier(column, 'column')} = $${i + 1}`,
    );

    params.push(id, userId);

    return this.db.queryOne<Row>(
      `update ${this.safeTable}
          set ${assignments.join(', ')}
        where id = $${params.length - 1} and user_id = $${params.length}
        returning *`,
      params,
    );
  }

  /** True when a row was actually deleted; false when it did not exist or was not theirs. */
  async remove(userId: string, id: string): Promise<boolean> {
    const rows = await this.db.query<{ id: string }>(
      `delete from ${this.safeTable} where id = $1 and user_id = $2 returning id`,
      [id, userId],
    );
    return rows.length > 0;
  }
}
