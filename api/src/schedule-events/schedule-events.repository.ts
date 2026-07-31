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

  /** Calendar and agenda screens need a window, not offset pagination. */
  async findInRange(
    userId: string,
    from: string,
    to: string,
  ): Promise<ScheduleEventRow[]> {
    return this.db.query<ScheduleEventRow>(
      `select * from schedule_events
        where user_id = $1 and event_date between $2 and $3
        order by event_date asc, event_time asc nulls last`,
      [userId, from, to],
    );
  }
}
