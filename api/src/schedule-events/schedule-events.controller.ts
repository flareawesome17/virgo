import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { EventAttendeesService } from './event-attendees.service';
import { InviteToEventDto } from './dto/event-invite.dto';
import {
  CreateScheduleEventDto,
  ListScheduleEventsDto,
  UpdateScheduleEventDto,
} from './dto/schedule-event.dto';
import { ScheduleEventsService } from './schedule-events.service';

@Controller('schedule-events')
export class ScheduleEventsController {
  constructor(
    private readonly events: ScheduleEventsService,
    private readonly attendees: EventAttendeesService,
  ) {}

  /**
   * Event invitations addressed to the caller.
   *
   * Declared before `:id` so "invitations" is not swallowed as an id.
   */
  @Get('invitations')
  invitations(@CurrentUser('id') userId: string) {
    return this.attendees
      .invitations(userId)
      .then((data) => ({ data, total: data.length }));
  }

  @HttpCode(200)
  @Post('invitations/:id/accept')
  accept(@CurrentUser('id') userId: string, @Param('id') eventId: string) {
    return this.attendees.respond(userId, eventId, true);
  }

  @HttpCode(200)
  @Post('invitations/:id/decline')
  decline(@CurrentUser('id') userId: string, @Param('id') eventId: string) {
    return this.attendees.respond(userId, eventId, false);
  }

  @Get()
  async list(
    @CurrentUser('id') userId: string,
    @Query() query: ListScheduleEventsDto,
  ) {
    // Calendar/agenda screens fetch a date window; everything else paginates.
    if (query.from && query.to) {
      const data = await this.events.listRange(userId, query.from, query.to);
      return { data, total: data.length };
    }

    const options = {
      workspaceId: query.workspace_id,
      eventType: query.event_type,
      limit: query.limit,
      offset: query.offset,
      orderBy: query.orderBy,
      direction: query.direction,
    };
    const [data, total] = await Promise.all([
      this.events.listVisible(userId, options),
      this.events.countVisible(userId, options),
    ]);
    return { data, total };
  }

  /** Who was invited and what they said. Organiser or attendee. */
  @Get(':id/attendees')
  attendeesFor(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.attendees
      .attendees(userId, id)
      .then((data) => ({ data, total: data.length }));
  }

  /** Invites people to an event. Organiser only, friends only. */
  @HttpCode(200)
  @Post(':id/invite')
  invite(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: InviteToEventDto,
  ) {
    return this.attendees.invite(userId, id, dto.user_ids);
  }

  /** Withdraws an invitation. Organiser only. */
  @HttpCode(200)
  @Delete(':id/attendees/:attendeeUserId')
  uninvite(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('attendeeUserId') attendeeUserId: string,
  ) {
    return this.attendees.remove(userId, id, attendeeUserId);
  }

  @Get(':id')
  get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    // Visible rather than owned: someone attending needs to read the event
    // they said yes to.
    return this.events.getVisible(userId, id);
  }

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateScheduleEventDto,
  ) {
    return this.events.create(userId, { ...dto });
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateScheduleEventDto,
  ) {
    return this.events.update(userId, id, { ...dto });
  }

  @HttpCode(204)
  @Delete(':id')
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.events.remove(userId, id);
  }
}
