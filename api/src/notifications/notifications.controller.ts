import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { NotificationFeedService } from './notification-feed.service';
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

export class MarkReadDto {
  /**
   * Which ones. Left out, every unread notification is marked — that is the
   * "mark all read" button, rather than a second endpoint that would differ
   * only in taking no body.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  ids?: string[];
}

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly push: PushService,
    private readonly dispatcher: ReminderDispatcherService,
    private readonly feed: NotificationFeedService,
  ) {}

  /**
   * The notification list, newest first.
   *
   * Returns the unread count alongside the page, so opening the list and
   * showing the badge is one request rather than two that can disagree.
   */
  @Get()
  list(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.feed.list(userId, {
      limit: limit ? Number(limit) : undefined,
      before,
    });
  }

  /** Just the badge, for the poll. */
  @Get('unread-count')
  async unreadCount(@CurrentUser('id') userId: string) {
    return { count: await this.feed.unreadCount(userId) };
  }

  @HttpCode(200)
  @Post('read')
  async markRead(@CurrentUser('id') userId: string, @Body() dto: MarkReadDto) {
    return { updated: await this.feed.markRead(userId, dto.ids) };
  }

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
