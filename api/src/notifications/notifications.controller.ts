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
import { parseClient } from './app-update-targeting';
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

  /**
   * The app version the device is running, so an update announcement is
   * pushed only to phones it applies to. Optional because builds from before
   * it existed do not send it — those devices simply are not pushed
   * announcements, which is also what keeps a push off a phone that has no
   * channel to show it on.
   */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^v?\d{1,6}(\.\d{1,6}){0,3}$/, { message: 'Not a version number' })
  appVersion?: string;
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
   *
   * `platform` and `version` say what the asking client is, and bring in the
   * update announcements meant for it. Query parameters rather than headers:
   * a custom header from the browser would cost a CORS preflight on every poll.
   * An unrecognised or missing platform shows no announcements, never all.
   */
  @Get()
  list(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
    @Query('platform') platform?: string,
    @Query('version') version?: string,
  ) {
    return this.feed.list(userId, {
      limit: limit ? Number(limit) : undefined,
      before,
      client: parseClient(platform, version),
    });
  }

  /** Just the badge, for the poll. */
  @Get('unread-count')
  async unreadCount(
    @CurrentUser('id') userId: string,
    @Query('platform') platform?: string,
    @Query('version') version?: string,
  ) {
    return {
      count: await this.feed.unreadCount(userId, parseClient(platform, version)),
    };
  }

  @HttpCode(200)
  @Post('read')
  async markRead(
    @CurrentUser('id') userId: string,
    @Body() dto: MarkReadDto,
    @Query('platform') platform?: string,
    @Query('version') version?: string,
  ) {
    return {
      updated: await this.feed.markRead(
        userId,
        dto.ids,
        parseClient(platform, version),
      ),
    };
  }

  /** Called by the app once it has permission and a token. */
  @HttpCode(204)
  @Post('token')
  async register(
    @CurrentUser('id') userId: string,
    @Body() dto: RegisterPushTokenDto,
  ): Promise<void> {
    await this.push.registerToken(userId, dto.token, dto.platform, dto.appVersion);
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
