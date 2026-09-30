import { Body, Controller, Delete, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import {
  ChangeEmailDto,
  ChangePasswordDto,
  DeleteAccountDto,
  DisableAccountDto,
  BeginTwoFactorSetupDto,
  BeginTwoFactorSecurityActionDto,
  CompleteTwoFactorLoginDto,
  ConfirmTwoFactorSetupDto,
  ResendTwoFactorCodeDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  ForgetDeviceDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateProfileDto,
  VerifyEmailDto,
  TwoFactorSecurityActionDto,
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

  @Throttle({ default: { limit: 3, ttl: 5 * 60_000 } })
  @HttpCode(200)
  @Post('2fa/security-code')
  beginTwoFactorSecurityAction(
    @CurrentUser('id') userId: string,
    @Body() dto: BeginTwoFactorSecurityActionDto,
  ) {
    return this.auth.beginTwoFactorSecurityAction(
      userId,
      dto.password,
      dto.action,
    );
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
      dto.referralCode,
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

  /**
   * Changes the password, signs every other device out, and hands this one a
   * fresh pair so the person who asked stays signed in.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('me/password')
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    const user = await this.accounts.changePassword(
      userId,
      dto.currentPassword,
      dto.newPassword,
    );
    return this.auth.sessionAfterPasswordChange(user);
  }

  /** Sends a confirmation link to a new address. Nothing changes until it is used. */
  @Throttle({ default: { limit: 3, ttl: 5 * 60_000 } })
  @HttpCode(202)
  @Post('me/email')
  requestEmailChange(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangeEmailDto,
  ) {
    return this.accounts.requestEmailChange(userId, dto.password, dto.newEmail);
  }

  /** Redeems the link from requestEmailChange. Public: it is opened from an inbox. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('confirm-email')
  confirmEmailChange(@Body() dto: VerifyEmailDto) {
    return this.accounts.confirmEmailChange(dto.token);
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
    return this.auth.login(dto.email, dto.password, { unpause: dto.unpause === true });
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login/2fa')
  completeTwoFactorLogin(@Body() dto: CompleteTwoFactorLoginDto) {
    return this.auth.completeTwoFactorLogin(dto.challengeToken, dto.code);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 5 * 60_000 } })
  @HttpCode(200)
  @Post('2fa/resend')
  resendTwoFactorCode(@Body() dto: ResendTwoFactorCodeDto) {
    return this.auth.resendTwoFactorCode(dto.challengeToken);
  }

  @Get('2fa/status')
  twoFactorStatus(@CurrentUser('id') userId: string) {
    return this.auth.twoFactorStatus(userId);
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('2fa/setup')
  beginTwoFactorSetup(
    @CurrentUser('id') userId: string,
    @Body() dto: BeginTwoFactorSetupDto,
  ) {
    return this.auth.beginTwoFactorSetup(userId, dto.password);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('2fa/confirm')
  confirmTwoFactorSetup(
    @CurrentUser('id') userId: string,
    @Body() dto: ConfirmTwoFactorSetupDto,
  ) {
    return this.auth.confirmTwoFactorSetup(
      userId,
      dto.challengeToken,
      dto.code,
    );
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Delete('2fa')
  disableTwoFactor(
    @CurrentUser('id') userId: string,
    @Body() dto: TwoFactorSecurityActionDto,
  ) {
    return this.auth.disableTwoFactor(userId, dto.challengeToken, dto.code);
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('2fa/recovery-codes')
  regenerateTwoFactorRecoveryCodes(
    @CurrentUser('id') userId: string,
    @Body() dto: TwoFactorSecurityActionDto,
  ) {
    return this.auth.regenerateTwoFactorRecoveryCodes(
      userId,
      dto.challengeToken,
      dto.code,
    );
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

  /**
   * Stops a phone receiving an account's pushes as it signs out.
   *
   * Nothing did before: a signed-out phone kept showing the account's message
   * previews on its lock screen until someone else signed in on it.
   *
   * Takes the refresh token, not the access token, because the sign-out that
   * most needs this is the forced one — a password changed on another device,
   * "sign out everywhere" — and by then neither token is honoured. A revoked
   * refresh token still proves the caller held this account's session, which
   * is all that removing its own push row needs. Separate from logout so that
   * a server without it answers 404 rather than failing the sign-out.
   */
  @Public()
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('forget-device')
  async forgetDevice(@Body() dto: ForgetDeviceDto): Promise<void> {
    await this.auth.forgetDevice(dto.refreshToken, dto.pushToken);
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
