import { ZipArchive } from 'archiver';
import type { Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Readable, type Writable } from 'node:stream';
import { contentDisposition } from './download-names';

export interface ZipOptions {
  /** How often to try one object before it counts as unreadable. */
  retry?: { attempts: number; delayMs: number };
  /** Told how many entries are fully written, after each one. */
  onProgress?: (done: number) => void;
  /**
   * Opens an object from a byte offset, so a read that breaks part way
   * carries on from where it stopped instead of costing the zip. Without it a
   * broken read ends the zip at once.
   */
  reopen?: (key: string, from: number) => Promise<Readable>;
}

const DEFAULT_RETRY = { attempts: 3, delayMs: 1500 };

/**
 * Streams `files` to `res` as one zip.
 *
 * Streamed, never assembled. A wedding delivery is routinely several
 * gigabytes; building that in memory or on disk first would hold the whole
 * album in the container for the length of the download and fall over on the
 * second person who clicked at the same time. Objects are pulled from storage
 * one at a time and piped straight out, so memory stays flat regardless of
 * size.
 *
 * Stored, not deflated. JPEG, H.264 and AAC are already compressed — deflate
 * would spend real CPU per byte to save approximately none.
 *
 * No Content-Length is possible for a stream like this, so the browser shows
 * an indeterminate progress bar. That is the accepted cost of not buffering.
 *
 * Shared by the client link's "Download all", the client's picks and the
 * app's "Download selected", which were one copy of this away from drifting.
 */
export async function streamZip(
  res: Response,
  zipName: string,
  files: readonly { key: string; name: string }[],
  open: (key: string) => Promise<Readable>,
  logger: Logger,
  options: ZipOptions = {},
): Promise<void> {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', contentDisposition(zipName));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  // Send the headers now. Cloudflare answers 524 when the origin sends no
  // byte within 100 s; if storage is unreachable every open() waits out its
  // own timeout first, and the client would see that as a dead page.
  res.flushHeaders();
  await zipInto(res, zipName, files, open, logger, options);
}

/**
 * The zip itself, written to any writable: a response (streamed live) or a
 * file on disk (built ahead so the client can resume). Resolves once every
 * entry has been handed to the archive; the caller waits for `out` to finish.
 * Returns how many entries had to be skipped as unreadable.
 */
