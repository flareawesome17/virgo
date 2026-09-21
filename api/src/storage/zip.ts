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

  for (const file of files) {
    try {
      archive.append(await open(file.key), { name: file.name });
    } catch (err) {
      // One unreadable object should not cost them the other 199.
      logger.warn(`Skipped ${file.key} in zip: ${String(err)}`);
    }
  }

  await archive.finalize();
}
