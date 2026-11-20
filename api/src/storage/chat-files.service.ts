import { randomUUID } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { PoolClient } from 'pg';
import sharp from 'sharp';
import { DatabaseService } from '../database/database.service';
import { QuotaService } from '../quota/quota.service';
import { blurDataUrl } from './blur';
import {
  CHAT_VOICE_TYPES,
  MAX_CHAT_VOICE_BYTES,
  MAX_VOICE_MS_ACCEPTED,
  VOICE_CONTENT_TYPE,
  VOICE_NAME,
  encodeVoiceNote,
} from './chat-voice';
import { Semaphore } from './semaphore';
import {
  DISPLAY_URL_TTL_SECONDS,
  DOWNLOAD_URL_TTL_SECONDS,
  EXTENSION_BY_CONTENT_TYPE,
} from './storage.config';
import { StorageService } from './storage.service';
import { ThumbnailsService } from './thumbnails.service';

/**
 * What a photo sent in a chat may be: what the phone and the browser send
 * once they have shrunk it. Not HEIC, which this server's sharp cannot
 * decode: the phone re-encodes as JPEG before it uploads.
 */
export const CHAT_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** A file is a PDF: a call sheet, a contract, a mood board. */
export const CHAT_FILE_TYPES = ['application/pdf'] as const;

export const MAX_CHAT_PHOTOS = 10;
/**
 * Headroom, not a target. The apps send about 2,000 px (around 0.5 MB), or
 * 1,280 px on a slow line; this leaves room for a screenshot as a PNG.
 */
export const MAX_CHAT_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_CHAT_FILE_BYTES = 20 * 1024 * 1024;
/** Longest the caption under a photo or a file may be. */
export const MAX_CHAT_CAPTION = 1000;

/** Uploads one person may have signed and not yet sent or finished. */
const MAX_UNSENT = 40;
/** How long an upload may sit unsent or unfinished before it is swept. */
const STALE_HOURS = 24;

/** A chat photo as stored: long edge, WebP quality. */
const PHOTO_EDGE = 2048;
const PHOTO_QUALITY = 82;
/** Its small copy for the thread: enough for a 2×2 grid at 3×. */
const THUMB_EDGE = 640;
const THUMB_QUALITY = 70;
const MAX_PIXELS = 50_000_000;
const WEBP = 'image/webp';

/**
 * Two at a time, beside the album thumbnails' own two. A chat photo is a few
 * hundred kilobytes by the time it arrives, so this is a ceiling for a burst,
 * not a queue anyone waits in.
 */
const decodes = new Semaphore(2);

export type ChatAttachmentKind = 'photo' | 'file' | 'voice';
/** The message kinds that carry attachments, and the attachment each carries. */
export type FilesMessageKind = 'photos' | 'file' | 'voice';
export const FILES_MESSAGE_KINDS: readonly FilesMessageKind[] = ['photos', 'file', 'voice'];

export function isFilesKind(kind: string | null | undefined): kind is FilesMessageKind {
  return (FILES_MESSAGE_KINDS as readonly string[]).includes(kind ?? '');
}
export type ChatAttachmentStatus = 'uploading' | 'ready' | 'failed';

/** An attachment as the apps get it, inside its message. */
export interface ChatAttachment {
  id: string;
  kind: ChatAttachmentKind;
  status: ChatAttachmentStatus;
  name: string;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  /** A PDF's page count, when it could be read. */
  pages: number | null;
  /**
   * A voice note's length: what the sender's app said until it arrives, then
   * what the server measured. Null on photos and files.
   */
  durationMs: number | null;
  /** A voice note's shape, 48 levels from 0 to 100. Null until it arrives. */
  waveform: number[] | null;
  /** About 300 bytes: painted before anything loads, and instead of it on a slow line. */
  blur: string | null;
  /** The small copy, signed for half a day. Null until it is ready. */
  thumbUrl: string | null;
  /** The photo or PDF itself, signed for half a day. Null until it is ready. */
  url: string | null;
}

export interface NewChatFile {
  contentType: string;
  contentLength: number;
  name?: string;
  /** A voice note's length as the recorder measured it: the line says it before it arrives. */
  durationMs?: number;
}

export interface ChatUploadTicket {
  id: string;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  expiresAt: string;
}

