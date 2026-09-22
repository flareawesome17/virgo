import { ForbiddenException } from '@nestjs/common';
import type { DatabaseService } from '../database/database.service';
import { QuotaService } from './quota.service';

/**
 * The upload ticket's storage refusal, as a client receives it.
 *
 * A code beside the sentence, so an app can say "your storage is full" in its
 * own words and tell this 403 apart from every other one, without matching on
 * a sentence that carries numbers. The sentence itself is unchanged: apps
 * already installed show it as it is.
 */

const GB = 1024 ** 3;

/** A free account (15 GB), no promos, holding `usedBytes`. */
function quotaHolding(usedBytes: number) {
  const queryOne = jest.fn(async (sql: string) => {
    if (/select plan from users/.test(sql)) return { plan: 'free' };
    if (/from promo_grants/.test(sql)) {
      return { storage_bytes: '0', extra_workspaces: '0', extra_albums: '0' };
    }
    if (/sum\(size_bytes\)/.test(sql)) return { total: String(usedBytes) };
    throw new Error(`Unexpected queryOne: ${sql}`);
  });
  return new QuotaService({ queryOne } as unknown as DatabaseService);
}

async function refusalOf(attempt: Promise<void>): Promise<ForbiddenException> {
  const err = await attempt.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ForbiddenException);
  return err as ForbiddenException;
}

describe('QuotaService.assertCanStore', () => {
  it('refuses with STORAGE_FULL and the sentence it always had', async () => {
    const quota = quotaHolding(15 * GB - 1024);

    const refused = await refusalOf(quota.assertCanStore('user-1', 2048));

    expect(refused.getStatus()).toBe(403);
    expect(refused.getResponse()).toEqual({
      statusCode: 403,
      error: 'Forbidden',
      code: 'STORAGE_FULL',
      message: 'That upload would exceed your 15 GB of storage. 1 KB remaining.',
    });
  });

  it("says whose storage it is when the album's owner is the one out of room", async () => {
    const quota = quotaHolding(15 * GB);

    const refused = await refusalOf(quota.assertCanStore('owner-1', 1, 'album-owner'));

    expect(refused.getResponse()).toEqual(
      expect.objectContaining({
        statusCode: 403,
        code: 'STORAGE_FULL',
        message:
          "The album's owner does not have room for that upload: 0 KB of their 15 GB remaining. Uploads here count toward their storage, not yours.",
      }),
    );
  });

  it('lets through an upload that fits', async () => {
    const quota = quotaHolding(15 * GB - 1024);

    await expect(quota.assertCanStore('user-1', 1024)).resolves.toBeUndefined();
  });
});
