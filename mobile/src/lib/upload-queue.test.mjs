// Run: node --experimental-strip-types --test src/lib/upload-queue.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  connectivityRetryDelayMs,
  isConnectivityFailure,
  isOnlineForUploads,
  partDeadlineMs,
  STALL_TICK_MS,
  stallWatch,
  isDisposableCopy,
  nextRunnable,
  planStarts,
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

describe('planStarts', () => {
  const large = (task) => task.size >= 100;
  const plan = (tasks, over = {}) =>
    planStarts(tasks, {
      inFlight: new Set(),
      limit: 3,
      offScreen: false,
      now: NOW,
      online: true,
      isLarge: large,
      ...over,
    });
  const ids = (result) => result.start.map((task) => task.id);
  const q = (id, size = 1, extra = {}) => ({ id, size, status: 'queued', ...extra });

  it('starts up to the limit, in order', () => {
    assert.deepEqual(ids(plan([q('a'), q('b'), q('c'), q('d')])), ['a', 'b', 'c']);
  });

  it('fills only the free slots', () => {
    const tasks = [{ ...q('a'), status: 'uploading' }, q('b'), q('c'), q('d')];
    assert.deepEqual(ids(plan(tasks, { inFlight: new Set(['a']) })), ['b', 'c']);
  });

  it('starts a large file alone when nothing is running', () => {
    assert.deepEqual(ids(plan([q('big', 500), q('b'), q('c')])), ['big']);
  });

  it('holds the line at a large file until the files ahead have landed', () => {
    const tasks = [{ ...q('a'), status: 'uploading' }, q('big', 500), q('c')];
    assert.deepEqual(ids(plan(tasks, { inFlight: new Set(['a']) })), []);
  });

  it('starts a large file after small ones, but not in the same breath', () => {
    assert.deepEqual(ids(plan([q('a'), q('big', 500), q('c')])), ['a']);
  });

  it('starts nothing beside a large file in flight', () => {
    const tasks = [{ ...q('big', 500), status: 'uploading' }, q('b'), q('c')];
    assert.deepEqual(ids(plan(tasks, { inFlight: new Set(['big']) })), []);
  });

  it('off screen, passes over a large file and hands the small ones on', () => {
    const tasks = [{ ...q('a'), status: 'uploading' }, q('big', 500), q('c'), q('d')];
    const result = plan(tasks, { inFlight: new Set(['a']), offScreen: true, limit: 8 });
    assert.deepEqual(ids(result), ['c', 'd']);
  });

  it('off screen, small files still go beside a large one already running', () => {
    const tasks = [{ ...q('big', 500), status: 'uploading' }, q('b')];
    const result = plan(tasks, { inFlight: new Set(['big']), offScreen: true, limit: 8 });
    assert.deepEqual(ids(result), ['b']);
  });

  it('skips files waiting out a delay, and says when to look again', () => {
    const tasks = [q('a', 1, { retryAt: NOW + 5000 }), q('b'), q('c', 1, { retryAt: NOW + 2000 })];
    const result = plan(tasks);
    assert.deepEqual(ids(result), ['b']);
    assert.equal(result.wakeAt, NOW + 2000);
  });

  it('starts nothing offline', () => {
    assert.deepEqual(plan([q('a'), q('b')], { online: false }), { start: [] });
  });

  it('never starts a file already in flight', () => {
    const tasks = [q('a'), q('b')];
    assert.deepEqual(ids(plan(tasks, { inFlight: new Set(['a']) })), ['b']);
  });
});

describe('isDisposableCopy', () => {
  const cache = 'file:///var/mobile/Containers/Data/Application/X/Library/Caches/';

  it('is a file the picker copied into the cache', () => {
    assert.equal(isDisposableCopy(`${cache}ImagePicker/1.jpg`, cache), true);
    assert.equal(isDisposableCopy(`${cache}DocumentPicker/2.m4a`, cache), true);
    // expo-image-picker on iOS can put its copies at the top of the cache.
    assert.equal(isDisposableCopy(`${cache}3.heic`, cache), true);
  });

  it('works whether or not the cache path ends in a slash', () => {
    assert.equal(isDisposableCopy(`${cache}ImagePicker/1.jpg`, cache.slice(0, -1)), true);
  });

  it('is never a file outside the cache', () => {
    assert.equal(isDisposableCopy('file:///var/mobile/Media/DCIM/100APPLE/IMG_1.HEIC', cache), false);
    assert.equal(isDisposableCopy('content://media/external/images/1', cache), false);
    assert.equal(isDisposableCopy(`${cache.slice(0, -1)}-other/1.jpg`, cache), false);
  });

  it('is never the cache itself, or a path that climbs out of it', () => {
    assert.equal(isDisposableCopy(cache, cache), false);
    assert.equal(isDisposableCopy(`${cache}../Documents/a.jpg`, cache), false);
  });

  it('is nothing without a cache directory (web)', () => {
    assert.equal(isDisposableCopy(`${cache}1.jpg`, null), false);
  });
});

describe('stallWatch', () => {
  const clock = () => {
    let t = 0;
    return { now: () => t, advance: (ms) => (t += ms) };
  };
  const run = (watch, c, ms, active = true) => {
    let stalled = false;
    for (let at = 0; at < ms; at += STALL_TICK_MS) {
      c.advance(STALL_TICK_MS);
      stalled = watch.tick(active) || stalled;
    }
    return stalled;
  };

  it('says nothing while bytes keep moving', () => {
    const c = clock();
    const watch = stallWatch(60_000, c.now);
    for (let i = 0; i < 40; i++) {
      c.advance(STALL_TICK_MS);
      watch.touch();
      assert.equal(watch.tick(true), false);
    }
  });

  it('calls a minute in front with nothing sent a stall', () => {
    const c = clock();
    const watch = stallWatch(60_000, c.now);
    assert.equal(run(watch, c, 55_000), false);
    assert.equal(run(watch, c, 5_000), true);
  });

  it('does not count time off screen', () => {
    const c = clock();
    const watch = stallWatch(60_000, c.now);
    assert.equal(run(watch, c, 10 * 60_000, false), false);
    assert.equal(run(watch, c, 55_000), false);
  });

  it('does not count a suspension, when the ticks themselves stopped', () => {
    const c = clock();
    const watch = stallWatch(60_000, c.now);
    run(watch, c, 30_000);
    c.advance(20 * 60_000);
    assert.equal(watch.tick(true), false);
    assert.equal(run(watch, c, 55_000), false);
  });

  it('waits three times as long for the answer once every byte is out', () => {
    const c = clock();
    const watch = stallWatch(60_000, c.now);
    watch.touch(true);
    assert.equal(run(watch, c, 175_000), false);
    assert.equal(run(watch, c, 5_000), true);
  });
});

describe('partDeadlineMs', () => {
  it('allows 16 KB a second, never under three minutes', () => {
    assert.equal(partDeadlineMs(16 * 1024 * 1024), 1024_000);
    assert.equal(partDeadlineMs(1024), 180_000);
  });
});