interface AttachmentRow {
  id: string;
  user_id: string;
  conversation_id: string | null;
  message_id: string | null;
  position: number;
  kind: ChatAttachmentKind;
  status: ChatAttachmentStatus;
  key: string;
  thumb_key: string | null;
  blur: string | null;
  name: string;
  content_type: string;
  size_bytes: string | number;
  width_px: number | null;
  height_px: number | null;
  pages: number | null;
  duration_ms: number | null;
  waveform: number[] | null;
}

const ROW_COLUMNS = `id, user_id, conversation_id, message_id, position, kind, status, key,
  thumb_key, blur, name, content_type, size_bytes, width_px, height_px, pages,
  duration_ms, waveform`;

/** Nobody can hold on to it: no open report names its message. */
const NOT_HELD = (attachment: string) => `not exists (
  select 1 from report_evidence e
    join user_reports r on r.id = e.report_id
   where e.message_id = ${attachment}.message_id and r.status = 'open')`;

/** A file name fit to show and to save as: no path, no control characters. */
export function cleanChatFileName(name: string | undefined, fallback: string): string {
  const leaf = (name ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = leaf
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

/** The name a photo is saved under once it is a WebP. */
function photoName(name: string): string {
  const stem = name.replace(/\.[a-z0-9]{1,5}$/i, '').trim() || 'Photo';
  return `${stem}.webp`;
}

function mintKey(ext: string): string {
  const now = new Date();
  return `chat/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${ext}`;
}

/** Where a photo's small copy lives, beside it. */
function thumbKeyFor(key: string): string {
  return key.replace(/\.[a-z0-9]{2,5}$/, '-t.webp');
}

/**
 * A PDF's page count, or null when it can't be told.
 *
 * Read from the page tree's `/Count`, the largest one found: the root of the
 * tree counts every page under it. Since PDF 1.5 the tree may be inside a
 * compressed object stream, so those are inflated and read the same way.
 * Failing that, the pages themselves are counted. No PDF library: this is a
 * label under a file name, and a wrong guess is worse than none, so anything
 * implausible comes back null.
 */
export function countPdfPages(pdf: Buffer): number | null {
  const texts = [pdf.toString('latin1')];
  const raw = texts[0];
  let inflated = 0;
  for (const match of raw.matchAll(/stream\r?\n/g)) {
    const start = (match.index ?? 0) + match[0].length;
    const head = raw.slice(Math.max(0, (match.index ?? 0) - 400), match.index);
    if (!/\/ObjStm/.test(head) || !/\/FlateDecode/.test(head)) continue;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    try {
      // Capped, so one stream that inflates to gigabytes stops here.
      const body = inflateSync(Buffer.from(raw.slice(start, end), 'latin1'), {
        maxOutputLength: 20 * 1024 * 1024,
      });
      inflated += body.length;
      texts.push(body.toString('latin1'));
    } catch {
      // A stream that will not inflate is not one we can read.
    }
    if (inflated > 50 * 1024 * 1024) break;
  }

  let count = 0;
  for (const text of texts) {
    for (const dict of text.matchAll(/<<((?:(?!<<|>>)[\s\S])*?\/Type\s*\/Pages\b(?:(?!<<|>>)[\s\S])*?)>>/g)) {
      const n = /\/Count\s+(\d+)/.exec(dict[1]);
      if (n) count = Math.max(count, Number(n[1]));
    }
  }
  if (count === 0) {
    for (const text of texts) count += (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  }
  return count > 0 && count < 100_000 ? count : null;
}

/**
 * Photos and files sent in chats, from upload to deletion (migration 114).
 *
 * The receipts flow, with the storage counted: a signed PUT to a key the
 * server mints under `chat/`, a row written when it is signed, a HEAD to
 * check the bytes landed, and a sweep for anything left behind.
 *
 * A photo is re-encoded on arrival, as a profile cover is: at most 2,048 px,
 * as a WebP. That is what strips the camera's EXIF and GPS whatever app sent
 * it, and it makes the small copy and the blurred stand-in the thread paints
 * first on a weak signal.
 *
 * Here rather than in the messages module so that account deletion, which
 * cannot depend on chat, can erase them too.
 */
@Injectable()
export class ChatFilesService {
  private readonly logger = new Logger(ChatFilesService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly quota: QuotaService,
    private readonly thumbs: ThumbnailsService,
  ) {}

  /**
   * Signs the uploads for one message: up to ten photos, or one PDF. Rows
   * are written now, counted toward the sender's storage at their declared
   * size, so a burst of tickets buys no room the account does not have.
   *
   * The caller has checked the sender is in the chat and may send to it.
   */
  async createUploads(
    userId: string,
    conversationId: string,
    files: NewChatFile[],
  ): Promise<ChatUploadTicket[]> {
    if (files.length === 0) throw new BadRequestException('Pick a photo or a file to send.');
    if (!this.storage.configured) {
      throw new ServiceUnavailableException("Photos and files can't be sent right now.");
    }
    const kinds = files.map((f) => this.kindOf(f.contentType));
    if (kinds.includes('voice')) {
      if (files.length > 1) {
        throw new BadRequestException('Send one voice note at a time.');
      }
      if (files[0].contentLength <= 0 || files[0].contentLength > MAX_CHAT_VOICE_BYTES) {
        throw new BadRequestException('A voice note can be up to 2 minutes long.');
      }
    } else if (kinds.includes('file')) {
      if (files.length > 1) {
        throw new BadRequestException('Send one file at a time, or photos on their own.');
      }
      if (files[0].contentLength <= 0 || files[0].contentLength > MAX_CHAT_FILE_BYTES) {
        throw new BadRequestException('A file has to be a PDF under 20 MB.');
      }
    } else {
      if (files.length > MAX_CHAT_PHOTOS) {
        throw new BadRequestException(`Send up to ${MAX_CHAT_PHOTOS} photos at once.`);
      }
      if (files.some((f) => f.contentLength <= 0 || f.contentLength > MAX_CHAT_PHOTO_BYTES)) {
        throw new BadRequestException('A photo has to be under 15 MB.');
      }
    }

    const waiting = await this.db.queryOne<{ count: number }>(
      `select count(*)::int as count from message_attachments
        where user_id = $1 and (message_id is null or status = 'uploading')
          and created_at > now() - interval '${STALE_HOURS} hours'`,
      [userId],
    );
    if ((waiting?.count ?? 0) + files.length > MAX_UNSENT) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many photos are still sending. Let those finish, then try again.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    // STORAGE_FULL comes back as it does for an album upload, and the apps
    // put their own words in front of it.
    await this.quota.assertCanStore(
      userId,
      files.reduce((sum, f) => sum + f.contentLength, 0),
    );

    const tickets: ChatUploadTicket[] = [];
    for (const [position, file] of files.entries()) {
      const kind = kinds[position];
      // A voice note's key is .m4a whatever was recorded: it is re-encoded
      // as one in place when it arrives.
      const ext = kind === 'voice' ? 'm4a' : (EXTENSION_BY_CONTENT_TYPE[file.contentType] ?? 'bin');
      const key = mintKey(ext);
      const signed = await this.storage.signServerUpload(key, file.contentType, file.contentLength);
      const name =
        kind === 'voice'
          ? VOICE_NAME
          : cleanChatFileName(file.name, kind === 'photo' ? `Photo.${ext}` : `File.${ext}`);
      const declared =
        kind === 'voice' && Number.isFinite(file.durationMs)
          ? Math.max(0, Math.min(MAX_VOICE_MS_ACCEPTED, Math.round(file.durationMs!)))
          : null;
      const row = await this.db.queryOne<{ id: string }>(
        `insert into message_attachments
           (user_id, conversation_id, position, kind, key, name, content_type, size_bytes, duration_ms)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
        [userId, conversationId, position, kind, key, name, file.contentType, file.contentLength, declared],
      );
      tickets.push({ id: row!.id, ...signed });
    }
    return tickets;
  }

  /**
   * A fresh upload link for one still on its way: the first expires after a
   * quarter of an hour, and a phone that lost its signal for longer than
   * that resumes with this.
   */
  async resign(userId: string, attachmentId: string): Promise<ChatUploadTicket> {
    const row = await this.db.queryOne<AttachmentRow>(
      `select ${ROW_COLUMNS} from message_attachments
        where id = $1 and user_id = $2 and status = 'uploading'
          and created_at > now() - interval '${STALE_HOURS} hours'`,
      [attachmentId, userId],
    );
    if (!row) throw new NotFoundException("That can't be sent any more. Pick it again.");
    const signed = await this.storage.signServerUpload(
      row.key,
      row.content_type,
      Number(row.size_bytes),
    );
    return { id: row.id, ...signed };
  }

  /**
   * What a message would carry: these uploads, the sender's, in this chat and
   * not yet sent. All photos, one file, or one voice note.
   */
  async check(
    userId: string,
    conversationId: string,
    ids: string[],
  ): Promise<{
    kind: FilesMessageKind;
    count: number;
    fileName: string | null;
    durationMs: number | null;
  }> {
    const unique = [...new Set(ids)];
    if (unique.length === 0 || unique.length !== ids.length || unique.length > MAX_CHAT_PHOTOS) {
      throw new BadRequestException('Pick the photos to send again.');
    }
    const rows = await this.db.query<{
      kind: ChatAttachmentKind;
      name: string;
      duration_ms: number | null;
    }>(
      `select kind, name, duration_ms from message_attachments
        where id = any($1::uuid[]) and user_id = $2 and conversation_id = $3
          and message_id is null and status <> 'failed'`,
      [unique, userId, conversationId],
    );
    if (rows.length !== unique.length) {
      throw new BadRequestException("Those can't be sent any more. Pick them again.");
    }
    const voice = rows.filter((r) => r.kind === 'voice');
    if (voice.length > 0) {
      if (rows.length > 1) throw new BadRequestException('Send one voice note at a time.');
      return { kind: 'voice', count: 1, fileName: null, durationMs: voice[0].duration_ms };
    }
    const files = rows.filter((r) => r.kind === 'file');
    if (files.length > 0 && rows.length > 1) {
      throw new BadRequestException('Send one file at a time, or photos on their own.');
    }
    return files.length
      ? { kind: 'file', count: 1, fileName: files[0].name, durationMs: null }
      : { kind: 'photos', count: rows.length, fileName: null, durationMs: null };
  }

  /**
   * Puts the uploads on the message, in the order given, inside the
   * transaction that writes it. Throws when any has gone in the meantime,
   * which rolls the message back with it.
   */
  async attach(tx: PoolClient, userId: string, messageId: string, ids: string[]): Promise<void> {
    const result = await tx.query(
      `update message_attachments a
          set message_id = $1, position = w.pos - 1
         from unnest($2::uuid[]) with ordinality as w(id, pos)
        where a.id = w.id and a.user_id = $3 and a.message_id is null and a.status <> 'failed'`,
      [messageId, ids, userId],
    );
    if (result.rowCount !== ids.length) {
      throw new BadRequestException("Those can't be sent any more. Pick them again.");
    }
  }

  /**
   * Checks an upload arrived and makes it ready: a photo is re-encoded and
   * gets its small copy and blurred stand-in; a PDF is checked to be one,
   * and its pages counted. Again on something already ready, it answers the
   * same and does nothing.
   */
  async finish(
    userId: string,
    attachmentId: string,
  ): Promise<{ conversationId: string | null; messageId: string | null; attachment: ChatAttachment }> {
    const row = await this.db.queryOne<AttachmentRow>(
      `select ${ROW_COLUMNS} from message_attachments where id = $1 and user_id = $2`,
      [attachmentId, userId],
    );
    if (!row) throw new NotFoundException("That can't be sent any more. Pick it again.");
    if (row.status === 'failed') {
      throw new BadRequestException("That didn't arrive. Send it again.");
    }
    if (row.status === 'ready') return this.answer(row);

    const head = await this.storage.headServerObject(row.key);
    if (!head) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'NOT_UPLOADED',
        message: "It hasn't finished uploading yet.",
      });
    }
    const max =
      row.kind === 'photo'
        ? MAX_CHAT_PHOTO_BYTES
        : row.kind === 'voice'
          ? MAX_CHAT_VOICE_BYTES
          : MAX_CHAT_FILE_BYTES;
    if (head.size > max) {
      await this.fail(row, 'too large');
      throw new BadRequestException(
        row.kind === 'photo'
          ? 'A photo has to be under 15 MB.'
          : row.kind === 'voice'
            ? 'A voice note can be up to 2 minutes long.'
            : 'A file has to be a PDF under 20 MB.',
      );
    }

    const ready =
      row.kind === 'photo'
        ? await this.readyPhoto(row)
        : row.kind === 'voice'
          ? await this.readyVoice(row)
          : await this.readyFile(row, head.size);
    if (!ready) {
      await this.fail(row, 'unreadable');
      throw new BadRequestException(
        row.kind === 'photo'
          ? "That photo couldn't be read. Try a different one."
          : row.kind === 'voice'
            ? "That voice note couldn't be played. Record it again."
            : "That file isn't a PDF that can be opened.",
      );
    }
    const updated = await this.db.queryOne<AttachmentRow>(
      `update message_attachments
          set status = 'ready', ready_at = now(), size_bytes = $2, thumb_key = $3, blur = $4,
              width_px = $5, height_px = $6, pages = $7, name = $8, content_type = $9,
              duration_ms = coalesce($10, duration_ms), waveform = $11::smallint[]
        where id = $1 and status = 'uploading'
        returning ${ROW_COLUMNS}`,
      [
        row.id,
        ready.size,
        ready.thumbKey,
        ready.blur,
        ready.width,
        ready.height,
        ready.pages,
        ready.name,
        ready.contentType,
        ready.durationMs,
        ready.waveform,
      ],
    );
    // Two finishes at once: the other one wrote it, and this one's copies
    // are the same bytes under the same keys.
    const final =
      updated ??
      (await this.db.queryOne<AttachmentRow>(
        `select ${ROW_COLUMNS} from message_attachments where id = $1`,
        [row.id],
      ));
    if (!final) throw new NotFoundException("That can't be sent any more. Pick it again.");
    return this.answer(final);
  }

  private async answer(row: AttachmentRow) {
    const [attachment] = await this.present([row]);
    return { conversationId: row.conversation_id, messageId: row.message_id, attachment };
  }

  private kindOf(contentType: string): ChatAttachmentKind {
    if ((CHAT_PHOTO_TYPES as readonly string[]).includes(contentType)) return 'photo';
    if ((CHAT_FILE_TYPES as readonly string[]).includes(contentType)) return 'file';
    if ((CHAT_VOICE_TYPES as readonly string[]).includes(contentType)) return 'voice';
    throw new BadRequestException('Send photos (JPEG, PNG or WebP), a PDF, or a voice note.');
  }

  /**
   * The photo at most 2,048 px as a WebP, written back over the upload, and
   * its 640 px copy beside it. Null when it can't be decoded.
   */
  private async readyPhoto(row: AttachmentRow) {
    return decodes.run(async () => {
      try {
        const source = await this.readAll(row.key);
        const photo = await sharp(source, { failOn: 'none', limitInputPixels: MAX_PIXELS })
          .rotate()
          .resize(PHOTO_EDGE, PHOTO_EDGE, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: PHOTO_QUALITY })
          .toBuffer({ resolveWithObject: true });
        const thumb = await sharp(photo.data)
          .resize(THUMB_EDGE, THUMB_EDGE, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: THUMB_QUALITY })
          .toBuffer();
        const thumbKey = thumbKeyFor(row.key);
        // Always written back, even when larger: the re-encode is what drops
        // the camera's EXIF and GPS.
        await this.storage.putDerived(row.key, photo.data, WEBP);
        await this.storage.putDerived(thumbKey, thumb, WEBP);
        return {
          size: photo.data.length,
          thumbKey,
          blur: await blurDataUrl(thumb),
          width: photo.info.width,
          height: photo.info.height,
          pages: null,
          name: photoName(row.name),
          contentType: WEBP,
          durationMs: null,
          waveform: null,
        };
      } catch (err) {
        this.logger.warn(`Chat photo could not be made ready: ${String(err).slice(0, 160)}`);
        return null;
      }
    });
  }

  /** A PDF is checked to be one, and its pages counted. Null when it isn't. */
  private async readyFile(row: AttachmentRow, size: number) {
    try {
      const bytes = await this.readAll(row.key);
      if (bytes.subarray(0, 1024).indexOf('%PDF-') < 0) return null;
      return {
        size,
        thumbKey: null,
        blur: null,
        width: null,
        height: null,
        pages: countPdfPages(bytes),
        name: row.name,
        contentType: row.content_type,
        durationMs: null,
        waveform: null,
      };
    } catch (err) {
      this.logger.warn(`Chat file could not be checked: ${String(err).slice(0, 160)}`);
      return null;
    }
  }

  /**
   * A voice note re-encoded as AAC in an .m4a, written back over the upload,
   * and measured: how long it is, and its waveform. Null when ffmpeg can't
   * read it, or it is too short or too long to be one.
   */
  private async readyVoice(row: AttachmentRow) {
    return decodes.run(async () => {
      try {
        const note = await encodeVoiceNote(await this.readAll(row.key));
        if (!note) return null;
        // Always written back: the re-encode is what makes a browser's Opus
        // play on an iPhone, and what drops whatever the recorder tagged it with.
        await this.storage.putDerived(row.key, note.audio, VOICE_CONTENT_TYPE);
        return {
          size: note.audio.length,
          thumbKey: null,
          blur: null,
          width: null,
          height: null,
          pages: null,
          name: VOICE_NAME,
          contentType: VOICE_CONTENT_TYPE,
          durationMs: note.durationMs,
          waveform: note.waveform,
        };
      } catch (err) {
        this.logger.warn(`Chat voice note could not be made ready: ${String(err).slice(0, 160)}`);
        return null;
      }
    });
  }

  /** Marks an upload that will never be ready, and removes what arrived. */
  private async fail(row: AttachmentRow, why: string): Promise<void> {
    this.logger.warn(`Chat ${row.kind} ${row.id} failed: ${why}`);
    await this.storage.deleteServerObjects(
      [row.key, row.thumb_key].filter((k): k is string => !!k),
      'chat file failed',
    );
    await this.db.query(
      `update message_attachments set status = 'failed', size_bytes = 0 where id = $1`,
      [row.id],
    );
  }

  private async readAll(key: string): Promise<Buffer> {
    const stream = await this.storage.readStream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    }
    return Buffer.concat(chunks);
  }

  /** Rows as the apps get them, with links signed for half a day. */
  private async present(rows: AttachmentRow[]): Promise<ChatAttachment[]> {
    const live = rows.map((r) => r.status === 'ready' && this.storage.configured);
    const [urls, thumbs] = await Promise.all([
      this.storage.mediaUrls(
        rows.map((r, i) => (live[i] ? r.key : null)),
        DISPLAY_URL_TTL_SECONDS,
      ),
      this.storage.mediaUrls(
        rows.map((r, i) => (live[i] ? r.thumb_key : null)),
        DISPLAY_URL_TTL_SECONDS,
      ),
    ]);
    return rows.map((r, i) => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      name: r.name,
      contentType: r.content_type,
      sizeBytes: Number(r.size_bytes),
      width: r.width_px,
      height: r.height_px,
      pages: r.pages,
      durationMs: r.duration_ms,
      waveform: r.waveform,
      blur: r.blur,
      thumbUrl: thumbs[i],
      url: urls[i],
    }));
  }

  /** Each message's attachments, in order. */
  async forMessages(messageIds: readonly string[]): Promise<Map<string, ChatAttachment[]>> {
    const byMessage = new Map<string, ChatAttachment[]>();
    if (messageIds.length === 0) return byMessage;
    const rows = await this.db.query<AttachmentRow>(
      `select ${ROW_COLUMNS} from message_attachments
        where message_id = any($1::uuid[])
        order by message_id, position`,
      [messageIds],
    );
    const presented = await this.present(rows);
    rows.forEach((r, i) => {
      const list = byMessage.get(r.message_id!) ?? [];
      list.push(presented[i]);
      byMessage.set(r.message_id!, list);
    });
    return byMessage;
  }

  /**
   * One attachment on a message the caller may see (the caller checks that),
   * for saving: an hour's link that downloads under its own name.
   */
  async downloadUrl(messageId: string, attachmentId: string): Promise<string> {
    const row = await this.readyOn(messageId, attachmentId);
    const url = await this.storage.mediaUrl(row.key, DOWNLOAD_URL_TTL_SECONDS, row.name);
    if (!url) throw new ServiceUnavailableException('That file can’t be opened right now.');
    return url;
  }

  private async readyOn(messageId: string, attachmentId: string): Promise<AttachmentRow> {
    const row = await this.db.queryOne<AttachmentRow>(
      `select ${ROW_COLUMNS} from message_attachments
        where id = $1 and message_id = $2`,
      [attachmentId, messageId],
    );
    if (!row) throw new NotFoundException('That photo or file is gone.');
    if (row.status !== 'ready') {
      throw new BadRequestException(
        row.status === 'failed' ? "That didn't arrive." : "That hasn't finished sending yet.",
      );
    }
    return row;
  }

  /**
   * Files a copy of a chat photo or PDF into one of the caller's albums, or
   * one they may add to, counted toward whoever the album bills, as an
   * upload there would be. The copy is made inside the store.
   */
  async toAlbum(
    userId: string,
    messageId: string,
    attachmentId: string,
    albumId: string,
  ): Promise<{ key: string }> {
    const row = await this.readyOn(messageId, attachmentId);
    const copied = await this.storage.importToAlbum(userId, {
      fromKey: row.key,
      albumId,
      contentType: row.content_type,
      sizeBytes: Number(row.size_bytes),
      name: row.name,
    });
    const failed = (err: unknown) =>
      this.logger.error(`Thumbnail for a chat photo filed to an album failed: ${String(err)}`);
    try {
      this.thumbs
        .generateOnce(copied.key, copied.contentType ?? row.content_type, copied.size)
        .catch(failed);
    } catch (err) {
      failed(err);
    }
    return { key: copied.key };
  }

  /**
   * The forwarder's own copies of a message's attachments, for another chat:
   * counted toward their storage, and theirs to unsend. Copied inside the
   * store, small copies too, so forwarding costs no upload. Returns the new
   * ids, ready and not yet on a message.
   */
  async copyForForward(
    userId: string,
    messageId: string,
    conversationId: string,
  ): Promise<string[]> {
    const rows = await this.db.query<AttachmentRow>(
      `select ${ROW_COLUMNS} from message_attachments
        where message_id = $1 order by position`,
      [messageId],
    );
    if (rows.length === 0) throw new BadRequestException('That photo or file is gone.');
    if (rows.some((r) => r.status !== 'ready')) {
      throw new BadRequestException('Wait for it to finish sending, then forward it.');
    }
    await this.quota.assertCanStore(
      userId,
      rows.reduce((sum, r) => sum + Number(r.size_bytes), 0),
    );
    const ids: string[] = [];
    for (const r of rows) {
      const key = mintKey(r.key.split('.').pop() ?? 'bin');
      await this.storage.copyServerObject(r.key, key);
      const thumbKey = r.thumb_key ? thumbKeyFor(key) : null;
      if (r.thumb_key && thumbKey) await this.storage.copyServerObject(r.thumb_key, thumbKey);
      const row = await this.db.queryOne<{ id: string }>(
        `insert into message_attachments
           (user_id, conversation_id, position, kind, status, key, thumb_key, blur, name,
            content_type, size_bytes, width_px, height_px, pages, duration_ms, waveform, ready_at)
         values ($1, $2, $3, $4, 'ready', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                 $15::smallint[], now())
         returning id`,
        [
          userId,
          conversationId,
          r.position,
          r.kind,
          key,
          thumbKey,
          r.blur,
          r.name,
          r.content_type,
          r.size_bytes,
          r.width_px,
          r.height_px,
          r.pages,
          r.duration_ms,
          r.waveform,
        ],
      );
      ids.push(row!.id);
    }
    return ids;
  }

  /**
   * Removes the files of messages just unsent, unless an open report holds
   * them: those wait for the report to close, and the sweep takes them then.
   */
  async removeForMessages(messageIds: readonly string[]): Promise<number> {
    if (messageIds.length === 0) return 0;
    const rows = await this.db.query<{ id: string; key: string; thumb_key: string | null }>(
      `select a.id, a.key, a.thumb_key from message_attachments a
        where a.message_id = any($1::uuid[]) and ${NOT_HELD('a')}`,
      [messageIds],
    );
    return this.removeRows(rows, 'chat unsend');
  }

  /** Deletes the objects, then the rows of those confirmed gone. */
  private async removeRows(
    rows: { id: string; key: string; thumb_key: string | null }[],
    context: string,
  ): Promise<number> {
    if (rows.length === 0) return 0;
    const keys = rows.flatMap((r) => [r.key, r.thumb_key]).filter((k): k is string => !!k);
    const gone = await this.storage.deleteServerObjects(keys, context);
    const ids = rows.filter((r) => gone.has(r.key)).map((r) => r.id);
    if (ids.length > 0) {
      await this.db.query('delete from message_attachments where id = any($1::uuid[])', [ids]);
    }
    return ids.length;
  }

  /**
   * What the caller's chat photos and files take up, by chat, largest first.
   * The apps name each chat from the conversation they already know.
   */
  async usage(userId: string): Promise<{
    bytes: number;
    files: number;
    chats: { conversationId: string; bytes: number; files: number }[];
  }> {
    const rows = await this.db.query<{ conversation_id: string | null; bytes: string; files: number }>(
      `select conversation_id, coalesce(sum(size_bytes), 0)::text as bytes, count(*)::int as files
         from message_attachments
        where user_id = $1 and status <> 'failed'
        group by conversation_id
        order by sum(size_bytes) desc`,
      [userId],
    );
    return {
      bytes: rows.reduce((sum, r) => sum + Number(r.bytes), 0),
      files: rows.reduce((sum, r) => sum + r.files, 0),
      chats: rows
        .filter((r) => r.conversation_id !== null)
        .map((r) => ({ conversationId: r.conversation_id!, bytes: Number(r.bytes), files: r.files })),
    };
  }

  /**
   * Everything left behind, an hour at a time:
   * - uploads signed and never sent, a day on;
   * - uploads sent and never finished, a day on: marked failed, so the
   *   thread can say so, and their objects removed;
   * - the files of unsent messages an open report held, once it closes;
   * - files nobody in the chat can see any more: everyone left, cleared the
   *   chat past it, or deleted it for themselves.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sweep(): Promise<number> {
    if (!this.storage.configured) return 0;
    try {
      let removed = 0;
      const unsent = await this.db.query<{ id: string; key: string; thumb_key: string | null }>(
        `select id, key, thumb_key from message_attachments
          where message_id is null and created_at < now() - interval '${STALE_HOURS} hours'
          order by created_at limit 500`,
      );
      removed += await this.removeRows(unsent, 'chat sweep (never sent)');

      const unfinished = await this.db.query<AttachmentRow>(
        `select ${ROW_COLUMNS} from message_attachments
          where status = 'uploading' and message_id is not null
            and created_at < now() - interval '${STALE_HOURS} hours'
          order by created_at limit 500`,
      );
      for (const row of unfinished) await this.fail(row, 'never finished');

      const unseen = await this.db.query<{ id: string; key: string; thumb_key: string | null }>(
        `select a.id, a.key, a.thumb_key
           from message_attachments a
           join messages m on m.id = a.message_id
          where (m.deleted_at is not null
                 or not exists (
                   select 1 from conversation_participants p
                    where p.conversation_id = m.conversation_id
                      and (p.cleared_at is null or p.cleared_at < m.created_at)
                      and not exists (select 1 from message_deletions d
                                       where d.message_id = m.id and d.user_id = p.user_id)))
            and ${NOT_HELD('a')}
          order by a.created_at limit 500`,
      );
      removed += await this.removeRows(unseen, 'chat sweep (unseen)');
      return removed + unfinished.length;
    } catch (err) {
      this.logger.error(`Chat file sweep failed: ${String(err)}`);
      return 0;
    }
  }

  /**
   * Every photo and file someone sent, deleted with their account. Throws
   * when any object stays, so the deletion stops before the account row goes
   * and can be tried again: the same rule as their library.
   */
  async eraseFor(userId: string): Promise<number> {
    const rows = await this.db.query<{ id: string; key: string; thumb_key: string | null }>(
      'select id, key, thumb_key from message_attachments where user_id = $1',
      [userId],
    );
    const removed = await this.removeRows(rows, 'account deletion (chat files)');
    if (removed < rows.length) {
      throw new Error(`${rows.length - removed} chat file(s) could not be deleted`);
    }
    return removed;
  }
}
