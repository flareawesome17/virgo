// Run: node --experimental-strip-types --test src/lib/multipart-resume.test.mjs
//
// Drives the real shared uploader (src/api/multipart-upload.ts) through the
// resume wrapper, with fakes for the API and the bucket, so what is asserted
// is what the phone would actually do.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UploadCancelled, uploadInParts } from '../api/multipart-upload.ts';
import {
  canResume,
  MAX_RESUME_AGE_MS,
  partRetryDelayMs,
  resumable,
  sentPartCount,
  shouldKeepForResume,
} from './multipart-resume.ts';

// Tiny parts keep the fixtures readable: 10 bytes in parts of 4 is 4 + 4 + 2.
const PART = 4;
const SIZE = 10;
const COUNT = 3;
const KEY = 'users/u/albums/2026/10/film.mp4';
const NOW = 1_800_000_000_000;
const noWait = async () => {};

const fileOf = (size) => new Blob([new Uint8Array(size)]);

/** The API and bucket, recording every call. `failPut` decides per part and attempt. */
function fakeBase({ failPut = () => null, uploadId = 'up-1' } = {}) {
  const log = { start: 0, partUrl: [], put: [], complete: [], abort: [] };
  const attempts = {};
  const deps = {
    async start(body) {
      log.start++;
      return { key: KEY, uploadId, partSize: PART, partCount: Math.ceil(body.contentLength / PART) };
    },
    async partUrl(body) {
      log.partUrl.push(body.partNumber);
      return { uploadUrl: `https://b2/${body.partNumber}`, requiredHeaders: {}, expiresAt: '' };
    },
    async putPart(blob, ticket, onLoaded) {
      const n = Number(ticket.uploadUrl.split('/').pop());
      attempts[n] = (attempts[n] ?? 0) + 1;
      log.put.push(n);
      const failure = failPut(n, attempts[n]);
      if (failure) throw failure;
      onLoaded(blob.size);
      return `"etag-${n}"`;
    },
    async complete(body) {
      log.complete.push(body);
      return { key: body.key, size: SIZE };
    },
    async abort(body) {
      log.abort.push(body);
    },
  };
  return { deps, log };
}

const savedSession = (over = {}) => ({
  key: KEY,
  uploadId: 'up-old',
  partSize: PART,
  partCount: COUNT,
  contentLength: SIZE,
  etags: { 1: '"etag-1"', 2: '"etag-2"' },
  startedAt: NOW - 60_000,
  ...over,
});

const run = (r, extra = {}) =>
  uploadInParts(
    fileOf(SIZE),
    { contentType: 'video/mp4', scope: 'albums', backoff: noWait, concurrency: 1, ...extra },
    r.deps,
  );

/** What the provider does: run, and settle on failure. */
async function runAndSettle(r, extra = {}) {
  try {
    return await run(r, extra);
  } catch (error) {
    const cancelled = error instanceof UploadCancelled || Boolean(extra.signal?.aborted);
    await r.settle(error, cancelled);
    throw error;
  }
}

const net = () => Object.assign(new Error('net'), { status: 0 });

describe('resumable: a fresh upload', () => {
  it('starts one, publishes each acknowledged part, and clears the session when assembled', async () => {
    const base = fakeBase();
    const seen = [];
    const r = resumable(base.deps, { keepForResume: true, onSession: (s) => seen.push(s), now: () => NOW });

    await run(r);

    assert.equal(base.log.start, 1);
    assert.deepEqual(base.log.put, [1, 2, 3]);
    // Started (no parts), then one more ETag per part, then over.
    assert.deepEqual(seen.slice(0, -1).map((s) => Object.keys(s.etags).length), [0, 1, 2, 3]);
    assert.equal(seen[0].uploadId, 'up-1');
    assert.equal(seen[0].contentLength, SIZE);
    assert.equal(seen[0].startedAt, NOW);
    assert.equal(seen.at(-1), undefined);
    assert.equal(base.log.abort.length, 0);
  });

  it('publishes copies, so a saved session is not changed behind the queue', async () => {
    const base = fakeBase();
    const seen = [];
    const r = resumable(base.deps, { keepForResume: true, onSession: (s) => seen.push(s), now: () => NOW });
    await run(r);
    assert.deepEqual(seen[1].etags, { 1: '"etag-1"' });
  });
});

