import { Body, Controller, Delete, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import {
  DeleteAccountDto,
  DisableAccountDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateProfileDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import { AccountService } from './account.service';
import { AccountFlowsService } from './account-flows.service';
import { USER_ROLES } from './roles';
import { AllowUnverified } from './allow-unverified.decorator';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly accounts: AccountFlowsService,
    private readonly account: AccountService,
  ) {}

  // Tighter than the global limit: these are the endpoints worth brute-forcing.
  /**
   * The roles a sign-up may choose from.
   *
   * Served rather than hardcoded in each client, so the list the form offers
   * and the list the DTO accepts cannot drift.
   */
  @Public()
  @Get('roles')
  roles() {
    return { data: USER_ROLES, total: USER_ROLES.length };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const result = await this.auth.register(
      dto.email,
      dto.password,
      dto.displayName,
      dto.roles,
      {
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2,
        addressCity: dto.addressCity,
        addressProvince: dto.addressProvince,
        addressPostal: dto.addressPostal,
        addressCountry: dto.addressCountry,
        studioName: dto.studioName,
        socialHandle: dto.socialHandle,
      },
    );
    // Not awaited: a slow SMTP handshake must not hold up the signup response,
    // and a failed send is logged rather than failing an account that exists.
    void this.accounts.sendVerificationEmail(result.user.id);
    return result;
  }

  /**
   * Starts a password reset.
   *
   * Always 202, whether or not the address has an account — the response must
   * not be an oracle for which emails are registered. Rate-limited hard: this
   * is the one unauthenticated endpoint that sends mail on demand.
   */
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(202)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.accounts.requestPasswordReset(dto.email);
    return {
      accepted: true,
      message: 'If that address has an account, a reset link is on its way.',
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.accounts.resetPassword(dto.token, dto.password);
  }

  /**
   * Re-sends the confirmation link to an address, no session required.
   *
   * The authenticated resend is unreachable once verification blocks sign-in,
   * which is precisely when someone needs it. Always 202, so it cannot be used
   * to discover which addresses are registered.
   */
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(202)
  @Post('request-verification')
  async requestVerification(@Body() dto: ForgotPasswordDto) {
    await this.accounts.requestVerificationEmail(dto.email);
    return {
      accepted: true,
      message: 'If that address needs confirming, a new link is on its way.',
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.accounts.verifyEmail(dto.token);
  }

  /** Re-sends the verification link to the signed-in user's own address. */
  @AllowUnverified()
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @HttpCode(202)
  @Post('resend-verification')
  async resendVerification(@CurrentUser('id') userId: string) {
    await this.accounts.sendVerificationEmail(userId);
    return { accepted: true };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  me(@CurrentUser('id') userId: string) {
    return this.auth.me(userId);
  }

  @AllowUnverified()
  @Patch('me')
  updateMe(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.auth.updateProfile(userId, dto);
  }

  // ─── Closing an account ────────────────────────────────────────────────────
  //
  // Throttled like the other password-checking endpoints: both take a password,
  // so both are worth guessing at.

  /**
   * Pauses the account for a number of days.
   *
   * AllowUnverified: somebody who never confirmed their address should still be
   * able to put the account away rather than being stuck with it.
   */
  @AllowUnverified()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('me/disable')
  disable(
    @CurrentUser('id') userId: string,
    @Body() dto: DisableAccountDto,
  ) {
    return this.account.disable(userId, dto.password, dto.days);
  }

  /** Lifts a pause early, while a session is still valid. */
  @AllowUnverified()
  @HttpCode(200)
  @Post('me/enable')
  enable(@CurrentUser('id') userId: string) {
    return this.account.enable(userId);
  }

  /** Deletes the account, its rows and its uploaded files. Irreversible. */
  @AllowUnverified()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Delete('me')
  remove(
    @CurrentUser('id') userId: string,
    @Body() dto: DeleteAccountDto,
  ) {
    return this.account.remove(userId, dto.password);
  }
}
