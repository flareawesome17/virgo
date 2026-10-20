/**
 * Before a batch goes up, which of its files the album already holds.
 *
 * A large drop that half-failed on a bad connection used to be sent again
 * whole, and every file that had arrived the first time was stored a second
 * time, billed twice. The API now answers which files of a batch match one
 * already in the album (POST /storage/uploads/check; api/src/storage/
 * upload-dedup.ts has how it decides), and this turns that answer into three
 * piles:
 *
 *   - `upload`: new, or the check could not be asked. Sent as always.
 *   - `duplicates`: same name, size and modified time as a file in the album.
 *     Skipped by default, with a way to upload them anyway.
 *   - `possible`: same name and size, but nothing to confirm it is the same
 *     file — a camera's counter resets, and the phone cannot say when a file
 *     was modified. Never skipped without asking.
 *
 * **It never stands in the way of an upload.** A check that fails, times out
 * or answers something unreadable leaves the files in `upload`, which is what
 * happened before it existed. The worst it can do is let a duplicate through.
 *
 * Shared, byte for byte, by web and mobile (scripts/check-client-sync.mjs),
 * and import-free so `node --experimental-strip-types --test` can load it
 * (upload-dedup.test.mjs). Keep it that way.
 */

/** Files per request. Mirrors UPLOAD_CHECK_MAX_FILES in api/src/storage/upload-dedup.ts. */
export const UPLOAD_CHECK_MAX_FILES = 500;

/**
 * How long one request may take before the batch goes up unchecked.
 *
 * The check is one indexed query and answers in milliseconds; a request that
 * has not come back in this long is on a connection where waiting longer
 * only delays the upload it was meant to help.
 */
export const UPLOAD_CHECK_TIMEOUT_MS = 8_000;

export interface UploadCheckFile {
  name: string;
  size: number;
  /** Epoch ms, when the platform knows it. The phone does not. */
  lastModified?: number;
}

export type UploadCheckMatch =
  | { index: number; match: 'exact' }
  | { index: number; match: 'possible'; reason?: 'unverified' | 'different-date' };

export interface UploadPlan<T> {
  upload: T[];
  duplicates: T[];
  possible: T[];
  /** False when any part of the batch went unchecked. */
  checked: boolean;
}

/** One request's worth of matches, keeping only those that make sense for it. */
function matchesFrom(answer: unknown, count: number): UploadCheckMatch[] {
  const list = (answer as { matches?: unknown } | null)?.matches;
  if (!Array.isArray(list)) return [];
  return list.filter((entry): entry is UploadCheckMatch => {
    const m = entry as { index?: unknown; match?: unknown } | null;
    return (
      !!m &&
      typeof m.index === 'number' &&
      Number.isInteger(m.index) &&
      m.index >= 0 &&
      m.index < count &&
      (m.match === 'exact' || m.match === 'possible')
    );
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Upload check timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Sorts a batch into what to send, what to skip, and what to ask about.
 *
 * Asks in pieces of UPLOAD_CHECK_MAX_FILES, one after another. The first
 * piece that fails ends the asking: on a dead connection every piece would
 * wait out its own timeout, holding the upload for minutes. What earlier
 * pieces found still counts; everything after goes up unchecked.
 */
export async function planUploads<T>(
  items: readonly T[],
  describe: (item: T) => UploadCheckFile,
  check: (files: UploadCheckFile[]) => Promise<unknown>,
  { timeoutMs = UPLOAD_CHECK_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<UploadPlan<T>> {
  const plan: UploadPlan<T> = { upload: [], duplicates: [], possible: [], checked: true };

  for (let start = 0; start < items.length; start += UPLOAD_CHECK_MAX_FILES) {
    const piece = items.slice(start, start + UPLOAD_CHECK_MAX_FILES);
    if (!plan.checked) {
      plan.upload.push(...piece);
      continue;
    }

    let matches: UploadCheckMatch[];
    try {
      matches = matchesFrom(await withTimeout(check(piece.map(describe)), timeoutMs), piece.length);
    } catch {
      plan.checked = false;
      plan.upload.push(...piece);
      continue;
    }

    const found = new Map(matches.map((m) => [m.index, m.match]));
    piece.forEach((item, i) => {
      const match = found.get(i);
      if (match === 'exact') plan.duplicates.push(item);
      else if (match === 'possible') plan.possible.push(item);
      else plan.upload.push(item);
    });
  }

  return plan;
}

/**
 * Whether a request was refused for carrying `field`, by an API from before
 * the field existed.
 *
 * The API refuses any key it does not know with a 400 ("property x should not
 * exist"). A client newer than the API it talks to — a rollback, or a tab
 * opened before a deploy was reverted — has to recognise that and send again
 * without the field. For confirm's `lastModified` the alternative is every
 * upload failing at the very end, with its bytes already stored.
 */
export function refusesField(error: unknown, field: string): boolean {
  const e = error as { status?: unknown; body?: unknown; message?: unknown } | null;
  if (!e || typeof e !== 'object' || e.status !== 400) return false;
  try {
    return JSON.stringify(e.body ?? e.message ?? '').includes(`${field} should not exist`);
  } catch {
    return false;
  }
}

const files = (count: number) => `${count.toLocaleString('en-US')} file${count === 1 ? '' : 's'}`;

/** "37 files already uploaded, skipped". */
export function skippedSummary(count: number): string {
  return `${files(count)} already uploaded, skipped`;
}

/** The question about possible duplicates, as a title. */
export function possibleDuplicatesTitle(count: number): string {
  return `${files(count)} might already be uploaded`;
}

/** The question about possible duplicates, in full. Says what is known, and no more. */
export function possibleDuplicatesMessage(count: number, albumName?: string | null): string {
  const album = albumName?.trim() || 'This album';
  return count === 1
    ? `${album} already has a file with the same name and size, but Virgo can't confirm it's the same file. Skip it, or upload it anyway?`
    : `${album} already has files with the same names and sizes, but Virgo can't confirm they're the same files. Skip them, or upload them anyway?`;
}
