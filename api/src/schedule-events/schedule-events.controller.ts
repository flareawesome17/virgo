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
import {
  CreateScheduleEventDto,
  ListScheduleEventsDto,
  UpdateScheduleEventDto,
} from './dto/schedule-event.dto';
import { ScheduleEventsService } from './schedule-events.service';

@Controller('schedule-events')
export class ScheduleEventsController {
  constructor(private readonly events: ScheduleEventsService) {}

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

    const filters = {
      workspace_id: query.workspace_id,
      event_type: query.event_type,
    };
    const [data, total] = await Promise.all([
      this.events.list(userId, { ...query, filters }),
      this.events.count(userId, filters),
    ]);
    return { data, total };
  }

  @Get(':id')
  get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.events.get(userId, id);
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
