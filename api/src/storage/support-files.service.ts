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
 * What can be attached to a support message: screenshots and photos the
 * browser and the phone both draw, and PDFs (an invoice, a receipt).
 *
 * Not HEIC: no browser in the console renders it. The phone re-encodes a
 * picked photo as JPEG before it uploads, so it never sends one.
 */
export const SUPPORT_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
] as const;

export const MAX_SUPPORT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_MESSAGE = 5;

/** An upload not sent with a message within this long is swept. */
const PENDING_HOURS = 24;
/** How many unsent files one person may hold at once. */
const MAX_PENDING = 20;

/** Who uploaded a file: a customer through the app, or staff through the console. */
export type FileOwner = { userId: string } | { adminId: string };

export interface SupportFile {
  id: string;
  name: string;
  content_type: string;
  size_bytes: number;
  /** Opens it: an image draws, a PDF shows in the browser's viewer. */
  url: string | null;
  /** Saves it under its own name. */
  download_url: string | null;
}

function ownerSql(owner: FileOwner, param: string): { clause: string; value: string } {
  return 'userId' in owner
    ? { clause: `user_id = ${param}::uuid`, value: owner.userId }
    : { clause: `admin_id = ${param}::uuid`, value: owner.adminId };
}

/** A file name fit to show and to save as: no path, no control characters. */
function cleanName(name: string | undefined, ext: string): string {
  const leaf = (name ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = leaf
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || `file.${ext}`;
}

/**
 * Files on support messages, from upload to deletion.
 *
 * They live in B2 under `support/`, outside every user's prefix, with a row in
 * `support_attachments` saying whose they are. That keeps them out of
 * `user_files`: a screenshot sent to support is not part of anyone's library,
 * so it never counts against their storage or appears among their files.
 *
 * The flow is the one uploads already use — a signed PUT, then a check that
 * the bytes landed — with the row standing in for the confirm: it is written
 * pending when the upload is signed, and becomes part of a message only when
 * that message is sent. Here rather than in the support desk so that account
 * deletion, which cannot depend on the console, can erase them too.
 */
@Injectable()
export class SupportFilesService {
  private readonly logger = new Logger(SupportFilesService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
  ) {}

  /** Signs an upload and records it, pending, against whoever asked. */
  async createUpload(
    owner: FileOwner,
    input: { contentType: string; contentLength: number; name?: string },
  ) {
    if (!(SUPPORT_FILE_TYPES as readonly string[]).includes(input.contentType)) {
      throw new BadRequestException('Attach a photo (JPEG, PNG, WebP or GIF) or a PDF.');
    }
    if (input.contentLength <= 0 || input.contentLength > MAX_SUPPORT_FILE_BYTES) {
      throw new BadRequestException('Each file has to be under 10 MB.');
    }
    if (!this.storage.configured) {
      throw new ServiceUnavailableException('Attachments are not available right now.');
    }

    const who = ownerSql(owner, '$1');
    const pending = await this.db.queryOne<{ count: number }>(
      `select count(*)::int as count from support_attachments
        where ${who.clause} and message_id is null
          and created_at > now() - interval '${PENDING_HOURS} hours'`,
      [who.value],
    );
    if ((pending?.count ?? 0) >= MAX_PENDING) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many files are waiting to be sent. Send or remove some first.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const ext = EXTENSION_BY_CONTENT_TYPE[input.contentType] ?? 'bin';
    const now = new Date();
    const key = `support/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${ext}`;
    const signed = await this.storage.signServerUpload(key, input.contentType, input.contentLength);

    const row = await this.db.queryOne<{ id: string }>(
      `insert into support_attachments (key, name, content_type, size_bytes, user_id, admin_id)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [
        key,
        cleanName(input.name, ext),
        input.contentType,
        input.contentLength,
        'userId' in owner ? owner.userId : null,
        'adminId' in owner ? owner.adminId : null,
      ],
    );
    return { id: row!.id, ...signed };
  }

  /**
   * Checks each upload is the caller's, unsent, recent, and really in the
   * bucket at no more than the limit — the confirm step, for every file at
   * once. A HEAD per file, so it runs before the transaction that writes the
   * message rather than inside it.
   */
  async verify(owner: FileOwner, ids: readonly string[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    if (unique.length > MAX_FILES_PER_MESSAGE) {
      throw new BadRequestException(`Up to ${MAX_FILES_PER_MESSAGE} files a message.`);
    }

    const who = ownerSql(owner, '$2');
    const rows = await this.db.query<{ id: string; key: string }>(
      `select id, key from support_attachments
        where id = any($1::uuid[]) and ${who.clause} and message_id is null
          and created_at > now() - interval '${PENDING_HOURS} hours'`,
      [unique, who.value],
    );
    if (rows.length !== unique.length) {
      throw new BadRequestException('A file has expired. Remove it and attach it again.');
    }

    for (const row of rows) {
      const head = await this.storage.headServerObject(row.key);
      if (!head) {
        throw new BadRequestException("A file didn't finish uploading. Remove it and try again.");
      }
      // The signature pins the size, so this only fails on a store that did
      // not enforce it. Recorded as B2 reports it, not as declared.
      if (head.size > MAX_SUPPORT_FILE_BYTES) {
        throw new BadRequestException('Each file has to be under 10 MB.');
      }
      await this.db.query('update support_attachments set size_bytes = $2 where id = $1', [
        row.id,
        head.size,
      ]);
    }
    return unique;
  }

  /**
   * Files verified uploads under the message just written, inside its
   * transaction, so a message never exists without its files or the reverse.
   * A file sent twice at once loses the race here and rolls its message back.
   */
  async attach(
    tx: PoolClient,
    owner: FileOwner,
    ids: readonly string[],
    ticketId: string,
    messageId: string,
  ): Promise<void> {
    if (ids.length === 0) return;
    const who = ownerSql(owner, '$4');
    const result = await tx.query(
      `update support_attachments
          set ticket_id = $2, message_id = $3, attached_at = now()
        where id = any($1::uuid[]) and message_id is null and ${who.clause}`,
      [ids, ticketId, messageId, who.value],
    );
    if (result.rowCount !== ids.length) {
      throw new BadRequestException('A file was already sent. Remove it and try again.');
    }
  }

  /** The files on these messages, with signed links, by message id. */
  async forMessages(messageIds: readonly string[]): Promise<Map<string, SupportFile[]>> {
    const byMessage = new Map<string, SupportFile[]>();
    if (messageIds.length === 0) return byMessage;
    const rows = await this.db.query<{
      id: string;
      message_id: string;
      key: string;
      name: string;
      content_type: string;
      size_bytes: number;
    }>(
      `select id, message_id, key, name, content_type, size_bytes::int as size_bytes
         from support_attachments
        where message_id = any($1::uuid[])
        order by created_at`,
      [messageIds],
    );
    const keys = rows.map((r) => r.key);
    const [urls, downloads] = await Promise.all([
      this.storage.mediaUrls(keys, DOWNLOAD_URL_TTL_SECONDS),
      this.storage.mediaUrls(
        keys,
        DOWNLOAD_URL_TTL_SECONDS,
        rows.map((r) => r.name),
      ),
    ]);
    rows.forEach((r, i) => {
      const list = byMessage.get(r.message_id) ?? [];
      list.push({
        id: r.id,
        name: r.name,
        content_type: r.content_type,
        size_bytes: r.size_bytes,
        url: urls[i],
        download_url: downloads[i],
      });
      byMessage.set(r.message_id, list);
    });
    return byMessage;
  }

  /**
   * Uploads signed and never sent: a tab closed mid-message, a file removed
   * before sending. Their objects go with their rows, a day on. Hourly, and
   * a batch at a time, so a backlog drains rather than arriving at once.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sweep(): Promise<number> {
    if (!this.storage.configured) return 0;
    try {
      const rows = await this.db.query<{ id: string; key: string }>(
        `select id, key from support_attachments
          where message_id is null and created_at < now() - interval '${PENDING_HOURS} hours'
          order by created_at limit 500`,
      );
      if (rows.length === 0) return 0;
      const gone = await this.storage.deleteServerObjects(
        rows.map((r) => r.key),
        'support upload sweep',
      );
      const ids = rows.filter((r) => gone.has(r.key)).map((r) => r.id);
      if (ids.length > 0) {
        await this.db.query('delete from support_attachments where id = any($1::uuid[])', [ids]);
      }
      return ids.length;
    } catch (err) {
      this.logger.error(`Support upload sweep failed: ${String(err)}`);
      return 0;
    }
  }

  /**
   * Everything a customer attached, deleted with their account. Throws when
   * any object stays, so the deletion stops before the account row goes and
   * can be tried again — the same rule as their library.
   */
  async eraseFor(userId: string): Promise<number> {
    const rows = await this.db.query<{ id: string; key: string }>(
      'select id, key from support_attachments where user_id = $1',
      [userId],
    );
    if (rows.length === 0) return 0;
    const gone = await this.storage.deleteServerObjects(
      rows.map((r) => r.key),
      'account deletion (support files)',
    );
    const ids = rows.filter((r) => gone.has(r.key)).map((r) => r.id);
    if (ids.length > 0) {
      await this.db.query('delete from support_attachments where id = any($1::uuid[])', [ids]);
    }
    if (ids.length < rows.length) {
      throw new Error(`${rows.length - ids.length} support file(s) could not be deleted`);
    }
    return ids.length;
  }
}
