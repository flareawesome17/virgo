import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { DOWNLOAD_URL_TTL_SECONDS, EXTENSION_BY_CONTENT_TYPE } from './storage.config';
import { StorageService } from './storage.service';

/**
 * What a receipt can be: a photo of the paper one, or the PDF a shop or an
 * app emailed. The same set support takes, less the GIF.
 *
 * Not HEIC: the browser can't draw it. The phone re-encodes a picked photo
 * as JPEG before it uploads, so it never sends one.
 */
export const RECEIPT_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

/** A receipt not saved with an entry within this long is swept. */
const LOOSE_HOURS = 24;
/** How many unsaved receipts one person may hold at once. */
const MAX_LOOSE = 20;
/**
 * Receipts one account may keep. They don't count against storage, so this
 * is what bounds them: years of a busy creative's spending, photographed.
 */
export const MAX_RECEIPTS = 2000;

/**
 * What a file is held by: an entry's receipt, or a payment method's QR code.
 * One file each. A file neither holds is loose, and swept a day on.
 */
export type ReceiptHolder = { entryId: string } | { payMethodId: string };

function holderColumn(holder: ReceiptHolder): { column: 'entry_id' | 'pay_method_id'; id: string } {
  return 'entryId' in holder
    ? { column: 'entry_id', id: holder.entryId }
    : { column: 'pay_method_id', id: holder.payMethodId };
}

/** Held by nothing: an upload never saved, or one let go. */
const LOOSE = 'entry_id is null and pay_method_id is null';

export interface MoneyReceipt {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  /** Signed for an hour: draws a photo, opens a PDF. Null when storage is off. */
  url: string | null;
}

