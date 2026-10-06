import type { PoolClient } from 'pg';
import type { DatabaseService } from '../database/database.service';
import type { StorageService } from './storage.service';
import { SupportFilesService } from './support-files.service';

/**
 * The refusals around support attachments. The happy path, against real
 * Postgres and a bucket, is covered where the SQL runs; these pin the rules.
 */
function harness(options: {
  configured?: boolean;
  pending?: number;
  rows?: { id: string; key: string }[];
  heads?: Record<string, { size: number } | null>;
} = {}) {
  const queries: { sql: string; args?: unknown[] }[] = [];
  const db = {
    queryOne: jest.fn(async (sql: string, args?: unknown[]) => {
      queries.push({ sql, args });
      if (sql.includes('count(*)')) return { count: options.pending ?? 0 };
      if (sql.includes('insert into support_attachments')) return { id: 'file-1' };
      return null;
    }),
    query: jest.fn(async (sql: string, args?: unknown[]) => {
      queries.push({ sql, args });
      if (sql.startsWith('select id, key')) return options.rows ?? [];
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
    headServerObject: jest.fn(async (key: string) =>
      options.heads && key in options.heads ? options.heads[key] : { size: 100 },
    ),
  };
  const files = new SupportFilesService(
    db as unknown as DatabaseService,
    storage as unknown as StorageService,
  );
  return { files, db, storage, queries };
}

const PDF = { contentType: 'application/pdf', contentLength: 1000, name: 'receipt.pdf' };

describe('SupportFilesService.createUpload', () => {
  it('signs a support/ key and records it pending against the uploader', async () => {
    const { files, storage, queries } = harness();
    const result = await files.createUpload({ userId: 'u1' }, PDF);
    expect(result.id).toBe('file-1');
    const [key] = storage.signServerUpload.mock.calls[0] as unknown as [string];
    expect(key).toMatch(/^support\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.pdf$/);
    const insert = queries.find((q) => q.sql.includes('insert into support_attachments'))!;
    expect(insert.args).toEqual([key, 'receipt.pdf', 'application/pdf', 1000, 'u1', null]);
  });

  it('keeps only the last part of a path for a name', async () => {
    const { files, queries } = harness();
    await files.createUpload({ adminId: 'a1' }, { ...PDF, name: 'C:\\Users\\me\\inv\u0007oice.pdf' });
    const insert = queries.find((q) => q.sql.includes('insert into support_attachments'))!;
    expect(insert.args?.[1]).toBe('invoice.pdf');
    expect(insert.args?.slice(4)).toEqual([null, 'a1']);
  });

  it('refuses what a browser in the console could not open, and anything over 10 MB', async () => {
    const { files, storage } = harness();
    await expect(
      files.createUpload({ userId: 'u1' }, { ...PDF, contentType: 'image/heic' }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      files.createUpload({ userId: 'u1' }, { ...PDF, contentLength: 10 * 1024 * 1024 + 1 }),
    ).rejects.toMatchObject({ status: 400 });
    expect(storage.signServerUpload).not.toHaveBeenCalled();
  });

  it('says so when storage is not set up, rather than signing nothing', async () => {
    const { files } = harness({ configured: false });
    await expect(files.createUpload({ userId: 'u1' }, PDF)).rejects.toMatchObject({ status: 503 });
  });

  it('stops at twenty files waiting to be sent', async () => {
    const { files, storage } = harness({ pending: 20 });
    await expect(files.createUpload({ userId: 'u1' }, PDF)).rejects.toMatchObject({ status: 429 });
    expect(storage.signServerUpload).not.toHaveBeenCalled();
  });
});

describe('SupportFilesService.verify', () => {
  it('needs nothing for a message without files', async () => {
    const { files, db } = harness();
    await expect(files.verify({ userId: 'u1' }, [])).resolves.toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('allows five files a message', async () => {
    const { files } = harness();
    await expect(
      files.verify({ userId: 'u1' }, ['1', '2', '3', '4', '5', '6']),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('refuses a file that is not the caller’s, already sent, or too old', async () => {
    // The query is scoped by owner, unsent and age, so any of those comes
    // back as a missing row.
    const { files, queries } = harness({ rows: [{ id: 'a', key: 'support/2026/10/a.pdf' }] });
    await expect(files.verify({ userId: 'u1' }, ['a', 'b'])).rejects.toMatchObject({ status: 400 });
    const lookup = queries.find((q) => q.sql.startsWith('select id, key'))!;
    expect(lookup.sql).toContain('user_id = $2::uuid');
    expect(lookup.sql).toContain('message_id is null');
    expect(lookup.args).toEqual([['a', 'b'], 'u1']);
  });

  it('refuses a file whose bytes never arrived', async () => {
    const key = 'support/2026/10/a.pdf';
    const { files } = harness({ rows: [{ id: 'a', key }], heads: { [key]: null } });
    await expect(files.verify({ userId: 'u1' }, ['a'])).rejects.toThrow("didn't finish uploading");
  });

  it('records the size the bucket reports', async () => {
    const key = 'support/2026/10/a.pdf';
    const { files, queries } = harness({ rows: [{ id: 'a', key }], heads: { [key]: { size: 4321 } } });
    await expect(files.verify({ userId: 'u1' }, ['a', 'a'])).resolves.toEqual(['a']);
    const update = queries.find((q) => q.sql.startsWith('update support_attachments set size_bytes'))!;
    expect(update.args).toEqual(['a', 4321]);
  });
});

describe('SupportFilesService.attach', () => {
  it('rolls the message back when a file was sent elsewhere meanwhile', async () => {
    const { files } = harness();
    const tx = { query: jest.fn(async () => ({ rowCount: 1 })) } as unknown as PoolClient;
    await expect(
      files.attach(tx, { userId: 'u1' }, ['a', 'b'], 'ticket', 'message'),
    ).rejects.toMatchObject({ status: 400 });
  });
});