export async function zipInto(
  out: Writable,
  zipName: string,
  files: readonly { key: string; name: string }[],
  open: (key: string) => Promise<Readable>,
  logger: Logger,
  { retry = DEFAULT_RETRY, onProgress, reopen }: ZipOptions = {},
): Promise<number> {
  // archiver v8 dropped the callable default in favour of the classes.
  const archive = new ZipArchive({ store: true });

  // Every stream opened for this zip and not finished yet. Each one holds a
  // connection to storage, so a zip that ends early closes them all rather
  // than leaving them open behind it.
  const live = new Set<Readable>();

  // Entries the archive has finished writing. archiver's append() only
  // queues the entry and returns at once, so this is the only way to know
  // how far the writing has got.
  let written = 0;
  let wake: (() => void) | undefined;
  const nudge = () => {
    const w = wake;
    wake = undefined;
    w?.();
  };
  const writtenAtLeast = async (n: number) => {
    while (written < n && !out.destroyed) await new Promise<void>((r) => (wake = r));
  };
  archive.on('entry', () => {
    written += 1;
    onProgress?.(written);
    nudge();
  });

  // A failure mid-stream cannot become a 500: headers are long gone and the
  // client is already receiving zip bytes. Destroying the socket is what makes
  // their download fail visibly as a truncated file rather than completing as
  // a silently incomplete one.
  archive.on('error', (err: Error) => {
    logger.error(`Zip "${zipName}" failed: ${err.message}`);
    out.destroy(err);
  });
  // Someone who cancels mid-download leaves us pulling the rest from storage
  // for nobody.
  out.on('close', () => {
    if (!out.writableEnded) archive.abort();
    for (const s of live) s.destroy();
    live.clear();
    nudge();
  });

  archive.pipe(out);

  // One slow handshake to storage is routine on this link and should cost a
  // second or two, not the file: try again before it counts as a failure.
  const openWithRetry = async (key: string): Promise<Readable> => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await open(key);
      } catch (err) {
        if (attempt >= retry.attempts || out.destroyed) throw err;
        logger.warn(`Open ${key} failed (try ${attempt}/${retry.attempts}): ${String(err)}`);
        await new Promise((r) => setTimeout(r, retry.delayMs * attempt));
      }
    }
  };

  /**
   * One entry's bytes. A read that breaks part way (storage resets a
   * connection, often one that sat waiting its turn) is picked up from the
   * byte it reached. Tries are counted per stretch without progress, so a
   * long film that breaks twice an hour apart is not given up on.
   */
  async function* bytesOf(key: string, first: Readable): AsyncGenerator<Buffer> {
    let source: Readable | undefined = first;
    let sent = 0;
    let failures = 0;
    let failedAt = -1;
    for (;;) {
      try {
        if (!source) {
          source = await reopen!(key, sent);
          live.add(source);
          if (out.destroyed) return;
        }
        for await (const chunk of source) {
          sent += (chunk as Buffer).length;
          yield chunk as Buffer;
        }
        return;
      } catch (err) {
        failures = sent > failedAt ? 1 : failures + 1;
        failedAt = sent;
        if (!reopen || failures >= retry.attempts || out.destroyed) throw err;
        logger.warn(
          `Read of ${key} broke at ${sent} bytes (try ${failures}/${retry.attempts}): ${String(err)}`,
        );
        await new Promise((r) => setTimeout(r, retry.delayMs * failures));
      } finally {
        if (source) {
          source.destroy();
          live.delete(source);
        }
        source = undefined;
      }
    }
  }

  // archiver never hears that an entry's stream failed: it pipes the stream,
  // and a pipe does not pass errors on, so it would wait for the rest of that
  // file for ever while the build looks merely slow. End the zip instead, at
  // once, as a storage failure.
  const entryFor = (key: string, source: Readable): Readable => {
    const entry = Readable.from(bytesOf(key, source), { objectMode: false });
    live.add(entry);
    entry.on('close', () => live.delete(entry));
    entry.on('error', (err) => {
      if (out.destroyed) return;
      logger.error(`Zip "${zipName}" aborted: ${key} could not be read: ${String(err)}`);
      archive.abort();
      out.destroy(new Error(`Storage unavailable: ${key} could not be read`));
    });
    return entry;
  };

  // A storage outage fails every file. Skipping each one silently would hand
  // the client a near-empty zip that looks complete, so give up instead.
  const MAX_CONSECUTIVE_FAILURES = 3;
  let failures = 0;
  let skipped = 0;
  let appended = 0;

  // Opening an object from storage costs a round trip to another continent
  // before the first byte, so the next file is asked for while the current one
  // is still being sent. One ahead and no more: an opened stream nobody is
  // reading holds a connection, and the longer it waits the likelier storage
  // is to drop it.
  const opening = new Map<number, Promise<Readable>>();
  const start = (i: number) => {
    if (i >= files.length || opening.has(i) || out.destroyed) return;
    const p = openWithRetry(files[i].key).then((s) => {
      // The zip ended while this was opening; nobody will read it.
      if (out.destroyed) {
        s.destroy();
        throw new Error('Zip ended');
      }
      live.add(s);
      return s;
    });
    // A rejection nobody has awaited yet must not become an unhandled one.
    p.catch(() => undefined);
    opening.set(i, p);
  };
  start(0);

  for (let i = 0; i < files.length && !out.destroyed; i++) {
    const file = files[i];
    let source: Readable;
    try {
      source = await opening.get(i)!;
    } catch (err) {
      opening.delete(i);
      if (out.destroyed) break;
      // One unreadable object should not cost them the other 199.
      logger.warn(`Skipped ${file.key} in zip: ${String(err)}`);
      skipped++;
      if (++failures >= MAX_CONSECUTIVE_FAILURES) {
        logger.error(
          `Zip "${zipName}" aborted: storage failed ${failures} files in a row`,
        );
        archive.abort();
        out.destroy(new Error('Storage unavailable'));
        return skipped;
      }
      start(i + 1);
      continue;
    }
    opening.delete(i);
    failures = 0;
    archive.append(entryFor(file.key, source), { name: file.name });
    appended += 1;
    // Wait until the entry before this one is written: this one is then
    // being sent, and the next is the only one waiting.
    await writtenAtLeast(appended - 1);
    start(i + 1);
  }

  if (out.destroyed) return skipped;
  await archive.finalize();
  return skipped;
}
