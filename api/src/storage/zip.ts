import { ZipArchive } from 'archiver';
import type { Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { Readable } from 'node:stream';
import { contentDisposition } from './download-names';

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
): Promise<void> {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', contentDisposition(zipName));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  // archiver v8 dropped the callable default in favour of the classes.
  const archive = new ZipArchive({ store: true });

  // A failure mid-stream cannot become a 500: headers are long gone and the
  // client is already receiving zip bytes. Destroying the socket is what makes
  // their download fail visibly as a truncated file rather than completing as
  // a silently incomplete one.
  archive.on('error', (err: Error) => {
    logger.error(`Zip "${zipName}" failed: ${err.message}`);
    res.destroy(err);
  });
  // Someone who cancels mid-download leaves us pulling the rest from storage
  // for nobody.
  res.on('close', () => {
    if (!res.writableEnded) archive.abort();
  });

  archive.pipe(res);

  // Send the headers now. Cloudflare answers 524 when the origin sends no
  // byte within 100 s; if storage is unreachable every open() below waits out
  // its own timeout first, and the client would see that as a dead page.
  res.flushHeaders();

  // A storage outage fails every file. Skipping each one silently would hand
  // the client a near-empty zip that looks complete, so give up instead.
  const MAX_CONSECUTIVE_FAILURES = 3;
  let failures = 0;

  // Opening an object from storage costs a round trip to another continent
  // before the first byte, and doing it strictly after the previous file ends
  // left the link idle between every pair — most of the time for an album of
  // small photographs. Ask for the next one while this one is still sending.
  // One ahead only: an opened stream nobody is reading holds a connection.
  const opening = new Map<number, Promise<Readable>>();
  const start = (i: number) => {
    if (i >= files.length || opening.has(i)) return;
    const p = open(files[i].key);
    // A rejection nobody has awaited yet must not become an unhandled one.
    p.catch(() => undefined);
    opening.set(i, p);
  };
  start(0);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    start(i + 1);
    try {
      archive.append(await opening.get(i)!, { name: file.name });
      opening.delete(i);
      failures = 0;
    } catch (err) {
      opening.delete(i);
      // One unreadable object should not cost them the other 199.
      logger.warn(`Skipped ${file.key} in zip: ${String(err)}`);
      if (++failures >= MAX_CONSECUTIVE_FAILURES) {
        logger.error(
          `Zip "${zipName}" aborted: storage failed ${failures} files in a row`,
        );
        archive.abort();
        res.destroy(new Error('Storage unavailable'));
        // The file already opened ahead will never be read.
        for (const p of opening.values()) {
          p.then((s) => s.destroy()).catch(() => undefined);
        }
        return;
      }
    }
  }

  await archive.finalize();
}
