// Run: node --experimental-strip-types --test src/api/multipart-upload.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isRetryablePartError, UploadCancelled, uploadInParts } from './multipart-upload.ts';

const MB = 1024 * 1024;
const PART = 16 * MB;
const noWait = async () => {};

/** A fake of everything the browser and API would do, recording what happened. */
function fake({ failPart = {}, putDelay = 0, partCount, size } = {}) {
  const log = { start: [], partUrl: [], put: [], complete: [], abort: [] };
  let inFlight = 0;
  let maxInFlight = 0;
  const attempts = {};

  const deps = {
    async start(body) {
      log.start.push(body);
      return { key: 'users/u/albums/2026/10/x.mp4', uploadId: 'up-1', partSize: PART, partCount };
    },
    async partUrl(body) {
      log.partUrl.push(body);
      return { uploadUrl: `https://b2/part/${body.partNumber}`, requiredHeaders: {}, expiresAt: '' };
    },
    async putPart(blob, ticket, onLoaded, signal) {
      const n = Number(ticket.uploadUrl.split('/').pop());
      attempts[n] = (attempts[n] ?? 0) + 1;
      log.put.push({ n, size: blob.size, attempt: attempts[n] });
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        onLoaded(blob.size / 2);
        if (putDelay) {
          await new Promise((resolve, reject) => {
            const t = setTimeout(resolve, putDelay);
            signal?.addEventListener('abort', () => {
              clearTimeout(t);
              reject(Object.assign(new Error('aborted'), { status: 0 }));
            });
          });
        }
        const failure = failPart[n]?.(attempts[n]);
        if (failure) throw failure;
        onLoaded(blob.size);
        return `"etag-${n}"`;
      } finally {
        inFlight--;
      }
    },
    async complete(body) {
      log.complete.push(body);
      return { key: body.key, size: size ?? 0 };
    },
    async abort(body) {
      log.abort.push(body);
    },
  };
  return { deps, log, stats: () => ({ maxInFlight, attempts }) };
}

const file = (bytes) => new Blob([new Uint8Array(bytes)]);
const opts = (extra = {}) => ({
  contentType: 'video/mp4',
  scope: 'albums',
  backoff: noWait,
  ...extra,
});

describe('uploadInParts', () => {
  it('splits the file into 16 MB parts, the last one shorter, and completes in order', async () => {
    const f = fake({ partCount: 3, size: 40 * MB });
    const result = await uploadInParts(file(40 * MB), opts(), f.deps);

    assert.equal(f.log.start[0].contentLength, 40 * MB);
    const sizes = Object.fromEntries(f.log.partUrl.map((p) => [p.partNumber, p.contentLength]));
    assert.deepEqual(sizes, { 1: PART, 2: PART, 3: 8 * MB });
    assert.deepEqual(f.log.complete[0].parts, [
      { partNumber: 1, etag: '"etag-1"' },
      { partNumber: 2, etag: '"etag-2"' },
      { partNumber: 3, etag: '"etag-3"' },
    ]);
    assert.equal(result.size, 40 * MB);
    assert.equal(f.log.abort.length, 0);
  });

  it('passes the album through to start and complete', async () => {
    const f = fake({ partCount: 1 });
    await uploadInParts(file(MB), opts({ albumId: 'album-9' }), f.deps);
    assert.equal(f.log.start[0].albumId, 'album-9');
    assert.equal(f.log.complete[0].albumId, 'album-9');
  });

  it('sends several parts at once but never more than the limit', async () => {
    const f = fake({ partCount: 8, putDelay: 5 });
    await uploadInParts(file(8 * PART), opts({ concurrency: 3 }), f.deps);
    assert.equal(f.stats().maxInFlight, 3);
    assert.equal(f.log.complete[0].parts.length, 8);
  });

  it('retries only the failed part, with a fresh URL each time', async () => {
    const f = fake({
      partCount: 3,
      failPart: { 2: (attempt) => (attempt < 3 ? Object.assign(new Error('net'), { status: 0 }) : null) },
    });
    await uploadInParts(file(3 * PART), opts(), f.deps);

    assert.equal(f.stats().attempts[2], 3);
    assert.equal(f.stats().attempts[1], 1);
    assert.equal(f.stats().attempts[3], 1);
    // One URL per attempt: the ticket for a retry is never the one that failed.
    assert.equal(f.log.partUrl.filter((p) => p.partNumber === 2).length, 3);
    assert.equal(f.log.abort.length, 0);
  });

  it('retries an expired signature (403) because the retry gets a new URL', async () => {
    const f = fake({
      partCount: 1,
      failPart: { 1: (a) => (a === 1 ? Object.assign(new Error('x'), { status: 403 }) : null) },
    });
    await uploadInParts(file(MB), opts(), f.deps);
    assert.equal(f.stats().attempts[1], 2);
  });

  it('gives up after the attempt limit, then aborts so B2 stops billing for the parts', async () => {
    const boom = Object.assign(new Error('Upload failed'), { status: 500 });
    const f = fake({ partCount: 2, failPart: { 2: () => boom } });

    await assert.rejects(uploadInParts(file(2 * PART), opts({ maxAttempts: 3 }), f.deps), boom);
    assert.equal(f.stats().attempts[2], 3);
    assert.deepEqual(f.log.abort, [{ key: 'users/u/albums/2026/10/x.mp4', uploadId: 'up-1' }]);
    assert.equal(f.log.complete.length, 0);
  });

  it('does not retry a rejection that asking again cannot fix', async () => {
    const bad = Object.assign(new Error('Bad'), { status: 400 });
    const f = fake({ partCount: 1, failPart: { 1: () => bad } });
    await assert.rejects(uploadInParts(file(MB), opts(), f.deps), bad);
    assert.equal(f.stats().attempts[1], 1);
    assert.equal(f.log.abort.length, 1);
  });

  it('cancelling stops in-flight parts, aborts the upload and never completes', async () => {
    const f = fake({ partCount: 6, putDelay: 200 });
    const controller = new AbortController();
    const promise = uploadInParts(file(6 * PART), opts({ signal: controller.signal }), f.deps);
    setTimeout(() => controller.abort(), 20);

    await assert.rejects(promise, UploadCancelled);
    assert.equal(f.log.abort.length, 1);
    assert.equal(f.log.complete.length, 0);
    // Cancelled before the queue drained: the unsent parts were never started.
    assert.ok(f.log.put.length < 6);
  });

  it('does not even start when already cancelled', async () => {
    const f = fake({ partCount: 1 });
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(uploadInParts(file(MB), opts({ signal: controller.signal }), f.deps), UploadCancelled);
    assert.equal(f.log.start.length, 0);
  });

  it('reports progress from 0 to 1 and never goes backwards on success', async () => {
    const f = fake({ partCount: 2 });
    const seen = [];
    await uploadInParts(file(2 * PART), opts({ concurrency: 1, onProgress: (x) => seen.push(x) }), f.deps);

    assert.ok(seen.every((x) => x >= 0 && x <= 1));
    assert.equal(seen.at(-1), 1);
    assert.deepEqual(seen, [...seen].sort((a, b) => a - b));
  });

  it('drops a failed part back to zero in the progress bar, honestly', async () => {
    const f = fake({
      partCount: 1,
      failPart: { 1: (a) => (a === 1 ? Object.assign(new Error('net'), { status: 0 }) : null) },
    });
    const seen = [];
    await uploadInParts(file(PART), opts({ onProgress: (x) => seen.push(x) }), f.deps);
    assert.ok(seen.includes(0.5) && seen.includes(0));
  });

  it('still aborts when completing fails', async () => {
    const f = fake({ partCount: 1 });
    const err = Object.assign(new Error('assemble'), { status: 400 });
    f.deps.complete = async () => {
      throw err;
    };
    await assert.rejects(uploadInParts(file(MB), opts(), f.deps), err);
    assert.equal(f.log.abort.length, 1);
  });
});

