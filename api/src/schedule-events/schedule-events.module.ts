import { Module } from '@nestjs/common';
import { EventAttendeesService } from './event-attendees.service';
import { EventCleanupService } from './event-cleanup.service';
import { FriendsModule } from '../friends/friends.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ScheduleEventsController } from './schedule-events.controller';
import { ScheduleEventsRepository } from './schedule-events.repository';
import { ScheduleEventsService } from './schedule-events.service';

@Module({
  // FriendsModule because you can only invite people you are friends with.
  imports: [WorkspacesModule, FriendsModule],
  controllers: [ScheduleEventsController],
  providers: [
    ScheduleEventsService,
    ScheduleEventsRepository,
    EventAttendeesService,
    EventCleanupService,
  ],
  // Exported so reminders can verify schedule_event ownership.
  exports: [ScheduleEventsService],
})
export class ScheduleEventsModule {}
