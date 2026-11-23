import type { DatabaseService } from '../database/database.service';
import type { FriendsService } from '../friends/friends.service';
import type { MoneyPackagesService } from '../money/money-packages.service';
import type { MoneyPayMethodsService, PayCardMethod } from '../money/money-pay-methods.service';
import type { PushService } from '../notifications/push.service';
import type { PresenceService } from '../realtime/presence.service';
import type { RealtimeGateway } from '../realtime/realtime.gateway';
import type { BlocksService } from '../safety/blocks.service';
import { MessagesService } from './messages.service';

/**
 * A way to pay, sent in a chat as a card.
 *
 * The card names the sender's way to pay; every read fills in its details as
 * they are now, and only ever the sender's own. The database is faked by
 * matching SQL; the statements themselves are checked on a real Postgres.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const THEM = '22222222-2222-4222-8222-222222222222';
const CONVO = '44444444-4444-4444-8444-444444444444';
const PM = '55555555-5555-4555-8555-555555555555';
const PKG = '66666666-6666-4666-8666-666666666666';

const gcash: PayCardMethod = {
  id: PM,
  kind: 'gcash',
  label: null,
  accountName: 'Mika Dela Cruz',
  accountNumber: '0917 123 4567',
  qrUrl: 'https://bucket.test/qr.png?sig=1',
  detailsChangedAt: '2026-11-03T02:00:00.000Z',
};

function harness(options: { owner?: string; frozen?: boolean; deleted?: boolean } = {}) {
  let stored: { body: string; context: Record<string, unknown> } | null = null;
  const db = {
    queryOne: jest.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('insert into messages')) {
        stored = { body: params[2] as string, context: JSON.parse(params[3] as string) };
        return { id: 'msg1' };
      }
      if (sql.includes('where m.id = $1')) {
        return {
          id: 'msg1',
          conversation_id: CONVO,
          sender_id: ME,
          kind: 'pay-card',
          body: options.deleted ? '' : stored?.body,
          deleted_at: options.deleted ? new Date() : null,
          context: stored?.context ?? { payMethodId: PM },
        };
      }
      return null;
    }),
    query: jest.fn(async () => []),
  };
  const realtime = { emitToUsers: jest.fn() };
  const payMethods = {
    cardsByIds: jest.fn(async () => new Map([[PM, { ...gcash, ownerId: options.owner ?? ME }]])),
  };
  const packages = {
    get: jest.fn(async () => ({
      package: { id: PKG, title: 'Lim prenup', balanceMinor: 1_500_000 },
      entries: [],
    })),
  };
  const service = new MessagesService(
    db as unknown as DatabaseService,
    {} as unknown as FriendsService,
    {} as unknown as PushService,
    realtime as unknown as RealtimeGateway,
    {} as unknown as PresenceService,
    {} as unknown as BlocksService,
    payMethods as unknown as MoneyPayMethodsService,
    packages as unknown as MoneyPackagesService,
  );
  jest.spyOn(service as never, 'sendState').mockResolvedValue({
    isGroup: false,
    others: 1,
    blockedOthers: options.frozen ? 1 : 0,
    myBlockId: null,
    theyBlockedMe: !!options.frozen,
  } as never);
  jest.spyOn(service as never, 'participantIdsVisibleTo').mockResolvedValue([ME, THEM] as never);
  const notify = jest.spyOn(service as never, 'notify').mockResolvedValue(undefined as never);
  return { service, db, realtime, payMethods, packages, notify, stored: () => stored };
}

describe('MessagesService.sendPayCard', () => {
  it('stores the card by id with a plain line, and sends it live with the details filled in', async () => {
    const { service, realtime, notify, stored } = harness();

    const row = await service.sendPayCard(ME, CONVO, { payMethodId: PM, packageId: PKG });

    expect(stored()).toEqual({
      body: 'How to pay: GCash · Mika Dela Cruz · 0917 123 4567\nLim prenup, balance ₱15,000',
      context: { payMethodId: PM, package: { id: PKG, title: 'Lim prenup', balanceMinor: 1_500_000 } },
    });
    expect(row.kind).toBe('pay-card');
    expect(row.context).toMatchObject({
      payMethodId: PM,
      method: { accountNumber: '0917 123 4567', qrUrl: 'https://bucket.test/qr.png?sig=1' },
    });
    // The reader never learns whose id it was looked up under.
    expect((row.context as { method: Record<string, unknown> }).method).not.toHaveProperty('ownerId');
    expect(realtime.emitToUsers).toHaveBeenCalledWith(
      [ME, THEM],
      expect.objectContaining({ type: 'message', conversationId: CONVO }),
    );
    expect(notify).toHaveBeenCalledWith(ME, CONVO, expect.stringContaining('How to pay: GCash'), []);
  });

  it("refuses somebody else's way to pay, and stores nothing", async () => {
    const { service, db } = harness({ owner: THEM });
    await expect(service.sendPayCard(ME, CONVO, { payMethodId: PM })).rejects.toThrow('not found');
    expect(db.queryOne).not.toHaveBeenCalledWith(expect.stringContaining('insert into messages'), expect.anything());
  });

  it('refuses a frozen thread the way a typed message is refused', async () => {
    const { service, payMethods } = harness({ frozen: true });
    await expect(service.sendPayCard(ME, CONVO, { payMethodId: PM })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CHAT_UNAVAILABLE' }),
    });
    expect(payMethods.cardsByIds).not.toHaveBeenCalled();
  });

  it('leaves a card deleted for everyone empty', async () => {
    const { service } = harness({ deleted: true });
    const row = await service.sendPayCard(ME, CONVO, { payMethodId: PM });
    expect(row.context).toBeNull();
  });
});
