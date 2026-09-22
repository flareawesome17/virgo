import { Injectable } from '@nestjs/common';
import {
  assertIdentifier,
  ListOptions,
  OwnedRepository,
} from '../common/owned.repository';
import { DatabaseService } from '../database/database.service';
import { FRIEND_PRESENTED, FRIEND_VISIBLE } from './friend-sql';

export type FriendStatus = 'pending' | 'accepted' | 'declined';
export type RequestedBy = 'me' | 'them';

export interface FriendRow {
  id: string;
  user_id: string;
  /** The account this friendship points at. Null on rows predating 014. */
  friend_user_id: string | null;
  friend_name: string;
  friend_email: string | null;
  friend_avatar_url: string | null;
  status: FriendStatus;
  requested_by: RequestedBy;
  /**
   * When this row was declined, kept by a trigger (069). Internal: the
   * presented select never returns it.
   */
  declined_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class FriendsRepository extends OwnedRepository<FriendRow> {
  protected readonly table = 'friends';

  /**
   * `status` and `requested_by` are deliberately absent.
   *
   * They are state transitions in a two-row relationship, owned by
   * FriendsService.respond(), which updates *both* sides in one transaction and
   * refuses to let you answer a request you sent yourself.
   *
   * While they were writable, the generic `PATCH /friends/:id` reached them
   * through OwnedRepository.update — scoped to the caller's own row, which for
   * the sender of a request is exactly the row areFriends() reads. So the
   * sender could set their own copy to 'accepted' and then message, group,
   * collaborate with, and invite a person who had never agreed to any of it.
   *
   * Only `create` may set them, and it is the service that supplies the values.
   */
  protected readonly writableColumns = [
    'id',
    'friend_name',
    'friend_email',
    'friend_avatar_url',
  ];

  protected readonly filterableColumns = ['status', 'requested_by'];
  protected readonly sortableColumns = [
    'created_at',
    'updated_at',
    'friend_name',
  ];

  constructor(db: DatabaseService) {
    super(db);
  }

  /**
   * The owner's visible rows, presented.
   *
   * Overrides the generic `select *` so a list can never show a half-pair, an
   * orphaned request, a row across a block, or an email address the owner did
   * not type themselves. Every column is qualified, because the mirror joined
   * as `b` has the same names.
   */
  async findAll(userId: string, options: ListOptions = {}): Promise<FriendRow[]> {
    const params: unknown[] = [userId];
    const where = ['f.user_id = $1', FRIEND_VISIBLE, ...this.filterSql(options.filters, params)];

    const orderColumn = this.sortableColumns.includes(options.orderBy ?? '')
      ? (options.orderBy as string)
      : this.defaultOrderBy;
    const direction = (
      options.direction === 'asc' || options.direction === 'desc'
        ? options.direction
        : this.defaultDirection
    ).toUpperCase();
    const limit = Math.min(Math.max(options.limit ?? 50, 1), this.maxLimit);
    const offset = Math.max(options.offset ?? 0, 0);

    params.push(limit, offset);
    const column = assertIdentifier(orderColumn, 'column');

    // f.id breaks ties, so a page boundary between rows written in the same
    // transaction does not repeat or skip one.
    return this.db.query<FriendRow>(
      `${FRIEND_PRESENTED}
        where ${where.join(' and ')}
        order by f.${column} ${direction}, f.id ${direction}
        limit $${params.length - 1} offset $${params.length}`,
      params,
    );
  }

  /** The same predicate as findAll, so `total` always matches the list. */
  async count(
    userId: string,
    filters: Record<string, unknown> = {},
  ): Promise<number> {
    const params: unknown[] = [userId];
    const where = ['f.user_id = $1', FRIEND_VISIBLE, ...this.filterSql(filters, params)];

    const row = await this.db.queryOne<{ count: string }>(
      `select count(*)::text as count
         from friends f
         left join friends b on b.user_id = f.friend_user_id and b.friend_user_id = f.user_id
        where ${where.join(' and ')}`,
      params,
    );
    return Number(row?.count ?? 0);
  }

  /**
   * One of the owner's rows, presented but not filtered: the service re-reads
   * through here after every write, and the row it just wrote has to come back
   * even when the list would not show it.
   */
  async findOne(userId: string, id: string): Promise<FriendRow | null> {
    return this.db.queryOne<FriendRow>(
      `${FRIEND_PRESENTED} where f.id = $1 and f.user_id = $2`,
      [id, userId],
    );
  }

  private filterSql(
    filters: Record<string, unknown> | undefined,
    params: unknown[],
  ): string[] {
    const clauses: string[] = [];
    for (const [column, value] of Object.entries(filters ?? {})) {
      if (value === undefined || value === null) continue;
      if (!this.filterableColumns.includes(column)) continue;
      params.push(value);
      clauses.push(`f.${assertIdentifier(column, 'column')} = $${params.length}`);
    }
    return clauses;
  }
}
