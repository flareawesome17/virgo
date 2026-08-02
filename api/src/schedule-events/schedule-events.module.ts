import { Module } from '@nestjs/common';
import { EventCleanupService } from './event-cleanup.service';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ScheduleEventsController } from './schedule-events.controller';
import { ScheduleEventsRepository } from './schedule-events.repository';
import { ScheduleEventsService } from './schedule-events.service';

@Module({
  imports: [WorkspacesModule],
  controllers: [ScheduleEventsController],
  providers: [ScheduleEventsService, ScheduleEventsRepository, EventCleanupService],
  // Exported so reminders can verify schedule_event ownership.
  exports: [ScheduleEventsService],
})
export class ScheduleEventsModule {}
