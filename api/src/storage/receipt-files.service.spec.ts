import type { PoolClient } from 'pg';
import type { DatabaseService } from '../database/database.service';
import { MAX_RECEIPTS, ReceiptFilesService } from './receipt-files.service';
import type { StorageService } from './storage.service';

/**
 * The refusals around receipts. The happy path, against real Postgres and a
 * bucket, is covered where the SQL runs; these pin the rules.
 */
function harness(options: {
  configured?: boolean;
  loose?: number;
  kept?: number;
  found?: { key: string; held: boolean } | null;
  head?: { size: number } | null;
} = {}) {
  const queries: { sql: string; args?: unknown[] }[] = [];
  const db = {
    queryOne: jest.fn(async (sql: string, args?: unknown[]) => {
      queries.push({ sql, args });
      if (sql.includes('count(*)')) return { loose: options.loose ?? 0, kept: options.kept ?? 0 };
      if (sql.includes('insert into money_receipts')) return { id: 'receipt-1' };
      if (sql.startsWith('select key,')) {
        return options.found === undefined ? { key: 'receipts/2026/10/x.jpg', held: false } : options.found;
      }
      return null;
    }),
    query: jest.fn(async (sql: string, args?: unknown[]) => {
      queries.push({ sql, args });
      return [];
    }),
  };
  const storage = {
    configured: options.configured ?? true,
    signServerUpload: jest.fn(async () => ({
      uploadUrl: 'https://bucket.test/put',
      requiredHeaders: {},
      expiresAt: new Date().toISOString(),
    })),
    headServerObject: jest.fn(async () => (options.head === undefined ? { size: 100 } : options.head)),
  };
  const files = new ReceiptFilesService(
    db as unknown as DatabaseService,
    storage as unknown as StorageService,
  );
  return { files, db, storage, queries };
}

const PHOTO = { contentType: 'image/jpeg', contentLength: 300_000, name: 'jollibee.jpg' };

describe('ReceiptFilesService.createUpload', () => {
  it('signs a receipts/ key and records it loose against the uploader', async () => {
    const { files, storage, queries } = harness();
    const result = await files.createUpload('u1', PHOTO);
    expect(result.id).toBe('receipt-1');
    const [key] = storage.signServerUpload.mock.calls[0] as unknown as [string];
    expect(key).toMatch(/^receipts\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/);
    const insert = queries.find((q) => q.sql.includes('insert into money_receipts'))!;
    expect(insert.args).toEqual([key, 'jollibee.jpg', 'image/jpeg', 300_000, 'u1']);
  });

  it('refuses a HEIC, which the browser cannot draw', async () => {
    const { files } = harness();
    await expect(files.createUpload('u1', { ...PHOTO, contentType: 'image/heic' })).rejects.toThrow(
      'Attach a photo',
    );
  });

  it('refuses another upload while twenty are waiting', async () => {
    const { files } = harness({ loose: 20 });
    await expect(files.createUpload('u1', PHOTO)).rejects.toMatchObject({ status: 429 });
  });

  it('refuses once the account keeps as many as it may', async () => {
    const { files } = harness({ kept: MAX_RECEIPTS });
    await expect(files.createUpload('u1', PHOTO)).rejects.toThrow('You can keep up to 2,000 receipts');
  });

  it('says so when storage is not set up, rather than signing nothing', async () => {
    const { files } = harness({ configured: false });
    await expect(files.createUpload('u1', PHOTO)).rejects.toMatchObject({ status: 503 });
  });
});

describe('ReceiptFilesService.verify', () => {
  it("looks only at the caller's own receipt", async () => {
    const { files, queries } = harness();
    await files.verify('u1', 'receipt-1', { entryId: 'entry-1' });
    const select = queries.find((q) => q.sql.startsWith('select key,'))!;
    expect(select.sql).toContain('user_id = $2');
    expect(select.args).toEqual(['receipt-1', 'u1', 'entry-1']);
  });

  it('refuses one that expired or was never theirs', async () => {
    const { files } = harness({ found: null });
    await expect(files.verify('u1', 'receipt-1', { entryId: 'entry-1' })).rejects.toThrow('expired');
  });

  it('refuses one whose bytes never arrived', async () => {
    const { files } = harness({ head: null });
    await expect(files.verify('u1', 'receipt-1', { entryId: 'entry-1' })).rejects.toThrow("didn't finish uploading");
  });

  it('does not ask the bucket again about a receipt already on this entry', async () => {
    const { files, storage } = harness({ found: { key: 'receipts/2026/10/x.jpg', held: true } });
    await files.verify('u1', 'receipt-1', { entryId: 'entry-1' });
    expect(storage.headServerObject).not.toHaveBeenCalled();
  });
});

describe('ReceiptFilesService.attach', () => {
  function tx(rowCount: number) {
    const calls: { sql: string; args: unknown[] }[] = [];
    const client = {
      query: jest.fn(async (sql: string, args: unknown[]) => {
        calls.push({ sql, args });
        return { rowCount: sql.includes('set entry_id = $1') ? rowCount : 0 };
      }),
    };
    return { client: client as unknown as PoolClient, calls };
  }

  it("lets go of the entry's old receipt and takes the new one", async () => {
    const { files } = harness();
    const { client, calls } = tx(1);
    await files.attach(client, 'u1', { entryId: 'entry-1' }, 'receipt-2');
    expect(calls[0].sql).toContain('set entry_id = null');
    expect(calls[0].args).toEqual(['entry-1', 'u1', 'receipt-2']);
    expect(calls[1].args).toEqual(['entry-1', 'u1', 'receipt-2']);
  });

  it('only lets go when the receipt is removed', async () => {
    const { files } = harness();
    const { client, calls } = tx(0);
    await files.attach(client, 'u1', { entryId: 'entry-1' }, null);
    expect(calls).toHaveLength(1);
  });

  it('refuses a file that is already held elsewhere', async () => {
    const { files } = harness();
    const { client } = tx(0);
    await expect(files.attach(client, 'u1', { entryId: 'entry-1' }, 'receipt-2')).rejects.toThrow(
      'already in use elsewhere',
    );
  });
});

describe('ReceiptFilesService and payment-method QR codes', () => {
  it('checks and attaches a QR code against the method, not an entry', async () => {
    const { files, queries } = harness();
    await files.verify('u1', 'receipt-1', { payMethodId: 'method-1' });
    const select = queries.find((q) => q.sql.startsWith('select key,'))!;
    expect(select.sql).toContain('pay_method_id = $3::uuid');
    expect(select.args).toEqual(['receipt-1', 'u1', 'method-1']);
  });

  it('never sweeps a file a payment method holds', async () => {
    const { files, db } = harness();
    await files.sweep();
    const [sql] = db.query.mock.calls[0] as unknown as [string];
    expect(sql).toContain('entry_id is null and pay_method_id is null');
  });
});
