/**
 * Telling a re-uploaded file from a new one, without reading either.
 *
 * A large drop that half-fails on a bad connection is sent again whole, and
 * every file that arrived the first time used to be stored a second time
 * under a new key. Before a batch starts the client now asks which of its
 * files the album already holds (POST /storage/uploads/check).
 *
 * What can be compared is what both sides have for free:
 *
 *   - the file's name, compared case-insensitively, as confirm stored it;
 *   - its size in bytes, which B2 reported on confirm;
 *   - the file's own modified time, which a browser has on every File and
 *     confirm now records (`source_modified_at`, migration 098).
 *
 * Name and size are not proof. A camera's counter resets — every card starts
 * at IMG_0001 again — and an uncompressed raw format is the same size every
 * frame, so two different photographs can share both. A match is therefore
 * only called `exact` when the modified time agrees as well; a name-and-size
 * match without that is `possible`, and the person decides. Nothing unsure is
 * skipped behind their back.
 *
 * A content hash would settle it, and was ruled out: the client would have to
 * read every byte of every file before sending any (gigabytes for a wedding),
 * and the phone has no way to hash a file without a native module. The ETag
 * B2 reports is stored as well, for the duplicate report and for later, but
 * no client can produce one to compare.
 */

/**
 * How far apart two modified times may be and still be the same file.
 *
 * FAT and exFAT, which every camera card is, keep modified times to two
 * seconds, so a file copied off the card twice can differ by that much.
 */
export const SAME_FILE_TOLERANCE_MS = 2_000;

/** The most files one check may ask about. A drop larger than that asks in pieces. */
export const UPLOAD_CHECK_MAX_FILES = 500;

/** Earliest modified time taken as real: no device file predates 1980. */
const EARLIEST_MODIFIED_MS = Date.UTC(1980, 0, 1);

/** How far ahead of the server a device clock may be and still be believed. */
const CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

export type UploadMatch =
  | { index: number; match: 'exact' }
  | {
      index: number;
      match: 'possible';
      /**
       * `unverified`: one side has no modified time to compare — an upload
       * from before they were recorded, or from the phone, which cannot say.
       * `different-date`: both do, and they differ. Most likely a different
       * file of the same name and size; possibly the same one copied in a way
       * that did not keep its time.
       */
      reason: 'unverified' | 'different-date';
    };

/** A stored file with the same name and size as batch file `index`. */
export interface UploadCandidate {
  index: number;
  sourceModifiedMs: number | null;
}

/**
 * Which files of a batch are already in the album, in batch order.
 *
 * Files with no candidate are left out of the answer: it lists matches, and
 * everything not listed is new.
 */
export function classifyUploadMatches(
  files: readonly { lastModified?: number | null }[],
  candidates: readonly UploadCandidate[],
): UploadMatch[] {
  const byIndex = new Map<number, UploadCandidate[]>();
  for (const candidate of candidates) {
    if (!Number.isInteger(candidate.index) || candidate.index < 0) continue;
    if (candidate.index >= files.length) continue;
    byIndex.set(candidate.index, [...(byIndex.get(candidate.index) ?? []), candidate]);
  }

  const matches: UploadMatch[] = [];
  for (const index of [...byIndex.keys()].sort((a, b) => a - b)) {
    const mine = files[index].lastModified;
    const stored = byIndex.get(index) ?? [];
    const known = typeof mine === 'number' && Number.isFinite(mine);
    const dated = stored.filter((c) => c.sourceModifiedMs !== null);

    if (known && dated.some((c) => Math.abs((c.sourceModifiedMs as number) - mine) <= SAME_FILE_TOLERANCE_MS)) {
      matches.push({ index, match: 'exact' });
    } else if (known && dated.length === stored.length) {
      // Every stored copy has a time, and none agrees.
      matches.push({ index, match: 'possible', reason: 'different-date' });
    } else {
      matches.push({ index, match: 'possible', reason: 'unverified' });
    }
  }
  return matches;
}

/**
 * A device-reported modified time as something worth storing, or null.
 *
 * The client says it, so it is held to what a file could plausibly carry: a
 * whole number of milliseconds, no earlier than 1980, no later than a day past
 * the server's clock. Anything else is treated as not known, which can only
 * make a later match less certain, never more.
 */
export function sourceModifiedAt(value: unknown, now = Date.now()): Date | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < EARLIEST_MODIFIED_MS || value > now + CLOCK_SKEW_MS) return null;
  return new Date(value);
}

/** The ETag from a HEAD without the quotes S3 wraps it in, or null. */
export function normaliseEtag(value: string | undefined | null): string | null {
  if (!value) return null;
  const bare = value.replace(/^W\//, '').replace(/^"+|"+$/g, '').trim();
  return bare && bare.length <= 128 ? bare : null;
}
