import { Readable } from 'node:stream';
import { deflateSync } from 'node:zlib';
import sharp from 'sharp';
import type { DatabaseService } from '../database/database.service';
import type { QuotaService } from '../quota/quota.service';
import {
  ChatFilesService,
  cleanChatFileName,
  countPdfPages,
  MAX_CHAT_PHOTO_BYTES,
} from './chat-files.service';
import type { StorageService } from './storage.service';
import type { ThumbnailsService } from './thumbnails.service';

/**
 * The rules around chat photos and files (migration 114). The SQL itself is
 * run against real Postgres and a bucket elsewhere; these pin the refusals,
 * the keys, and what a photo becomes on arrival.
 */
function harness(
  options: {
    configured?: boolean;
    waiting?: number;
    checkRows?: { kind: 'photo' | 'file'; name: string }[];
    row?: Record<string, unknown> | null;
    head?: { size: number } | null;
    bytes?: Buffer;
  } = {},
) {
  const queries: { sql: string; args?: unknown[] }[] = [];
  let inserted = 0;
  const db = {
    queryOne: jest.fn(async (sql: string, args?: unknown[]) => {
      queries.push({ sql, args });
      if (sql.includes('count(*)')) return { count: options.waiting ?? 0 };
      if (sql.includes('insert into message_attachments')) {
        inserted += 1;
        return { id: `att-${inserted}` };
      }
      if (sql.startsWith('update message_attachments') && sql.includes("status = 'ready'")) {
        return { ...options.row, status: 'ready', size_bytes: args?.[1], thumb_key: args?.[2], blur: args?.[3], width_px: args?.[4], height_px: args?.[5], pages: args?.[6], name: args?.[7], content_type: args?.[8] };
      }
      if (sql.includes('from message_attachments')) {
        return options.row === undefined ? null : options.row;
      }
      return null;
    }),
    query: jest.fn(async (sql: string, args?: unknown[]) => {
      queries.push({ sql, args });
      if (sql.startsWith('select kind, name')) return options.checkRows ?? [];
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
    readStream: jest.fn(async () => Readable.from([options.bytes ?? Buffer.alloc(0)])),
    putDerived: jest.fn(async () => undefined),
    deleteServerObjects: jest.fn(async (keys: string[]) => new Set(keys)),
    mediaUrls: jest.fn(async (keys: (string | null)[]) => keys.map((k) => (k ? `https://cdn.test/${k}` : null))),
  };
  const quota = { assertCanStore: jest.fn(async () => undefined) };
  const files = new ChatFilesService(
    db as unknown as DatabaseService,
    storage as unknown as StorageService,
    quota as unknown as QuotaService,
    {} as ThumbnailsService,
  );
  return { files, db, storage, quota, queries };
}

const PHOTO = { contentType: 'image/jpeg', contentLength: 400_000, name: 'IMG_0412.jpg' };
const PDF = { contentType: 'application/pdf', contentLength: 1_200_000, name: 'Call sheet.pdf' };

describe('ChatFilesService.createUploads', () => {
  it('signs a chat/ key per photo, in order, counted toward the sender at its declared size', async () => {
    const { files, storage, quota, queries } = harness();
    const tickets = await files.createUploads('u1', 'c1', [PHOTO, { ...PHOTO, contentType: 'image/png', name: 'shot.png' }]);
    expect(tickets.map((t) => t.id)).toEqual(['att-1', 'att-2']);
    const keys = storage.signServerUpload.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(keys[0]).toMatch(/^chat\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/);
    expect(keys[1]).toMatch(/\.png$/);
    expect(quota.assertCanStore).toHaveBeenCalledWith('u1', 800_000);
    const inserts = queries.filter((q) => q.sql.includes('insert into message_attachments'));
    expect(inserts[0].args).toEqual(['u1', 'c1', 0, 'photo', keys[0], 'IMG_0412.jpg', 'image/jpeg', 400_000]);
    expect(inserts[1].args?.[2]).toBe(1);
  });

  it('takes one PDF on its own', async () => {
    const { files, queries } = harness();
    await files.createUploads('u1', 'c1', [PDF]);
    const insert = queries.find((q) => q.sql.includes('insert into message_attachments'))!;
    expect(insert.args?.[3]).toBe('file');
    expect(insert.args?.[5]).toBe('Call sheet.pdf');
  });

  it('refuses a file sent with photos', async () => {
    const { files } = harness();
    await expect(files.createUploads('u1', 'c1', [PHOTO, PDF])).rejects.toThrow('Send one file at a time');
  });

  it('refuses an eleventh photo', async () => {
    const { files } = harness();
    await expect(files.createUploads('u1', 'c1', Array(11).fill(PHOTO))).rejects.toThrow('up to 10 photos');
  });

  it('refuses a HEIC, which the server cannot decode, and anything else', async () => {
    const { files } = harness();
    await expect(
      files.createUploads('u1', 'c1', [{ ...PHOTO, contentType: 'image/heic' }]),
    ).rejects.toThrow('JPEG, PNG or WebP');
    await expect(
      files.createUploads('u1', 'c1', [{ ...PHOTO, contentType: 'video/mp4' }]),
    ).rejects.toThrow('JPEG, PNG or WebP');
  });

  it('refuses a photo over 15 MB and a PDF over 20 MB', async () => {
    const { files } = harness();
    await expect(
      files.createUploads('u1', 'c1', [{ ...PHOTO, contentLength: MAX_CHAT_PHOTO_BYTES + 1 }]),
    ).rejects.toThrow('under 15 MB');
    await expect(
      files.createUploads('u1', 'c1', [{ ...PDF, contentLength: 21 * 1024 * 1024 }]),
    ).rejects.toThrow('PDF under 20 MB');
  });

  it('refuses more while forty are still sending', async () => {
    const { files } = harness({ waiting: 38 });
    await expect(files.createUploads('u1', 'c1', [PHOTO, PHOTO, PHOTO])).rejects.toMatchObject({
      status: 429,
    });
  });

  it('says so when storage is off, rather than signing nothing', async () => {
    const { files } = harness({ configured: false });
    await expect(files.createUploads('u1', 'c1', [PHOTO])).rejects.toMatchObject({ status: 503 });
  });

  it('passes on a full storage refusal before anything is signed', async () => {
    const { files, storage, quota } = harness();
    quota.assertCanStore.mockRejectedValueOnce(Object.assign(new Error('full'), { status: 403 }));
    await expect(files.createUploads('u1', 'c1', [PHOTO])).rejects.toMatchObject({ status: 403 });
    expect(storage.signServerUpload).not.toHaveBeenCalled();
  });
});

describe('ChatFilesService.check', () => {
  it('reads photos as a photos message of that many', async () => {
    const { files } = harness({ checkRows: [{ kind: 'photo', name: 'a' }, { kind: 'photo', name: 'b' }] });
    await expect(files.check('u1', 'c1', ['a1', 'a2'])).resolves.toEqual({
      kind: 'photos',
      count: 2,
      fileName: null,
    });
  });

  it('reads one PDF as a file message with its name', async () => {
    const { files } = harness({ checkRows: [{ kind: 'file', name: 'Call sheet.pdf' }] });
    await expect(files.check('u1', 'c1', ['a1'])).resolves.toEqual({
      kind: 'file',
      count: 1,
      fileName: 'Call sheet.pdf',
    });
  });

  it("refuses ids that aren't the sender's unsent uploads in this chat", async () => {
    const { files } = harness({ checkRows: [{ kind: 'photo', name: 'a' }] });
    await expect(files.check('u1', 'c1', ['a1', 'a2'])).rejects.toThrow("can't be sent any more");
  });

  it('refuses the same id twice', async () => {
    const { files } = harness();
    await expect(files.check('u1', 'c1', ['a1', 'a1'])).rejects.toThrow('Pick the photos');
  });
});

describe('ChatFilesService.finish', () => {
  const uploading = {
    id: 'att-1',
    user_id: 'u1',
    conversation_id: 'c1',
    message_id: 'm1',
    position: 0,
    kind: 'photo',
    status: 'uploading',
    key: 'chat/2026/11/0b8f0f5e-6a8a-4c55-9d7e-3d3f6c1c9a10.jpg',
    thumb_key: null,
    blur: null,
    name: 'IMG_0412.jpg',
    content_type: 'image/jpeg',
    size_bytes: 400_000,
    width_px: null,
    height_px: null,
    pages: null,
  };

  it('shrinks a photo to 2,048 px as a WebP without its GPS, with a 640 px copy and a blur', async () => {
    const original = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: { r: 200, g: 170, b: 140 } },
    })
      .jpeg()
      .withExif({ IFD0: { Copyright: 'Somebody' }, IFD3: { GPSLatitudeRef: 'N' } })
      .toBuffer();
    const { files, storage } = harness({ row: uploading, bytes: original, head: { size: original.length } });
    const done = await files.finish('u1', 'att-1');

    const [[photoKey, photo, type], [thumbKey, thumb]] = storage.putDerived.mock.calls as unknown as [
      string,
      Buffer,
      string,
    ][];
    expect(photoKey).toBe(uploading.key);
    expect(type).toBe('image/webp');
    const meta = await sharp(photo).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 2048, 1536]);
    expect(meta.exif).toBeUndefined();
    expect(thumbKey).toBe('chat/2026/11/0b8f0f5e-6a8a-4c55-9d7e-3d3f6c1c9a10-t.webp');
    expect((await sharp(thumb).metadata()).width).toBe(640);

    expect(done.messageId).toBe('m1');
    expect(done.attachment).toMatchObject({
      status: 'ready',
      width: 2048,
      height: 1536,
      name: 'IMG_0412.webp',
      contentType: 'image/webp',
      sizeBytes: photo.length,
      thumbUrl: `https://cdn.test/${thumbKey}`,
    });
    expect(done.attachment.blur).toMatch(/^data:image\/webp;base64,/);
  });

  it('answers 409 NOT_UPLOADED while the bytes are not there yet, and changes nothing', async () => {
    const { files, db } = harness({ row: uploading, head: null });
    await expect(files.finish('u1', 'att-1')).rejects.toMatchObject({
      status: 409,
      response: { code: 'NOT_UPLOADED' },
    });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('marks a photo that will not decode failed, and removes it', async () => {
    const { files, storage, queries } = harness({
      row: uploading,
      bytes: Buffer.from('not a photo'),
    });
    await expect(files.finish('u1', 'att-1')).rejects.toThrow("couldn't be read");
    expect(storage.deleteServerObjects).toHaveBeenCalledWith([uploading.key], 'chat file failed');
    expect(queries.some((q) => q.sql.includes("status = 'failed'"))).toBe(true);
  });

  it("refuses a file that isn't a PDF", async () => {
    const { files } = harness({
      row: { ...uploading, kind: 'file', content_type: 'application/pdf', name: 'x.pdf' },
      bytes: Buffer.from('<html>'),
    });
    await expect(files.finish('u1', 'att-1')).rejects.toThrow("isn't a PDF");
  });

  it('does nothing again for one already ready', async () => {
    const { files, storage } = harness({ row: { ...uploading, status: 'ready' } });
    const done = await files.finish('u1', 'att-1');
    expect(done.attachment.status).toBe('ready');
    expect(storage.headServerObject).not.toHaveBeenCalled();
  });
});

