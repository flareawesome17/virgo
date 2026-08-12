import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { PromosService } from './promos.service';

class ReferralCodeDto {
  /**
   * Upper-cased and trimmed here, for the same reason the signup form does it:
   * codes are generated upper-case, and somebody retyping one from a message
   * types whatever their keyboard gave them. Matching should not depend on it.
   */
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  code!: string;
}

/**
 * Rewards, from the recipient's side.
 *
 * There is no route here to create or hand out anything — that lives behind
 * the console guard. All an account can do with its own promos is see what it
 * has been offered and take it.
 */
@Controller('promos')
export class PromosController {
  constructor(private readonly promos: PromosService) {}

  /** What is waiting to be claimed. Polled on sign-in and on the promo topic. */
  @Get()
  offers(@CurrentUser('id') userId: string) {
    return this.promos.offers(userId);
  }

  /**
   * This account's referral code, allocated on first read.
   *
   * A GET that writes, which is worth being deliberate about: the alternative
   * is a code column filled for every account that never shares one. It is
   * idempotent — the second read returns the first code — so the usual reason
   * to avoid writing on GET does not bite.
   */
  @Get('referral-code')
  async referralCode(@CurrentUser('id') userId: string) {
    return { code: await this.promos.referralCode(userId) };
  }

  /**
   * Uses somebody else's invite code, after signing up.
   *
   * The signup form takes one too, but most people are handed a code by a
   * friend once they have already joined — and a field only reachable by
   * starting over is a field nobody uses.
   *
   * Throttled because it is a guessing surface: a code is seven characters,
   * and without a limit somebody could walk the space looking for a hit.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('referral')
  redeem(@CurrentUser('id') userId: string, @Body() dto: ReferralCodeDto) {
    return this.promos.redeemReferralCode(userId, dto.code);
  }

  /**
   * ParseUUIDPipe so a malformed id is a 400 rather than a 500 — without it
   * the string reaches Postgres, which rejects the cast and surfaces as an
   * internal error for what is just a bad request.
   */
  @HttpCode(200)
  @Post(':grantId/claim')
  claim(
    @CurrentUser('id') userId: string,
    @Param('grantId', ParseUUIDPipe) grantId: string,
  ) {
    return this.promos.claim(userId, grantId);
  }
}
