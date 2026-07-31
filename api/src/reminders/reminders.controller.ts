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
  CreateReminderDto,
  ListRemindersDto,
  UpdateReminderDto,
} from './dto/reminder.dto';
import { RemindersService } from './reminders.service';

@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get()
  async list(
    @CurrentUser('id') userId: string,
    @Query() query: ListRemindersDto,
  ) {
    const filters = {
      schedule_event_id: query.schedule_event_id,
      is_completed: query.is_completed,
    };
    const [data, total] = await Promise.all([
      this.reminders.list(userId, { ...query, filters }),
      this.reminders.count(userId, filters),
    ]);
    return { data, total };
  }

  @Get(':id')
  get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.reminders.get(userId, id);
  }

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateReminderDto) {
    return this.reminders.create(userId, { ...dto });
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateReminderDto,
  ) {
    return this.reminders.update(userId, id, { ...dto });
  }

  @HttpCode(204)
  @Delete(':id')
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.reminders.remove(userId, id);
  }
}
