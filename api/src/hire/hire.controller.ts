import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { HireService } from './hire.service';

export class SendEnquiryDto {
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  handle!: string;

  @IsString()
  @MinLength(10, { message: 'Tell them a bit about the job' })
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  roleWanted?: string;

  /**
   * A calendar day, `YYYY-MM-DD`.
   *
   * Not `@IsISO8601`, which would also accept a full instant — and an instant
   * carries a timezone, so "14 November" sent from a UTC+8 browser can land in
   * a `date` column as the 13th.
   */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use a date like 2026-11-14' })
  eventDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  budget?: string;
}

/**
 * Hire enquiries.
 *
 * Authenticated throughout, including sending. The profile the button sits on
 * is public, but an anonymous write that reaches a stranger's phone has no
 * identity to connect on acceptance and nothing to rate-limit but an IP —
 * signed-out visitors are sent to sign-up instead.
 */
@Controller('hire')
export class HireController {
  constructor(private readonly hire: HireService) {}

  @Get()
  async list(@CurrentUser('id') userId: string) {
    const data = await this.hire.list(userId);
    return { data, total: data.length };
  }

  /**
   * Five an hour.
   *
   * The unique index already caps open enquiries at one per pair, so this is
   * about the other shape of abuse: one account spraying the whole directory.
   */
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @HttpCode(201)
  @Post()
  send(@CurrentUser('id') userId: string, @Body() dto: SendEnquiryDto) {
    return this.hire.send(userId, dto);
  }

  @HttpCode(200)
  @Post(':id/accept')
  accept(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.hire.accept(userId, id);
  }

  @HttpCode(200)
  @Post(':id/decline')
  decline(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.hire.decline(userId, id);
  }
}
