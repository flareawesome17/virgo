import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DatabaseService } from '../database/database.service';
import type { MailConfig } from '../mail/mail.config';
import type { NotifyService } from '../notifications/notify.service';
import { BillingService, type SubscriptionRow } from './billing.service';
import type { PayMongoClient } from './paymongo.client';

/**
 * Deleting an account stops its plan at PayMongo first. The rows cascade away
 * with the user; PayMongo's copy does not, and would keep charging.
 */
describe('BillingService.cancelBeforeDeletion', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  function billingWith(rows: Partial<SubscriptionRow>[], request = jest.fn(async () => ({}))) {
    const db = { query: jest.fn(async () => rows) };
    const paymongo = { request };
    const service = new BillingService(
      db as unknown as DatabaseService,
      paymongo as unknown as PayMongoClient,
      {} as NotifyService,
      {} as MailConfig,
      {} as ConfigService,
    );
    return { service, db, request };
  }

  it('asks only for renewing subscriptions that can still take money', async () => {
    const { service, db } = billingWith([]);
    await expect(service.cancelBeforeDeletion('user-1')).resolves.toBe(0);

    const [sql, params] = db.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("kind = 'subscription'");
    expect(sql).toContain('cancelled_at is null');
    expect(params).toEqual(['user-1', ['active', 'past_due', 'unpaid']]);
  });

  it('cancels each one at PayMongo', async () => {
    const { service, request } = billingWith([{ provider_id: 'sub_1' }, { provider_id: 'sub_2' }]);
    await expect(service.cancelBeforeDeletion('user-1')).resolves.toBe(2);
    expect(request).toHaveBeenCalledWith('POST', '/subscriptions/sub_1/cancel', {
      cancellation_reason: 'other',
    });
    expect(request).toHaveBeenCalledWith('POST', '/subscriptions/sub_2/cancel', expect.anything());
  });

  it('throws when PayMongo refuses, so the deletion stops', async () => {
    const refused = jest.fn(async () => Promise.reject(new Error('PayMongo is down')));
    const { service } = billingWith([{ provider_id: 'sub_1' }], refused);
    await expect(service.cancelBeforeDeletion('user-1')).rejects.toThrow('PayMongo is down');
  });
});