describe('resumable: carrying on', () => {
  it('reuses the saved upload and sends only the parts it lacks', async () => {
    const base = fakeBase();
    const progress = [];
    const r = resumable(base.deps, { resume: savedSession(), keepForResume: true, now: () => NOW });

    await run(r, { onProgress: (x) => progress.push(x) });

    assert.equal(base.log.start, 0, 'no new upload is opened');
    assert.deepEqual(base.log.partUrl, [3], 'no URL is minted for a part already sent');
    assert.deepEqual(base.log.put, [3]);
    assert.equal(r.resumedParts(), 2);
    assert.deepEqual(base.log.complete[0], {
      key: KEY,
      uploadId: 'up-old',
      parts: [
        { partNumber: 1, etag: '"etag-1"' },
        { partNumber: 2, etag: '"etag-2"' },
        { partNumber: 3, etag: '"etag-3"' },
      ],
      albumId: undefined,
    });
    // The parts already in the bucket count toward the bar at once.
    assert.ok(progress[0] >= 0.4);
    assert.equal(progress.at(-1), 1);
  });

  it('does not touch the saved session object it was given', async () => {
    const saved = savedSession();
    const r = resumable(fakeBase().deps, { resume: saved, keepForResume: true, now: () => NOW });
    await run(r);
    assert.deepEqual(Object.keys(saved.etags), ['1', '2']);
  });

  it('releases a session for a different file size and starts afresh', async () => {
    const base = fakeBase();
    const r = resumable(base.deps, {
      resume: savedSession({ contentLength: 999, partCount: 250 }),
      keepForResume: true,
      now: () => NOW,
    });
    await run(r);
    assert.equal(base.log.start, 1);
    assert.deepEqual(base.log.abort, [{ key: KEY, uploadId: 'up-old' }]);
    assert.deepEqual(base.log.put, [1, 2, 3]);
  });

  it('releases a session too old to still exist in the bucket', async () => {
    const base = fakeBase();
    const r = resumable(base.deps, {
      resume: savedSession({ startedAt: NOW - MAX_RESUME_AGE_MS - 1 }),
      keepForResume: true,
      now: () => NOW,
    });
    await run(r);
    assert.equal(base.log.start, 1);
    assert.equal(base.log.abort.length, 1);
  });
});

describe('resumable: when it fails', () => {
  it('keeps the parts after a dropped connection, with every ETag that landed', async () => {
    const base = fakeBase({ failPut: (n) => (n === 3 ? net() : null) });
    const seen = [];
    const r = resumable(base.deps, { keepForResume: true, onSession: (s) => seen.push(s), now: () => NOW });

    await assert.rejects(runAndSettle(r, { maxAttempts: 2 }), { status: 0 });

    assert.equal(base.log.abort.length, 0, 'nothing released');
    const last = seen.at(-1);
    assert.deepEqual(last.etags, { 1: '"etag-1"', 2: '"etag-2"' });
    assert.equal(base.log.complete.length, 0);
  });

  it('the kept session then finishes the file without resending what landed', async () => {
    const first = fakeBase({ failPut: (n) => (n === 3 ? net() : null) });
    let saved;
    const r1 = resumable(first.deps, { keepForResume: true, onSession: (s) => (saved = s), now: () => NOW });
    await assert.rejects(runAndSettle(r1, { maxAttempts: 1 }));

    const second = fakeBase();
    const r2 = resumable(second.deps, { resume: saved, keepForResume: true, onSession: (s) => (saved = s), now: () => NOW + 1000 });
    await run(r2);

    assert.deepEqual(second.log.put, [3]);
    assert.equal(second.log.complete[0].uploadId, 'up-1');
    assert.equal(saved, undefined);
  });

  it('keeps the parts after a server error that outlasted the retries', async () => {
    const base = fakeBase({ failPut: (n) => (n === 2 ? Object.assign(new Error('x'), { status: 503 }) : null) });
    const r = resumable(base.deps, { keepForResume: true, now: () => NOW });
    await assert.rejects(runAndSettle(r, { maxAttempts: 2 }));
    assert.equal(base.log.abort.length, 0);
  });

  it('releases the parts after a refusal no retry can fix', async () => {
    const base = fakeBase({ failPut: (n) => (n === 2 ? Object.assign(new Error('x'), { status: 400 }) : null) });
    const seen = [];
    const r = resumable(base.deps, { keepForResume: true, onSession: (s) => seen.push(s), now: () => NOW });
    await assert.rejects(runAndSettle(r));
    assert.deepEqual(base.log.abort, [{ key: KEY, uploadId: 'up-1' }]);
    assert.equal(seen.at(-1), undefined);
  });

  it('releases the parts after a 403 that survived fresh URLs', async () => {
    const base = fakeBase({ failPut: () => Object.assign(new Error('x'), { status: 403 }) });
    const r = resumable(base.deps, { keepForResume: true, now: () => NOW });
    await assert.rejects(runAndSettle(r, { maxAttempts: 2 }));
    assert.equal(base.log.abort.length, 1);
  });

  it('releases the parts when cancelled, even though cancelling looks like no response', async () => {
    const controller = new AbortController();
    const base = fakeBase({
      failPut: (n) => {
        if (n === 2) {
          controller.abort();
          return net();
        }
        return null;
      },
    });
    const r = resumable(base.deps, { keepForResume: true, now: () => NOW });
    await assert.rejects(runAndSettle(r, { signal: controller.signal }), UploadCancelled);
    assert.equal(base.log.abort.length, 1);
  });

  it('always releases without keepForResume, as web does', async () => {
    const base = fakeBase({ failPut: (n) => (n === 3 ? net() : null) });
    const r = resumable(base.deps, { keepForResume: false, now: () => NOW });
    await assert.rejects(runAndSettle(r, { maxAttempts: 1 }));
    assert.equal(base.log.abort.length, 1);
  });

  it('has nothing to release when start itself failed', async () => {
    const base = fakeBase();
    base.deps.start = async () => {
      throw net();
    };
    const r = resumable(base.deps, { keepForResume: false, now: () => NOW });
    await assert.rejects(runAndSettle(r));
    assert.equal(base.log.abort.length, 0);
  });

  it('never lets the uploader abort by itself: that call is deferred to settle', async () => {
    const base = fakeBase({ failPut: () => Object.assign(new Error('x'), { status: 400 }) });
    const r = resumable(base.deps, { keepForResume: true, now: () => NOW });
    await assert.rejects(run(r));
    assert.equal(base.log.abort.length, 0);
    await r.settle(new Error('x'), false);
    assert.equal(base.log.abort.length, 1);
  });

  it('settle never rejects, even when the abort request fails', async () => {
    const base = fakeBase({ failPut: () => Object.assign(new Error('x'), { status: 400 }) });
    base.deps.abort = async () => {
      throw net();
    };
    const r = resumable(base.deps, { keepForResume: true, now: () => NOW });
    await assert.rejects(run(r));
    await r.settle(new Error('x'), false);
  });
});

