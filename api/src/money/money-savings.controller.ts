import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateSavingDto, CreateSavingMoveDto, ListSavingsDto, UpdateSavingDto } from './dto/saving.dto';
import { MoneySavingsService } from './money-savings.service';

/**
 * Savings: what the signed-in account is putting aside, and toward what.
 * Notes of their own money; nothing here holds or moves any.
 */
@Controller('money/savings')
export class MoneySavingsController {
  constructor(private readonly savings: MoneySavingsService) {}

  @Get()
  list(@CurrentUser('id') userId: string, @Query() query: ListSavingsDto) {
    return this.savings.list(userId, query.month);
  }

  @Get(':id')
  get(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.savings.get(userId, id);
  }

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateSavingDto) {
    return this.savings.create(userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSavingDto,
  ) {
    return this.savings.update(userId, id, dto);
  }

  @HttpCode(204)
  @Delete(':id')
  async remove(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.savings.remove(userId, id);
  }

  /** Puts money in (a positive amount) or takes it out (a negative one). */
  @HttpCode(200)
  @Post(':id/moves')
  move(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSavingMoveDto,
  ) {
    return this.savings.move(userId, id, dto);
  }

  @Delete(':id/moves/:moveId')
  removeMove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('moveId', ParseUUIDPipe) moveId: string,
  ) {
    return this.savings.removeMove(userId, id, moveId);
  }
}
