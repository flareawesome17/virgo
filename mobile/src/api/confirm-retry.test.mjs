// Run: node --experimental-strip-types --test src/api/confirm-retry.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  confirmBackoffMs,
  isRetryableConfirmError,
  isRetryableRequestError,
  MAX_RETRY_AFTER_MS,
  parseRetryAfter,
  retryAfterMs,
  UploadPause,
  uploadRetryDelayMs,
  withConfirmRetry,
  withUploadRetry,
} from './confirm-retry.ts';

const err = (status, message = `status ${status}`) => Object.assign(new Error(message), { status });

/** A confirm that fails with each of `failures` in turn, then answers. */
function flaky(failures, answer = { exists: true, size: 10 }) {
  let calls = 0;
  const fn = async () => {
    const failure = failures[calls++];
    if (failure) throw failure;
    return answer;
  };
  return { fn, calls: () => calls };
}

function recordingBackoff() {
  const waits = [];
  const backoff = async (attempt) => {
    waits.push(attempt);
  };
  return { backoff, waits };
}

describe('isRetryableConfirmError', () => {
  it('retries network failures, timeouts, rate limits and server errors', () => {
    for (const status of [0, 408, 429, 500, 502, 503, 504]) {
      assert.equal(isRetryableConfirmError(err(status)), true, `status ${status}`);
    }
    // A fetch that never got a response at all, with no status attached.
    assert.equal(isRetryableConfirmError(new TypeError('Failed to fetch')), true);
  });

  it('does not retry a refusal that asking again cannot change', () => {
    for (const status of [400, 401, 403, 404, 409, 413, 422]) {
      assert.equal(isRetryableConfirmError(err(status)), false, `status ${status}`);
    }
  });
});

describe('confirmBackoffMs', () => {
  it('doubles from one second and caps at eight', () => {
    assert.deepEqual([1, 2, 3, 4, 5].map(confirmBackoffMs), [1000, 2000, 4000, 8000, 8000]);
  });
});

describe('withConfirmRetry', () => {
  it('returns the first answer without waiting', async () => {
    const c = flaky([]);
    const b = recordingBackoff();
    assert.deepEqual(await withConfirmRetry(c.fn, { backoff: b.backoff }), { exists: true, size: 10 });
    assert.equal(c.calls(), 1);
    assert.deepEqual(b.waits, []);
  });

  it('tries again after a 503 and a dropped connection, backing off between', async () => {
    const c = flaky([err(503), err(0)]);
    const b = recordingBackoff();
    const result = await withConfirmRetry(c.fn, { backoff: b.backoff });
    assert.deepEqual(result, { exists: true, size: 10 });
    assert.equal(c.calls(), 3);
    assert.deepEqual(b.waits, [1, 2]);
  });

  it('gives up after four tries by default, with the last error', async () => {
    const last = err(502, 'still down');
    const c = flaky([err(503), err(500), err(0), last, err(503)]);
    const b = recordingBackoff();
    await assert.rejects(withConfirmRetry(c.fn, { backoff: b.backoff }), (e) => e === last);
    assert.equal(c.calls(), 4);
    assert.deepEqual(b.waits, [1, 2, 3]);
  });

  it('honours a smaller maxAttempts', async () => {
    const c = flaky([err(503), err(503)]);
    const b = recordingBackoff();
    await assert.rejects(withConfirmRetry(c.fn, { backoff: b.backoff, maxAttempts: 2 }));
    assert.equal(c.calls(), 2);
  });

  it('does not retry a 4xx such as an unusable avatar', async () => {
    const refused = err(400, "That photo couldn't be used.");
    const c = flaky([refused]);
    const b = recordingBackoff();
    await assert.rejects(withConfirmRetry(c.fn, { backoff: b.backoff }), (e) => e === refused);
    assert.equal(c.calls(), 1);
    assert.deepEqual(b.waits, []);
  });

  it('stops retrying once the upload is cancelled, even mid-wait', async () => {
    const controller = new AbortController();
    const first = err(503);
    const c = flaky([first, err(503), err(503)]);
    const backoff = async () => {
      controller.abort();
    };
    await assert.rejects(
      withConfirmRetry(c.fn, { backoff, signal: controller.signal }),
      (e) => e === first,
    );
    assert.equal(c.calls(), 1);
  });

  it('wakes the default wait as soon as the upload is cancelled', async () => {
    const controller = new AbortController();
    const c = flaky([err(503), err(503)]);
    const started = Date.now();
    setTimeout(() => controller.abort(), 20);
    await assert.rejects(withConfirmRetry(c.fn, { signal: controller.signal }));
    assert.ok(Date.now() - started < 900, 'did not sit out the one second backoff');
    assert.equal(c.calls(), 1);
  });
});