describe('ChatFilesService, keeping and removing', () => {
  it('leaves the files of a message an open report holds', async () => {
    const { files, queries } = harness();
    await files.removeForMessages(['m1']);
    expect(queries[0].sql).toContain('report_evidence');
    expect(queries[0].sql).toContain("r.status = 'open'");
  });

  it('sweeps unseen files only when no open report holds them', async () => {
    const { files, queries } = harness();
    await files.sweep();
    const unseen = queries.find((q) => q.sql.includes('join messages m'))!;
    expect(unseen.sql).toContain('conversation_participants');
    expect(unseen.sql).toContain('message_deletions');
    expect(unseen.sql).toContain('report_evidence');
  });
});

describe('countPdfPages', () => {
  it("reads the page tree's count", () => {
    const pdf = Buffer.from(
      '%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n' +
        '2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >> endobj\n' +
        '3 0 obj << /Type /Page /Parent 2 0 R >> endobj\n%%EOF',
      'latin1',
    );
    expect(countPdfPages(pdf)).toBe(3);
  });

  it('reads it from inside a compressed object stream', () => {
    const inner = deflateSync(Buffer.from('2 0 << /Type /Pages /Kids [4 0 R] /Count 12 >>', 'latin1'));
    const pdf = Buffer.concat([
      Buffer.from(
        `%PDF-1.5\n7 0 obj << /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length ${inner.length} >>\nstream\n`,
        'latin1',
      ),
      inner,
      Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1'),
    ]);
    expect(countPdfPages(pdf)).toBe(12);
  });

  it('counts the pages when there is no tree count', () => {
    const pdf = Buffer.from('%PDF-1.4 << /Type /Page >> << /Type /Page >> << /Type /Pages >>', 'latin1');
    expect(countPdfPages(pdf)).toBe(2);
  });

  it('says nothing rather than guess', () => {
    expect(countPdfPages(Buffer.from('%PDF-1.7 nothing here', 'latin1'))).toBeNull();
  });
});

describe('cleanChatFileName', () => {
  it('keeps the name, not the path or control characters', () => {
    expect(cleanChatFileName('C:\\Users\\me\\Call\u0007 sheet.pdf', 'File.pdf')).toBe('Call sheet.pdf');
    expect(cleanChatFileName('   ', 'File.pdf')).toBe('File.pdf');
  });
});
