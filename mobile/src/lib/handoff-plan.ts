/**
 * Background uploads, the rules (docs/BACKGROUND_UPLOADS.md).
 *
 * With the native module (VirgoUploads) a file is not sent by JavaScript at
 * all: the server mints every URL it needs, the phone hands those to iOS or
 * Android as "items" (one per PUT: the whole file, or one part of it), and
 * from then on JavaScript only hears how they went. This turns tickets into
 * items and items' news back into a file's standing.
 *
 * Imports nothing, so `node --experimental-strip-types --test` can load it
 * (handoff-plan.test.mjs). Keep it that way.
 */

/** What POST /storage/handoffs returns for one file. */
export interface HandoffTicket {
  key: string;
  contentType: string;
  size: number;
  expiresAt: string;
  single?: { uploadUrl: string; requiredHeaders: Record<string, string> };
  multipart?: {
    uploadId: string;
    partSize: number;
    partCount: number;
    parts: { partNumber: number; uploadUrl: string; requiredHeaders: Record<string, string> }[];
  };
}

/** One PUT handed to the system. Mirrors the native modules' record. */
export interface NativeItem {
  id: string;
  url: string;
  headers: Record<string, string>;
  /** A file:// URI. */
  file: string;
  offset?: number;
  length?: number;
}

/** How the system says one item ended. */
export interface ItemResult {
  id: string;
  /** HTTP status, or 0 when there was no answer. */
  status: number;
  error?: string;
}

/** Separates a part's item id from its file's task id. */
const PART = '#';

/**
 * The signed headers, minus Content-Length: every native uploader sets that
 * itself from what it sends, and given twice a signed PUT can hang (see
 * storage.ts).
 */
export function withoutContentLength(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => name.toLowerCase() !== 'content-length'),
  );
}

/** The items for one file: itself, or each of its parts as a byte range. */
export function itemsForTicket(taskId: string, uri: string, ticket: HandoffTicket): NativeItem[] {
  if (ticket.single) {
    return [
      {
        id: taskId,
        url: ticket.single.uploadUrl,
        headers: withoutContentLength(ticket.single.requiredHeaders),
        file: uri,
      },
    ];
  }
  const multipart = ticket.multipart;
  if (!multipart) return [];
  return multipart.parts.map((part) => {
    const offset = (part.partNumber - 1) * multipart.partSize;
    return {
      id: `${taskId}${PART}${part.partNumber}`,
      url: part.uploadUrl,
      headers: withoutContentLength(part.requiredHeaders),
      file: uri,
      offset,
      length: Math.min(multipart.partSize, ticket.size - offset),
    };
  });
}

/** The file an item belongs to. */
export function taskIdOf(itemId: string): string {
  const at = itemId.indexOf(PART);
  return at < 0 ? itemId : itemId.slice(0, at);
}

export function isSent(result: ItemResult): boolean {
  return result.status >= 200 && result.status < 300;
}

/**
 * Where a handed-over file stands, from what its items reported so far:
 * every item sent, one item failed (the first, by the order given), or
 * still going.
 */
export function handoffStanding(
  items: readonly string[],
  results: ReadonlyMap<string, ItemResult>,
): { state: 'sending' } | { state: 'sent' } | { state: 'failed'; result: ItemResult } {
  let sent = 0;
  for (const id of items) {
    const result = results.get(id);
    if (!result) continue;
    if (!isSent(result)) return { state: 'failed', result };
    sent += 1;
  }
  return items.length > 0 && sent === items.length ? { state: 'sent' } : { state: 'sending' };
}

/**
 * How much of a file is on its way, 0–1: the bytes its items have sent, with
 * an item that finished counted whole.
 */
export function fractionSent(
  items: readonly NativeItem[] | readonly { id: string; length?: number }[],
  size: number,
  sent: ReadonlyMap<string, number>,
  done: ReadonlyMap<string, ItemResult>,
): number {
  if (size <= 0) return 0;
  let bytes = 0;
  for (const item of items) {
    const whole = item.length ?? size;
    const result = done.get(item.id);
    bytes += result && isSent(result) ? whole : Math.min(sent.get(item.id) ?? 0, whole);
  }
  return Math.min(bytes / size, 1);
}

/**
 * The next request's worth: up to `max` files, all for one album (a handoff
 * request is for one album), the album of the first file waiting.
 */
export function nextHandoffBatch<T extends { albumId: string }>(waiting: readonly T[], max: number): T[] {
  const first = waiting[0];
  if (!first) return [];
  return waiting.filter((task) => task.albumId === first.albumId).slice(0, max);
}

/**
 * Whether a failed item is worth handing over again, afresh: no answer, an
 * expired or refused signature, or the system cancelling it (the app was
 * swiped away). Anything else is the server or the file saying no.
 */
export function isWorthAnotherHandoff(result: ItemResult): boolean {
  return result.status === 0 || result.status === 403 || result.status === 408 || result.status === 429 || result.status >= 500;
}
