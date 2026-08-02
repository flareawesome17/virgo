import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MailService } from '../mail/mail.service';
import type { RenderedEmail } from '../mail/mail.templates';
import {
  RealtimeGateway,
  type NotificationTopic,
} from '../realtime/realtime.gateway';
import { PushService, type PushMessage } from './push.service';

export interface Notification {
  topic: NotificationTopic;
  title: string;
  body: string;
  /** Routed on by the tap handler; carried identically over both channels. */
  data?: Record<string, unknown>;
  /**
   * Android channel, which fixes importance at creation time. 'alarms' is
   * loud, 'reminders' is deliberately silent, 'messages' and 'invitations'
   * both buzz.
   *
   * Left unset, it is derived from the topic — see channelFor. Setting it by
   * hand at every call site is how invitations ended up silent.
   */
  channelId?: 'alarms' | 'reminders' | 'messages' | 'invitations';
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
  /**
   * Also sent by email, when the notification is worth reaching someone who is
   * not in the app at all. Invitations are; a reminder you set for yourself is
   * not, and neither is anything that fires on a schedule.
   */
  email?: RenderedEmail;
}

/** One notification aimed at one person. */
export interface Delivery extends Notification {
  userId: string;
}

/**
 * The Android channel a topic belongs on.
 *
 * Everything except a reminder is somebody waiting on you, so it goes on a
 * channel that makes a sound. 'reminders' is silent by design — right for an
 * alarm you set yourself, wrong for an invitation, which is what every one of
 * these used before this existed.
 */
function channelFor(topic: NotificationTopic): Notification['channelId'] {
  return topic === 'reminder' ? 'reminders' : 'invitations';
}

/**
 * Delivers a notification over every channel at once.
 *
 * The point of this class is that there is no way to send half of one. Before
 * it, each feature reimplemented "look up tokens, send push", and the live
 * WebSocket path was added to chat only — so a friend request or a workspace
 * invitation sat unseen until something happened to refetch. Anything that
 * notifies now goes through here and is live by construction.
 *
 * The socket goes first and the push second, deliberately: the socket is
 * in-process and instant, while Expo is an HTTP round trip to another company's
 * server. Ordering it this way is the difference between a notification that
 * lands immediately for anyone with the app open and one that waits on a
 * network call to somewhere else.
 *
 * Push is *not* suppressed for users who are connected. A socket proves a tab
 * is open, not that anyone is looking at it — someone with the web app open on
 * a laptop still wants the alert on their phone. The clients dedupe on the
 * `data` payload.
 */
@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name);

  constructor(
    private readonly push: PushService,
    private readonly realtime: RealtimeGateway,
    private readonly mail: MailService,
    private readonly db: DatabaseService,
  ) {}

  /** Sends one notification to one or more people. */
  async notify(
    userIds: readonly string[],
    notification: Notification,
  ): Promise<void> {
    await this.deliver(
      [...new Set(userIds)].map((userId) => ({ ...notification, userId })),
    );
  }

  /**
   * Sends a batch of individually-addressed notifications.
   *
   * Used by the reminder sweep, where every recipient gets different text.
   * Tokens are looked up once per user and the whole batch goes to Expo in one
   * request rather than one per notification.
   *
   * Never throws. A notification failing to deliver must not roll back the
   * thing that caused it — the friendship is already recorded, the invitation
   * already stored.
   */
  async deliver(
    deliveries: readonly Delivery[],
  ): Promise<{ sent: number; failed: number }> {
    if (deliveries.length === 0) return { sent: 0, failed: 0 };

    const at = new Date().toISOString();

    // Live first. Synchronous and non-throwing, so this is done before the
    // first byte of the push request goes out.
    for (const d of deliveries) {
      this.realtime.emitToUsers([d.userId], {
        type: 'notification',
        topic: d.topic,
        title: d.title,
        body: d.body,
        data: d.data ?? {},
        at,
      });
    }

    try {
      const tokensByUser = new Map<string, string[]>();
      for (const userId of new Set(deliveries.map((d) => d.userId))) {
        tokensByUser.set(userId, await this.push.tokensFor(userId));
      }

      const messages: PushMessage[] = [];
      for (const d of deliveries) {
        for (const to of tokensByUser.get(d.userId) ?? []) {
          messages.push({
            to,
            title: d.title,
            body: d.body,
            channelId: d.channelId ?? channelFor(d.topic),
            sound: d.sound === undefined ? 'default' : d.sound,
            // Otherwise Android may hold it until the next maintenance window
            // while the device is dozing — an invitation that arrives an hour
            // late is one the organiser has already given up on.
            priority: d.priority ?? (d.topic === 'reminder' ? 'default' : 'high'),
            data: d.data ?? {},
          });
        }
      }

      const result = await this.push.send(messages);
      await this.sendEmails(deliveries);
      return result;
    } catch (err) {
      this.logger.warn(`Notification delivery failed: ${String(err)}`);
      return { sent: 0, failed: deliveries.length };
    }
  }

  /**
   * Emails the deliveries that asked for one.
   *
   * Last, and after the push, because it is the slowest channel and the least
   * urgent — nobody is waiting on an inbox the way they wait on a screen.
   * MailService already swallows its own failures.
   */
  private async sendEmails(deliveries: readonly Delivery[]): Promise<void> {
    const wanted = deliveries.filter((d) => d.email);
    if (wanted.length === 0 || !this.mail.isEnabled) return;

    const rows = await this.db.query<{ id: string; email: string }>(
      `select id, email from users
        where id = any($1::uuid[]) and email_verified_at is not null`,
      [[...new Set(wanted.map((d) => d.userId))]],
    );
    // Unverified addresses are skipped: sending to one is how a sender
    // reputation gets spent on bounces, and the address is unproven anyway.
    const addresses = new Map(rows.map((r) => [r.id, r.email]));

    for (const d of wanted) {
      const to = addresses.get(d.userId);
      if (!to) continue;
      await this.mail.send(to, d.email!);
    }
  }
}