describe('shouldKeepForResume', () => {
  it('keeps for what waiting can fix and for nothing else', () => {
    for (const status of [0, 408, 429, 500, 502, 503, 507]) {
      assert.equal(shouldKeepForResume({ status }, false), true, String(status));
    }
    for (const status of [400, 401, 403, 404, 409, 413, 422]) {
      assert.equal(shouldKeepForResume({ status }, false), false, String(status));
    }
    assert.equal(shouldKeepForResume(new Error('no status'), false), false);
    assert.equal(shouldKeepForResume(null, false), false);
    assert.equal(shouldKeepForResume({ status: 0 }, true), false, 'cancelled');
  });
});

describe('canResume', () => {
  it('accepts a young session for the same size', () => {
    assert.equal(canResume(savedSession(), SIZE, NOW), true);
  });

  it('refuses anything that does not describe this file', () => {
    assert.equal(canResume(undefined, SIZE, NOW), false);
    assert.equal(canResume(null, SIZE, NOW), false);
    // 13 bytes in parts of 4 is 4 parts, and the session says 3.
    assert.equal(canResume(savedSession({ contentLength: 13 }), 13, NOW), false, 'part count no longer adds up');
    assert.equal(canResume(savedSession(), SIZE + 1, NOW), false, 'another size');
    assert.equal(canResume(savedSession({ uploadId: '' }), SIZE, NOW), false);
    assert.equal(canResume(savedSession({ key: '' }), SIZE, NOW), false);
    assert.equal(canResume(savedSession({ partSize: 0 }), SIZE, NOW), false);
    assert.equal(canResume(savedSession({ etags: null }), SIZE, NOW), false);
    assert.equal(canResume(savedSession({ startedAt: NOW - MAX_RESUME_AGE_MS }), SIZE, NOW), false, 'too old');
    assert.equal(canResume(savedSession({ startedAt: NOW + 60_000 }), SIZE, NOW), false, 'from the future');
  });
});

describe('small helpers', () => {
  it('counts the parts a session has', () => {
    assert.equal(sentPartCount(savedSession()), 2);
    assert.equal(sentPartCount(undefined), 0);
  });

  it('backs off 1, 2, 4, 8 then 15 seconds', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 9].map(partRetryDelayMs), [1000, 2000, 4000, 8000, 15000, 15000]);
    assert.equal(partRetryDelayMs(0), 1000);
  });
});
