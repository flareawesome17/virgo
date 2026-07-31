import { Body, Controller, Delete, HttpCode, Post } from '@nestjs/common';
import { IsIn, IsString, Matches, MaxLength } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { PushService } from './push.service';
import { ReminderDispatcherService } from './reminder-dispatcher.service';

export class RegisterPushTokenDto {
  /**
   * Expo push tokens look like `ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]`.
   * Validated so a malformed value cannot poison the send batch — one bad
   * token makes Expo reject the request it is part of.
   */
  @IsString()
  @MaxLength(256)
  @Matches(/^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/, {
    message: 'Not a valid Expo push token',
  })
  token!: string;

  @IsIn(['ios', 'android', 'web'])
  platform!: 'ios' | 'android' | 'web';
}

export class UnregisterPushTokenDto {
  @IsString()
  @MaxLength(256)
  token!: string;
}

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly push: PushService,
    private readonly dispatcher: ReminderDispatcherService,
  ) {}

  /** Called by the app once it has permission and a token. */
  @HttpCode(204)
  @Post('token')
  async register(
    @CurrentUser('id') userId: string,
    @Body() dto: RegisterPushTokenDto,
  ): Promise<void> {
    await this.push.registerToken(userId, dto.token, dto.platform);
  }

  /** Called on sign-out so a shared device stops receiving the old account. */
  @HttpCode(204)
  @Delete('token')
  async unregister(
    @CurrentUser('id') userId: string,
    @Body() dto: UnregisterPushTokenDto,
  ): Promise<void> {
    await this.push.removeToken(userId, dto.token);
  }

  /**
   * Sends a push to the caller's own devices, so the user can confirm
   * notifications actually arrive without waiting for a reminder to come due.
   */
  @HttpCode(200)
  @Post('test')
  async test(@CurrentUser('id') userId: string) {
    const tokens = await this.push.tokensFor(userId);
    if (tokens.length === 0) {
      return { sent: 0, failed: 0, devices: 0 };
    }
    const result = await this.push.send(
      tokens.map((to) => ({
        to,
        title: 'Virgo',
        body: 'Push notifications are working.',
        channelId: 'reminders',
        sound: 'default' as const,
        data: { type: 'test' },
      })),
    );
    return { ...result, devices: tokens.length };
  }
}
