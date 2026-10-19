import type { DatabaseService } from '../database/database.service';
import type { MailService } from '../mail/mail.service';
import type { RealtimeGateway } from '../realtime/realtime.gateway';
import type { NotificationSettingsService } from './notification-settings.service';
import { NotifyService } from './notify.service';
import type { PushMessage, PushService } from './push.service';

/**
 * The app-icon badge a notification push carries.
 *
 * iOS shows the number in a push's `badge` on the home-screen icon, and leaves
 * the icon alone when there is none. Every notification push now carries the
 * recipient's own total — unread notifications plus unread messages, counted
 * after this notification was stored — so the icon says what the app will.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const THEM = '22222222-2222-4222-8222-222222222222';

function harness(
  options: { badges?: Map<string, number>; badgeError?: Error } = {},
) {
  const order: string[] = [];
  const db = {
    query: jest.fn(async (sql: string) => {
      if (/insert into notifications/.test(sql)) order.push('store');
      return [];
    }),
  } as unknown as DatabaseService;
  const push = {
    tokensFor: jest.fn(async (userId: string) =>
      userId === ME ? ['ExponentPushToken[me]'] : ['ExponentPushToken[t1]', 'ExponentPushToken[t2]'],
    ),
    badgeCounts: jest.fn(async () => {
      order.push('count');
      if (options.badgeError) throw options.badgeError;
      return options.badges ?? new Map<string, number>();
    }),
    send: jest.fn(async (_messages: PushMessage[]) => ({ sent: 1, failed: 0 })),
  };
  const realtime = { emitToUsers: jest.fn() };
  const mail = { isEnabled: false, send: jest.fn() };
  const settings = { storedFor: jest.fn(async () => new Map()) };

  const service = new NotifyService(
    push as unknown as PushService,
    realtime as unknown as RealtimeGateway,
    mail as unknown as MailService,
    db,
    settings as unknown as NotificationSettingsService,
  );
  const sent = () => push.send.mock.calls[0]?.[0] ?? [];
  return { service, push, sent, order };
}

describe('NotifyService app-icon badge', () => {
  it("sets each recipient's badge to their own total, counted after storing", async () => {
    const h = harness({ badges: new Map([[ME, 2], [THEM, 7]]) });

    await h.service.notify([ME, THEM], {
      topic: 'friend-request',
      title: 'New request',
      body: 'Someone wants to connect',
    });

    expect(h.sent().map((m) => [m.to, m.badge])).toEqual([
      ['ExponentPushToken[me]', 2],
      ['ExponentPushToken[t1]', 7],
      ['ExponentPushToken[t2]', 7],
    ]);
    // One lookup for the batch, after the rows it has to count were written.
    expect(h.push.badgeCounts).toHaveBeenCalledTimes(1);
    expect(h.push.badgeCounts).toHaveBeenCalledWith([ME, THEM]);
    expect(h.order).toEqual(['store', 'count']);
  });

  it('still delivers, leaving the icon alone, when the count cannot be read', async () => {
    const h = harness({ badgeError: new Error('db down') });

    const result = await h.service.notify([ME], {
      topic: 'reminder',
      title: 'Shoot at 3',
      body: 'In 15 minutes',
    });

    expect(result).toBeUndefined();
    expect(h.sent()).toHaveLength(1);
    expect(h.sent()[0]).not.toHaveProperty('badge');
  });

  it('leaves the badge off a push for someone with no count', async () => {
    const h = harness({ badges: new Map() });

    await h.service.notify([ME], { topic: 'support', title: 'Reply', body: 'We answered' });

    expect(h.sent()[0]).not.toHaveProperty('badge');
  });
});
