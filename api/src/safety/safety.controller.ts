import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import { BlocksService } from './blocks.service';
import { PersonRefDto, ReportPersonDto } from './dto/safety.dto';
import { ReportsService } from './reports.service';

@Controller('blocks')
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  /** The caller's blocked list. Names as they were at the time of the block. */
  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.blocks
      .list(userId)
      .then((data) => ({ data, total: data.length }));
  }

  /**
   * Blocks someone. 200 with the block, whether it is new or already existed.
   *
   * Throttled per account: blocking is cheap to undo, and a loop of block and
   * unblock is someone probing, not someone staying safe.
   */
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @HttpCode(200)
  @Post()
  block(@CurrentUser('id') userId: string, @Body() dto: PersonRefDto) {
    return this.blocks.block(userId, dto);
  }

  @HttpCode(204)
  @Delete(':id')
  async unblock(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.blocks.unblock(userId, id);
  }
}

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** 202: it is written down, and a person will look at it. */
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @HttpCode(202)
  @Post()
  report(@CurrentUser('id') userId: string, @Body() dto: ReportPersonDto) {
    return this.reports.report(userId, dto);
  }
}
