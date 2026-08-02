import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateProfileDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import { AccountFlowsService } from './account-flows.service';
import { USER_ROLES } from './roles';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly accounts: AccountFlowsService,
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

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.accounts.verifyEmail(dto.token);
  }

  /** Re-sends the verification link to the signed-in user's own address. */
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

  @Patch('me')
  updateMe(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.auth.updateProfile(userId, dto);
  }
}
