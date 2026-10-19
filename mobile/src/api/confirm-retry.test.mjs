// Run: node --experimental-strip-types --test src/api/confirm-retry.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { confirmBackoffMs, isRetryableConfirmError, withConfirmRetry } from './confirm-retry.ts';

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
