import { Injectable } from '@nestjs/common';
import { OwnedRepository } from '../common/owned.repository';
import { DatabaseService } from '../database/database.service';

export type EventType =
  | 'shoot'
  | 'editing'
  | 'review'
  | 'delivery'
  | 'meeting';

export interface ScheduleEventRow {
  id: string;
  user_id: string;
  workspace_id: string | null;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string | null;
  event_type: EventType;
  created_at: Date;
}

/** A row from a read path that also returns events you were invited to. */
export interface VisibleScheduleEventRow extends ScheduleEventRow {
  /** False when you are attending someone else's event. */
  is_owner: boolean;
}

@Injectable()
export class ScheduleEventsRepository extends OwnedRepository<ScheduleEventRow> {
  protected readonly table = 'schedule_events';

  protected readonly writableColumns = [
    'id',
    'workspace_id',
    'title',
    'description',
    'event_date',
    'event_time',
    'event_type',
  ];

  protected readonly filterableColumns = [
    'workspace_id',
    'event_type',
    'event_date',
  ];

  // No updated_at on this table, matching the original Supabase schema.
  protected readonly sortableColumns = ['event_date', 'created_at', 'title'];
  protected readonly defaultOrderBy = 'event_date';
  protected readonly defaultDirection = 'asc' as const;

  constructor(db: DatabaseService) {
    super(db);
  }

  /**
   * Events on a user's calendar: their own, plus ones they accepted an
   * invitation to.
   *
   * Written out here rather than going through the base class, which scopes
   * every statement to `user_id = $1` on purpose. That rule is what replaces
   * row level security, so widening it is done in one named place, spelled out,
   * where the extra predicate is visible — not by relaxing the base and hoping
   * every other table still holds.
   *
   * A pending or declined invitation is deliberately not here. Only a yes puts
   * something on your calendar.
   */
  private static readonly VISIBLE = `
    from schedule_events e
   where (e.user_id = $1
          or exists (select 1
                       from event_attendees a
                      where a.event_id = e.id
                        and a.user_id = $1
                        and a.status = 'accepted'))`;

  /** Calendar and agenda screens need a window, not offset pagination. */
  async findInRange(
    userId: string,
    from: string,
    to: string,
  ): Promise<VisibleScheduleEventRow[]> {
    return this.db.query<VisibleScheduleEventRow>(
      `select e.*, (e.user_id = $1) as is_owner
       ${ScheduleEventsRepository.VISIBLE}
         and e.event_date between $2 and $3
       order by e.event_date asc, e.event_time asc nulls last`,
      [userId, from, to],
    );
  }

  /**
   * The paginated list, same visibility rule as findInRange.
   *
   * The two filters are named explicitly instead of looped over
   * `filterableColumns`: this statement is hand-written, and an interpolated
   * column name deserves to be a literal in the source rather than something
   * assembled from a list.
   */
  async findAllVisible(
    userId: string,
    options: {
      workspaceId?: string;
      eventType?: string;
      limit?: number;
      offset?: number;
      orderBy?: string;
      direction?: 'asc' | 'desc';
    } = {},
  ): Promise<VisibleScheduleEventRow[]> {
    const params: unknown[] = [userId];
    let where = '';

    if (options.workspaceId) {
      params.push(options.workspaceId);
      where += ` and e.workspace_id = $${params.length}`;
    }
    if (options.eventType) {
      params.push(options.eventType);
      where += ` and e.event_type = $${params.length}`;
    }

    const orderBy = this.sortableColumns.includes(options.orderBy ?? '')
      ? (options.orderBy as string)
      : this.defaultOrderBy;
    const direction = options.direction === 'desc' ? 'DESC' : 'ASC';

    params.push(Math.min(Math.max(options.limit ?? 50, 1), this.maxLimit));
    params.push(Math.max(options.offset ?? 0, 0));

    return this.db.query<VisibleScheduleEventRow>(
      `select e.*, (e.user_id = $1) as is_owner
       ${ScheduleEventsRepository.VISIBLE}${where}
       order by e.${orderBy} ${direction}
       limit $${params.length - 1} offset $${params.length}`,
      params,
    );
  }

  async countVisible(
    userId: string,
    options: { workspaceId?: string; eventType?: string } = {},
  ): Promise<number> {
    const params: unknown[] = [userId];
    let where = '';

    if (options.workspaceId) {
      params.push(options.workspaceId);
      where += ` and e.workspace_id = $${params.length}`;
    }
    if (options.eventType) {
      params.push(options.eventType);
      where += ` and e.event_type = $${params.length}`;
    }

    const row = await this.db.queryOne<{ count: string }>(
      `select count(*)::text as count
       ${ScheduleEventsRepository.VISIBLE}${where}`,
      params,
    );
    return Number(row?.count ?? 0);
  }

  /** One event, if the user owns it or is attending it. */
  async findVisible(
    userId: string,
    id: string,
  ): Promise<VisibleScheduleEventRow | null> {
    return this.db.queryOne<VisibleScheduleEventRow>(
      `select e.*, (e.user_id = $1) as is_owner
       ${ScheduleEventsRepository.VISIBLE}
         and e.id = $2`,
      [userId, id],
    );
  }
}
