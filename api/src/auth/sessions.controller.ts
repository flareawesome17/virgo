import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from './current-user.decorator';
import { SignInAlertDto } from './dto/sessions.dto';
import { Public } from './public.decorator';
import { SessionsService } from './sessions.service';

/**
 * Where you are signed in, and how to end the sessions you do not recognise.
 *
 * The console has had this since the customer view (AdminCustomersService
 * .devices); the account's owner had nothing but "change your password",
 * which signs out every device including the ones they meant to keep.
 */
@Controller('auth')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  /** Every signed-in device, this one first and marked. */
  @Get('sessions')
  list(
    @CurrentUser('id') userId: string,
    @CurrentUser('sessionId') currentId?: string,
  ) {
    return this.sessions.list(userId, currentId);
  }

  /**
   * Signs out every device but this one. Before the `:id` route only in
   * reading order — the methods differ, so they never compete.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('sessions/sign-out-others')
  signOutOthers(
    @CurrentUser('id') userId: string,
    @CurrentUser('sessionId') currentId?: string,
  ) {
    return this.sessions.signOutOthers(userId, currentId);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(204)
  @Delete('sessions/:id')
  async signOut(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sessionId') currentId?: string,
  ): Promise<void> {
    await this.sessions.signOut(userId, id, currentId);
  }

  /**
   * What a "This wasn't me" link is about. A POST, though it changes nothing,
   * so the token stays out of URLs and the logs that keep them.
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('sign-in-alerts/lookup')
  lookup(@Body() dto: SignInAlertDto) {
    return this.sessions.lookupAlert(dto.token);
  }

  /** "This wasn't me": signs that device out and emails a reset link. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('sign-in-alerts/report')
  report(@Body() dto: SignInAlertDto) {
    return this.sessions.reportAlert(dto.token);
  }
}