describe('isRetryablePartError', () => {
  it('retries what a retry can fix and nothing else', () => {
    for (const status of [0, 403, 408, 429, 500, 502, 503]) {
      assert.equal(isRetryablePartError({ status }), true, String(status));
    }
    for (const status of [400, 401, 404, 409, 413]) {
      assert.equal(isRetryablePartError({ status }), false, String(status));
    }
    assert.equal(isRetryablePartError(new Error('no status')), true);
  });
});

describe('uploadInParts and the API calls around the parts', () => {
  it('passes start, every part URL and complete through `retry`, and nothing else', async () => {
    const f = fake({ partCount: 2, size: 20 * MB });
    const wrapped = [];
    const retry = (call, signal) => {
      wrapped.push(signal instanceof AbortSignal);
      return call();
    };
    await uploadInParts(file(20 * MB), opts({ retry }), f.deps);
    // start, part-url 1, part-url 2, complete: each with a signal to stop on.
    assert.deepEqual(wrapped, [true, true, true, true]);
    assert.equal(f.log.start.length, 1);
    assert.equal(f.log.complete.length, 1);
  });

  it("a rate-limited part URL waited out by `retry` does not spend the part's tries", async () => {
    const f = fake({ partCount: 1, size: MB });
    let limitedOnce = false;
    const partUrl = f.deps.partUrl;
    f.deps.partUrl = async (body) => {
      if (!limitedOnce) {
        limitedOnce = true;
        throw Object.assign(new Error('Too many attempts.'), { status: 429 });
      }
      return partUrl(body);
    };
    // A stand-in for withUploadRetry: one more go after a 429.
    const retry = async (call) => {
      try {
        return await call();
      } catch (error) {
        if (error.status !== 429) throw error;
        return call();
      }
    };
    await uploadInParts(file(MB), opts({ retry, maxAttempts: 1 }), f.deps);
    assert.equal(f.log.complete.length, 1);
    assert.equal(f.log.abort.length, 0);
  });

  it('a start that stays rate-limited fails the file without sending anything', async () => {
    const f = fake({ partCount: 1 });
    const limited = Object.assign(new Error('Too many attempts.'), { status: 429 });
    f.deps.start = async () => {
      throw limited;
    };
    await assert.rejects(uploadInParts(file(MB), opts({ retry: (call) => call() }), f.deps), limited);
    assert.equal(f.log.partUrl.length, 0);
  });
});
