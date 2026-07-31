import { Injectable } from '@nestjs/common';
import { OwnedRepository } from '../common/owned.repository';
import { DatabaseService } from '../database/database.service';

export interface ReminderRow {
  id: string;
  user_id: string;
  schedule_event_id: string | null;
  title: string;
  description: string | null;
  reminder_time: Date;
  is_alarm_enabled: boolean;
  has_push_notification: boolean;
  is_completed: boolean;
  created_at: Date;
}

@Injectable()
export class RemindersRepository extends OwnedRepository<ReminderRow> {
  protected readonly table = 'reminders';

  protected readonly writableColumns = [
    'id',
    'schedule_event_id',
    'title',
    'description',
    'reminder_time',
    'is_alarm_enabled',
    'has_push_notification',
    'is_completed',
  ];

  protected readonly filterableColumns = [
    'schedule_event_id',
    'is_completed',
  ];

  protected readonly sortableColumns = ['reminder_time', 'created_at', 'title'];
  protected readonly defaultOrderBy = 'reminder_time';
  protected readonly defaultDirection = 'asc' as const;

  constructor(db: DatabaseService) {
    super(db);
  }
}
