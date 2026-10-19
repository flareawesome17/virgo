// Run: node --experimental-strip-types --test src/lib/upload-queue.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  connectivityRetryDelayMs,
  isConnectivityFailure,
  isOnlineForUploads,
  nextRunnable,
} from './upload-queue.ts';

const NOW = 1_000_000;

describe('nextRunnable', () => {
  it('runs the first queued task, in order', () => {
    const tasks = [
      { id: 'a', status: 'done' },
      { id: 'b', status: 'failed' },
      { id: 'c', status: 'queued' },
      { id: 'd', status: 'queued' },
    ];
    assert.equal(nextRunnable(tasks, NOW, true).task.id, 'c');
  });

  it('runs nothing and asks for no wake-up while offline', () => {
    assert.deepEqual(nextRunnable([{ id: 'a', status: 'queued' }], NOW, false), {});
  });

  it('passes over a task still waiting out its delay', () => {
    const tasks = [
      { id: 'a', status: 'queued', retryAt: NOW + 5000 },
      { id: 'b', status: 'queued' },
    ];
    assert.equal(nextRunnable(tasks, NOW, true).task.id, 'b');
  });

  it('runs a task whose delay has ended', () => {
    const tasks = [{ id: 'a', status: 'queued', retryAt: NOW }];
    assert.equal(nextRunnable(tasks, NOW, true).task.id, 'a');
  });

  it('when every queued task is waiting, wakes at the earliest', () => {
    const tasks = [
      { id: 'a', status: 'queued', retryAt: NOW + 9000 },
      { id: 'b', status: 'uploading' },
      { id: 'c', status: 'queued', retryAt: NOW + 3000 },
    ];
    assert.deepEqual(nextRunnable(tasks, NOW, true), { wakeAt: NOW + 3000 });
  });

  it('has nothing to say about an empty or finished queue', () => {
    assert.deepEqual(nextRunnable([], NOW, true), {});
    assert.deepEqual(nextRunnable([{ status: 'done', retryAt: NOW + 1 }], NOW, true), {});
  });
});

describe('isConnectivityFailure', () => {
  it('is status 0 and only status 0', () => {
    assert.equal(isConnectivityFailure({ status: 0 }, false), true);
    for (const status of [400, 403, 404, 422, 500, 503, 507]) {
      assert.equal(isConnectivityFailure({ status }, false), false, String(status));
    }
    assert.equal(isConnectivityFailure(new Error('Unable to resolve host'), false), false);
    assert.equal(isConnectivityFailure(null, false), false);
  });

  it('is never a cancellation, though a cancellation is also status 0', () => {
    assert.equal(isConnectivityFailure({ status: 0 }, true), false);
  });
});

describe('connectivityRetryDelayMs', () => {
  it('doubles from 5 seconds and stops at 5 minutes', () => {
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6, 7, 20].map(connectivityRetryDelayMs),
      [5000, 10000, 20000, 40000, 80000, 160000, 300000, 300000],
    );
    assert.equal(connectivityRetryDelayMs(0), 5000);
  });
});

describe('isOnlineForUploads', () => {
  it('holds uploads only on an explicit no', () => {
    assert.equal(isOnlineForUploads({ isConnected: true, isInternetReachable: true }), true);
    assert.equal(isOnlineForUploads({ isConnected: true, isInternetReachable: null }), true, 'not yet checked');
    assert.equal(isOnlineForUploads({ isConnected: null, isInternetReachable: null }), true);
    assert.equal(isOnlineForUploads({ isConnected: true, isInternetReachable: false }), false, 'captive portal');
    assert.equal(isOnlineForUploads({ isConnected: false, isInternetReachable: null }), false);
  });
});