/** A file name fit to show and to save as: no path, no control characters. */
function cleanName(name: string | undefined, ext: string): string {
  const leaf = (name ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = leaf
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || `receipt.${ext}`;
}

/**
 * Receipts on money entries, from upload to deletion.
 *
 * The support-attachment flow, one file at a time: a signed PUT to a key the
 * server minted under `receipts/`, a row written loose when it is signed, a
 * HEAD to check the bytes landed when the entry is saved, and a sweep for
 * anything that never was. Here rather than in the money module so that
 * account deletion, which cannot depend on it, can erase them too.
 */
@Injectable()
export class ReceiptFilesService {
  private readonly logger = new Logger(ReceiptFilesService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
  ) {}

  /** Signs an upload and records it, loose, against whoever asked. */
  async createUpload(
    userId: string,
    input: { contentType: string; contentLength: number; name?: string },
  ) {
    if (!(RECEIPT_FILE_TYPES as readonly string[]).includes(input.contentType)) {
      throw new BadRequestException('Attach a photo (JPEG, PNG or WebP) or a PDF.');
    }
    if (input.contentLength <= 0 || input.contentLength > MAX_RECEIPT_BYTES) {
      throw new BadRequestException('A receipt has to be under 10 MB.');
    }
    if (!this.storage.configured) {
      throw new ServiceUnavailableException('Receipts are not available right now.');
    }

    const held = await this.db.queryOne<{ loose: number; kept: number }>(
      `select count(*) filter (
                where ${LOOSE}
                  and created_at > now() - interval '${LOOSE_HOURS} hours')::int as loose,
              count(*) filter (where entry_id is not null)::int as kept
         from money_receipts
        where user_id = $1`,
      [userId],
    );
    if ((held?.loose ?? 0) >= MAX_LOOSE) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many receipts are waiting to be saved. Save or remove some first.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if ((held?.kept ?? 0) >= MAX_RECEIPTS) {
      throw new BadRequestException(
        `You can keep up to ${MAX_RECEIPTS.toLocaleString('en-US')} receipts. Remove some older ones to add more.`,
      );
    }

    const ext = EXTENSION_BY_CONTENT_TYPE[input.contentType] ?? 'bin';
    const now = new Date();
    const key = `receipts/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${ext}`;
    const signed = await this.storage.signServerUpload(key, input.contentType, input.contentLength);

    const row = await this.db.queryOne<{ id: string }>(
      `insert into money_receipts (key, name, content_type, size_bytes, user_id)
       values ($1, $2, $3, $4, $5) returning id`,
      [key, cleanName(input.name, ext), input.contentType, input.contentLength, userId],
    );
    return { id: row!.id, ...signed };
  }

  /**
   * Checks a receipt is the caller's, loose or already on this entry, and
   * really in the bucket at no more than the limit — the confirm step. A
   * HEAD, so it runs before the transaction that saves the entry.
   */
  async verify(userId: string, receiptId: string, holder: ReceiptHolder): Promise<void> {
    const { column, id } = holderColumn(holder);
    const row = await this.db.queryOne<{ key: string; held: boolean }>(
      `select key, ${column} is not distinct from $3::uuid as held from money_receipts
        where id = $1 and user_id = $2
          and (${column} = $3::uuid
               or (${LOOSE} and created_at > now() - interval '${LOOSE_HOURS} hours'))`,
      [receiptId, userId, id],
    );
    if (!row) {
      throw new BadRequestException('That file has expired. Remove it and attach it again.');
    }
    // Already held here: checked when it was first saved.
    if (row.held) return;

    const head = await this.storage.headServerObject(row.key);
    if (!head) {
      throw new BadRequestException("The receipt didn't finish uploading. Remove it and try again.");
    }
    // The signature pins the size, so this only fails on a store that did not
    // enforce it. Recorded as B2 reports it, not as declared.
    if (head.size > MAX_RECEIPT_BYTES) {
      throw new BadRequestException('A receipt has to be under 10 MB.');
    }
    await this.db.query('update money_receipts set size_bytes = $2 where id = $1', [
      receiptId,
      head.size,
    ]);
  }

  /**
   * Puts a verified receipt on an entry — or, with null, takes the entry's
   * receipt off — inside the transaction that saves the entry. Whatever the
   * entry had before is let go, loose, for the sweep.
   */
  async attach(
    tx: PoolClient,
    userId: string,
    holder: ReceiptHolder,
    receiptId: string | null,
  ): Promise<void> {
    const { column, id } = holderColumn(holder);
    await tx.query(
      `update money_receipts set ${column} = null
        where ${column} = $1 and user_id = $2 and ($3::uuid is null or id <> $3::uuid)`,
      [id, userId, receiptId],
    );
    if (receiptId === null) return;
    const result = await tx.query(
      `update money_receipts
          set ${column} = $1, attached_at = coalesce(attached_at, now())
        where id = $3 and user_id = $2 and ((${LOOSE}) or ${column} = $1)`,
      [id, userId, receiptId],
    );
    if (result.rowCount !== 1) {
      throw new BadRequestException('That file is already in use elsewhere.');
    }
  }

  /** The receipts on these entries, with signed links, by entry id. */
  async forEntries(entryIds: readonly string[]): Promise<Map<string, MoneyReceipt>> {
    const byEntry = new Map<string, MoneyReceipt>();
    if (entryIds.length === 0) return byEntry;
    const rows = await this.db.query<{
      id: string;
      entry_id: string;
      key: string;
      name: string;
      content_type: string;
      size_bytes: number;
    }>(
      `select id, entry_id, key, name, content_type, size_bytes::int as size_bytes
         from money_receipts
        where entry_id = any($1::uuid[])`,
      [entryIds],
    );
    const urls = this.storage.configured
      ? await this.storage.mediaUrls(rows.map((r) => r.key), DOWNLOAD_URL_TTL_SECONDS)
      : rows.map(() => null);
    rows.forEach((r, i) => {
      byEntry.set(r.entry_id, {
        id: r.id,
        name: r.name,
        contentType: r.content_type,
        sizeBytes: r.size_bytes,
        url: urls[i],
      });
    });
    return byEntry;
  }

  /** The QR codes on these payment methods, with signed links, by method id. */
  async forPayMethods(payMethodIds: readonly string[]): Promise<Map<string, MoneyReceipt>> {
    const byMethod = new Map<string, MoneyReceipt>();
    if (payMethodIds.length === 0) return byMethod;
    const rows = await this.db.query<{
      id: string;
      pay_method_id: string;
      key: string;
      name: string;
      content_type: string;
      size_bytes: number;
    }>(
      `select id, pay_method_id, key, name, content_type, size_bytes::int as size_bytes
         from money_receipts
        where pay_method_id = any($1::uuid[])`,
      [payMethodIds],
    );
    const urls = this.storage.configured
      ? await this.storage.mediaUrls(rows.map((r) => r.key), DOWNLOAD_URL_TTL_SECONDS)
      : rows.map(() => null);
    rows.forEach((r, i) => {
      byMethod.set(r.pay_method_id, {
        id: r.id,
        name: r.name,
        contentType: r.content_type,
        sizeBytes: r.size_bytes,
        url: urls[i],
      });
    });
    return byMethod;
  }

  /**
   * Files nothing holds: uploads never saved, receipts and QR codes replaced
   * or removed, and those whose entry, method — or account — is gone. Their
   * objects go with their rows a day after upload. Hourly, a batch at a time.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sweep(): Promise<number> {
    if (!this.storage.configured) return 0;
    try {
      const rows = await this.db.query<{ id: string; key: string }>(
        `select id, key from money_receipts
          where ${LOOSE} and created_at < now() - interval '${LOOSE_HOURS} hours'
          order by created_at limit 500`,
      );
      if (rows.length === 0) return 0;
      const gone = await this.storage.deleteServerObjects(
        rows.map((r) => r.key),
        'receipt sweep',
      );
      const ids = rows.filter((r) => gone.has(r.key)).map((r) => r.id);
      if (ids.length > 0) {
        await this.db.query('delete from money_receipts where id = any($1::uuid[])', [ids]);
      }
      return ids.length;
    } catch (err) {
      this.logger.error(`Receipt sweep failed: ${String(err)}`);
      return 0;
    }
  }

  /**
   * Every receipt someone kept, deleted with their account. Throws when any
   * object stays, so the deletion stops before the account row goes and can
   * be tried again — the same rule as their library.
   */
  async eraseFor(userId: string): Promise<number> {
    const rows = await this.db.query<{ id: string; key: string }>(
      'select id, key from money_receipts where user_id = $1',
      [userId],
    );
    if (rows.length === 0) return 0;
    const gone = await this.storage.deleteServerObjects(
      rows.map((r) => r.key),
      'account deletion (receipts)',
    );
    const ids = rows.filter((r) => gone.has(r.key)).map((r) => r.id);
    if (ids.length > 0) {
      await this.db.query('delete from money_receipts where id = any($1::uuid[])', [ids]);
    }
    if (ids.length < rows.length) {
      throw new Error(`${rows.length - ids.length} receipt(s) could not be deleted`);
    }
    return ids.length;
  }
}
