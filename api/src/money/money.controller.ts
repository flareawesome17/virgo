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
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { contentDisposition } from '../storage/download-names';
import { ReceiptFilesService } from '../storage/receipt-files.service';
import {
  CreateMoneyEntryDto,
  ListMoneyEntriesDto,
  MoneyRangeDto,
  ReceiptUploadDto,
  UpdateMoneyEntryDto,
} from './dto/money.dto';
import { MoneyService } from './money.service';
import { MoneyBookingsService } from './money-bookings.service';

/**
 * Money — each person's own ledger.
 *
 * Every route but the export download is scoped to the signed-in account
 * inside the service. The download carries its own signed, five-minute link
 * instead, because a phone hands the file to its browser to save, and the
 * browser has no session.
 */
@Controller('money')
export class MoneyController {
  constructor(
    private readonly money: MoneyService,
    private readonly receipts: ReceiptFilesService,
    private readonly bookings: MoneyBookingsService,
  ) {}

  /** Agreed bookings not recorded yet: the entries Money offers to fill in. */
  @Get('suggestions')
  suggestions(@CurrentUser('id') userId: string) {
    return this.bookings.suggestions(userId);
  }

  /** "Not this": the booking is not offered again. */
  @HttpCode(204)
  @Post('suggestions/:bookingId/dismiss')
  async dismiss(
    @CurrentUser('id') userId: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ): Promise<void> {
    await this.bookings.dismiss(userId, bookingId);
  }

  /** One booking from the caller's side: its offer, and what was recorded from it. */
  @Get('bookings/:bookingId')
  forBooking(
    @CurrentUser('id') userId: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    return this.money.forBooking(userId, bookingId);
  }

  @Get('entries')
  list(@CurrentUser('id') userId: string, @Query() query: ListMoneyEntriesDto) {
    return this.money.list(userId, query);
  }

  @Get('entries/:id')
  get(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.money.get(userId, id);
  }

  @Post('entries')
  create(@CurrentUser('id') userId: string, @Body() dto: CreateMoneyEntryDto) {
    return this.money.create(userId, dto);
  }

  @Patch('entries/:id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMoneyEntryDto,
  ) {
    return this.money.update(userId, id, dto);
  }

  @HttpCode(204)
  @Delete('entries/:id')
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.money.remove(userId, id);
  }

  @Get('summary')
  summary(@CurrentUser('id') userId: string, @Query() range: MoneyRangeDto) {
    return this.money.summary(userId, range.from, range.to);
  }

  /**
   * Signs one receipt's upload, ahead of the entry it goes on. The id that
   * comes back is what the entry sends as `receiptId`; the receipt is part of
   * nothing until then, and is swept a day on if it never is.
   */
  @Throttle({ default: { limit: 60, ttl: 3_600_000 } })
  @Post('receipts')
  @HttpCode(200)
  upload(@CurrentUser('id') userId: string, @Body() dto: ReceiptUploadDto) {
    return this.receipts.createUpload(userId, dto);
  }

  /** A five-minute link to the range as a CSV. */
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @Post('export')
  @HttpCode(200)
  exportLink(@CurrentUser('id') userId: string, @Body() range: MoneyRangeDto) {
    return this.money.exportLink(userId, range.from, range.to);
  }

  /**
   * The CSV itself, for whoever holds a fresh link. Public because the link
   * is the credential: signed for one account and one range, and dead after
   * five minutes.
   */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('export/:token')
  async download(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const { userId, from, to } = this.money.readExportLink(token);
    const { filename, body } = await this.money.csv(userId, from, to);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', contentDisposition(filename));
    // Somebody's income: never kept by a proxy, a browser cache or a search
    // engine that was handed the link.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.status(200).send(body);
  }
}
