import { BadRequestException, Injectable } from '@nestjs/common';
import { OwnedResourceService } from '../common/owned-resource.service';
import { ScheduleEventsService } from '../schedule-events/schedule-events.service';
import { ReminderRow, RemindersRepository } from './reminders.repository';

@Injectable()
export class RemindersService extends OwnedResourceService<ReminderRow> {
  constructor(
    private readonly reminders: RemindersRepository,
    private readonly events: ScheduleEventsService,
  ) {
    super(reminders, 'Reminder');
  }

  /** Nullable FK, so only a supplied value is checked. */
  private async assertEvent(
    userId: string,
    eventId: string | undefined | null,
  ): Promise<void> {
    if (eventId === undefined || eventId === null) return;
    const owned = await this.events.assertOwned(userId, eventId);
    if (!owned) throw new BadRequestException('Unknown schedule event');
  }

  async create(
    userId: string,
    data: Record<string, unknown>,
  ): Promise<ReminderRow> {
    await this.assertEvent(
      userId,
      data.schedule_event_id as string | undefined,
    );
    return super.create(userId, data);
  }

  async update(
    userId: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<ReminderRow> {
    await this.assertEvent(
      userId,
      data.schedule_event_id as string | undefined,
    );
    return super.update(userId, id, data);
  }
}
