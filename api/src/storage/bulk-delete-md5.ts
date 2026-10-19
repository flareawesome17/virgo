import { createHash } from 'node:crypto';
import type { S3Client } from '@aws-sdk/client-s3';

/**
 * Makes DeleteObjects acceptable to Backblaze again: a Content-MD5 of the
 * body, and none of the SDK's own checksum headers.
 *
 * Since its 2025 data-integrity change the SDK sends DeleteObjects with a
 * CRC32 checksum and no Content-MD5, whatever requestChecksumCalculation says,
 * and B2 refuses that request whole. Every delete then fell back to removing
 * objects one at a time — about two requests per file — and a selection of a
 * hundred photos ran past the app's timeout while the server was still
 * working through it.
 *
 * Runs late in the build step, after the SDK has written its checksum and
 * before the request is signed, so the header it adds is signed with the rest.
 * Only DeleteObjects is touched: every other call is accepted as it is.
 */
export function sendContentMd5OnBulkDelete(client: S3Client): void {
  client.middlewareStack.add(
    (next, context) => async (args) => {
      const request = args.request as
        | { headers?: Record<string, string>; body?: unknown }
        | undefined;
      const body = request?.body;
      if (
        context.commandName === 'DeleteObjectsCommand' &&
        request?.headers &&
        (typeof body === 'string' || body instanceof Uint8Array)
      ) {
        for (const name of Object.keys(request.headers)) {
          const lower = name.toLowerCase();
          if (
            lower.startsWith('x-amz-checksum-') ||
            lower === 'x-amz-sdk-checksum-algorithm' ||
            lower === 'content-md5'
          ) {
            delete request.headers[name];
          }
        }
        request.headers['content-md5'] = createHash('md5').update(body).digest('base64');
      }
      return next(args);
    },
    { step: 'build', priority: 'low', name: 'virgoBulkDeleteContentMd5' },
  );
}