/** A 429 as the API client raises it: Retry-After read off the response, in ms. */
const limited = (retryAfter) =>
  Object.assign(new Error('Too many attempts. Please wait a while and try again.'), {
    status: 429,
    ...(retryAfter === undefined ? {} : { retryAfterMs: retryAfter }),
  });

/** A clock that only moves when the code under test sleeps. */
function fakeTime() {
  const time = { now: 0, slept: [] };
  time.clock = () => time.now;
  time.sleep = async (ms) => {
    time.slept.push(ms);
    time.now += ms;
  };
  return time;
}

/** Lets every queued promise callback run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('parseRetryAfter', () => {
  it('reads delay-seconds', () => {
    assert.equal(parseRetryAfter('7'), 7000);
    assert.equal(parseRetryAfter(' 0 '), 0);
  });

  it('reads an HTTP date, and a date already past as no wait', () => {
    const now = Date.parse('Tue, 20 Oct 2026 10:00:00 GMT');
    assert.equal(parseRetryAfter('Tue, 20 Oct 2026 10:00:12 GMT', now), 12_000);
    assert.equal(parseRetryAfter('Tue, 20 Oct 2026 09:59:00 GMT', now), 0);
  });

  it('answers undefined for nothing or nonsense', () => {
    for (const value of [null, undefined, '', 'soon', '-3']) {
      assert.equal(parseRetryAfter(value), undefined, String(value));
    }
  });
});

describe('retryAfterMs', () => {
  it('reads what the client attached, capped at a minute', () => {
    assert.equal(retryAfterMs(limited(3000)), 3000);
    assert.equal(retryAfterMs(limited(10 * 60_000)), MAX_RETRY_AFTER_MS);
    assert.equal(MAX_RETRY_AFTER_MS, 60_000);
  });

  it('is undefined when the error carries no usable value', () => {
    assert.equal(retryAfterMs(limited()), undefined);
    assert.equal(retryAfterMs(Object.assign(new Error('x'), { retryAfterMs: Number.NaN })), undefined);
    assert.equal(retryAfterMs(null), undefined);
  });
});

describe('uploadRetryDelayMs', () => {
  it('waits 2, 4, 8, then 15 seconds at most', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(uploadRetryDelayMs), [2000, 4000, 8000, 15000, 15000, 15000]);
  });
});

describe('isRetryableRequestError', () => {
  it('follows the confirm rule: no answer, timeouts, rate limits and 5xx', () => {
    for (const status of [0, 408, 429, 500, 503]) assert.equal(isRetryableRequestError(err(status)), true);
    for (const status of [400, 401, 403, 404, 413]) assert.equal(isRetryableRequestError(err(status)), false);
    assert.equal(isRetryableRequestError(new TypeError('Failed to fetch')), true);
  });
});

describe('withUploadRetry', () => {
  it('waits out a rate limit and asks again instead of failing the file', async () => {
    const t = fakeTime();
    const pause = new UploadPause(t.clock);
    const c = flaky([limited(), limited()], { uploadUrl: 'https://b2/x' });
    const result = await withUploadRetry(c.fn, { pause, sleep: t.sleep });
    assert.deepEqual(result, { uploadUrl: 'https://b2/x' });
    assert.equal(c.calls(), 3);
    assert.deepEqual(t.slept, [2000, 4000]);
  });

  it('honours Retry-After over its own schedule', async () => {
    const t = fakeTime();
    const c = flaky([limited(7000)]);
    await withUploadRetry(c.fn, { pause: new UploadPause(t.clock), sleep: t.sleep });
    assert.deepEqual(t.slept, [7000]);
  });

  it('also retries server errors and dropped connections, on the same schedule', async () => {
    const t = fakeTime();
    const c = flaky([err(503), err(0), new TypeError('Failed to fetch')]);
    await withUploadRetry(c.fn, { pause: new UploadPause(t.clock), sleep: t.sleep });
    assert.equal(c.calls(), 4);
    assert.deepEqual(t.slept, [2000, 4000, 8000]);
  });

  it('gives up after five tries with the last error', async () => {
    const t = fakeTime();
    const last = limited();
    const c = flaky([limited(), limited(), limited(), limited(), last, limited()]);
    await assert.rejects(
      withUploadRetry(c.fn, { pause: new UploadPause(t.clock), sleep: t.sleep }),
      (e) => e === last,
    );
    assert.equal(c.calls(), 5);
    assert.deepEqual(t.slept, [2000, 4000, 8000, 15000]);
  });

  it('does not retry a refusal such as a full quota or a forbidden album', async () => {
    const t = fakeTime();
    for (const status of [400, 403, 413]) {
      const refused = err(status);
      const c = flaky([refused]);
      await assert.rejects(
        withUploadRetry(c.fn, { pause: new UploadPause(t.clock), sleep: t.sleep }),
        (e) => e === refused,
      );
      assert.equal(c.calls(), 1);
    }
    assert.deepEqual(t.slept, []);
  });

  it('holds every other upload request back while one waits out a 429', async () => {
    let now = 0;
    const pause = new UploadPause(() => now);
    const waits = [];
    const sleep = (ms) => new Promise((resolve) => waits.push({ ms, resolve }));

    const first = flaky([limited(5000)], 'first');
    const firstDone = withUploadRetry(first.fn, { pause, sleep });
    await settle();
    assert.deepEqual(waits.map((w) => w.ms), [5000]);
    assert.equal(pause.remainingMs(), 5000);

    // Another worker's next ticket, asked for while the first is waiting.
    const second = flaky([], 'second');
    const secondDone = withUploadRetry(second.fn, { pause, sleep });
    await settle();
    assert.equal(second.calls(), 0, 'did not ask the server during the pause');
    assert.deepEqual(waits.map((w) => w.ms), [5000, 5000]);

    now = 5000;
    for (const w of waits) w.resolve();
    assert.equal(await secondDone, 'second');
    assert.equal(await firstDone, 'first');
    assert.equal(second.calls(), 1);
    assert.equal(first.calls(), 2);
  });

  it('a pause never shortens one already longer', () => {
    let now = 0;
    const pause = new UploadPause(() => now);
    pause.hold(10_000);
    pause.hold(2000);
    assert.equal(pause.remainingMs(), 10_000);
    now = 4000;
    assert.equal(pause.remainingMs(), 6000);
    now = 20_000;
    assert.equal(pause.remainingMs(), 0);
  });

  it('a server error does not pause the others', async () => {
    const t = fakeTime();
    const pause = new UploadPause(t.clock);
    let pausedDuringWait;
    const sleep = async (ms) => {
      pausedDuringWait = pause.remainingMs();
      await t.sleep(ms);
    };
    await withUploadRetry(flaky([err(503)]).fn, { pause, sleep });
    assert.equal(pausedDuringWait, 0);
  });

  it('stops once the upload is cancelled, without asking during the pause', async () => {
    const pause = new UploadPause(() => 0);
    pause.hold(30_000);
    const controller = new AbortController();
    const c = flaky([]);
    const sleep = async () => {
      controller.abort();
    };
    await assert.rejects(
      withUploadRetry(c.fn, { pause, sleep, signal: controller.signal }),
      (e) => e.status === 0,
    );
    assert.equal(c.calls(), 0);
  });
});

describe('withConfirmRetry and rate limits', () => {
  it('honours Retry-After and holds the shared pause on a 429', async () => {
    const t = fakeTime();
    const pause = new UploadPause(t.clock);
    let pausedFor;
    const sleep = async (ms) => {
      pausedFor ??= pause.remainingMs();
      await t.sleep(ms);
    };
    const c = flaky([limited(9000)]);
    await withConfirmRetry(c.fn, { pause, sleep });
    assert.equal(c.calls(), 2);
    assert.deepEqual(t.slept, [9000]);
    assert.equal(pausedFor, 9000);
  });

  it('keeps its own one-second schedule for a 503', async () => {
    const t = fakeTime();
    const c = flaky([err(503), err(503)]);
    await withConfirmRetry(c.fn, { pause: new UploadPause(t.clock), sleep: t.sleep });
    assert.deepEqual(t.slept, [1000, 2000]);
  });
});
