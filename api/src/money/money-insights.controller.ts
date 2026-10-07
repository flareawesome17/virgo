import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  CreateMoneyRecurringDto,
  Mark2307Dto,
  MoneyInsightsDto,
  MoneyTaxDto,
  UpdateMoneyRecurringDto,
} from './dto/money.dto';
import { MoneyInsightsService } from './money-insights.service';
import { MoneyRecurringService } from './money-recurring.service';
import { MoneyTaxService } from './money-tax.service';

/** Money: the year at a glance, tax help, and the entries that repeat. The caller's own, always. */
@Controller('money')
export class MoneyInsightsController {
  constructor(
    private readonly insights: MoneyInsightsService,
    private readonly recurring: MoneyRecurringService,
    private readonly tax: MoneyTaxService,
  ) {}

  @Get('insights')
  year(@CurrentUser('id') userId: string, @Query() query: MoneyInsightsDto) {
    return this.insights.year(userId, query.year);
  }

  /** Estimates for planning, the 2307s to collect, and the filing calendar. */
  @Get('tax')
  taxYear(@CurrentUser('id') userId: string, @Query() query: MoneyTaxDto) {
    return this.tax.year(userId, query.year);
  }

  @HttpCode(200)
  @Post('tax/2307')
  mark2307(@CurrentUser('id') userId: string, @Body() dto: Mark2307Dto) {
    return this.tax.mark2307(userId, dto.entryIds, dto.received);
  }

  @Get('recurring')
  list(@CurrentUser('id') userId: string) {
    return this.recurring.list(userId);
  }

  /** Repeat one of the caller's entries every month from here on. */
  @Post('recurring')
  create(@CurrentUser('id') userId: string, @Body() dto: CreateMoneyRecurringDto) {
    return this.recurring.create(userId, dto.entryId);
  }

  @Patch('recurring/:id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMoneyRecurringDto,
  ) {
    return this.recurring.update(userId, id, dto);
  }

  /** Stops it. What it already made stays in the ledger. */
  @HttpCode(204)
  @Post('recurring/:id/stop')
  async stop(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.recurring.stop(userId, id);
  }
}
