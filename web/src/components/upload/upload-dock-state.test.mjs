import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  INITIAL_DOCK,
  badge,
  badgeText,
  clampDockBottom,
  dockBounds,
  dockLabel,
  dockReducer,
  dockStatus,
  filesLeft,
  nudge,
  parseStoredBottom,
  ringDash,
  shouldAutoOpen,
  summarize,
} from './upload-dock-state.ts';

const item = (status, over = {}) => ({ status, sizeBytes: 1000, progress: 0, ...over });

test('summarize weights by bytes and leaves out skipped and cancelled', () => {
  const s = summarize([
    item('uploading', { sizeBytes: 1_000_000, progress: 0.5 }),
    item('queued', { sizeBytes: 3_000_000 }),
    item('skipped', { skipReason: 'duplicate' }),
    item('cancelled'),
  ]);
  assert.equal(s.total, 2);
  assert.equal(s.fraction, 0.125);
  assert.equal(s.duplicates, 1);
  assert.equal(summarize([]).fraction, 0);
  assert.equal(summarize([item('done', { albumName: 'A' }), item('done', { albumName: 'B' })]).album, null);
});

test('status priority', () => {
  const s = (...x) => summarize(x);
  assert.equal(dockStatus(s(item('queued'), item('failed')), 2), 'uploading');
  assert.equal(dockStatus(s(item('failed')), 2), 'checking');
  assert.equal(dockStatus(s(item('failed'), item('done')), 0), 'failed');
  assert.equal(dockStatus(s(item('done')), 0), 'done');
  assert.equal(dockStatus(s(item('skipped', { skipReason: 'possible' })), 0), 'done');
  assert.equal(dockStatus(s(), 0), 'idle');
});

test('badge and files left', () => {
  const up = summarize([item('queued'), item('uploading')]);
  assert.equal(filesLeft(up, 3), 5);
  assert.deepEqual(badge('uploading', up, 3), { text: '5', tone: 'neutral' });
  const bad = summarize([item('failed'), item('failed')]);
  assert.deepEqual(badge('failed', bad, 0), { text: '2', tone: 'danger' });
  assert.equal(badge('done', bad, 0), null);
  assert.equal(badgeText(100), '99+');
});

test('ringDash clamps', () => {
  const c = 2 * Math.PI * 19;
  assert.equal(ringDash(0, 19).offset, c);
  assert.equal(ringDash(1, 19).offset, 0);
  assert.ok(Math.abs(ringDash(0.25, 19).offset - 0.75 * c) < 1e-9);
  assert.equal(ringDash(5, 19).offset, 0);
  assert.equal(ringDash(-1, 19).offset, c);
  assert.equal(ringDash(NaN, 19).offset, c);
});

test('bounds and clamping', () => {
  const b = dockBounds({ viewportHeight: 800, size: 44, floorOffset: 100, topInset: 72, margin: 16 });
  assert.deepEqual(b, { floor: 116, ceiling: 668 });
  assert.equal(clampDockBottom(0, b), 116);
  assert.equal(clampDockBottom(9999, b), 668);
  assert.equal(clampDockBottom(300, b), 300);
  assert.equal(clampDockBottom(NaN, b), 116);
  const tiny = dockBounds({ viewportHeight: 100, size: 44, floorOffset: 100, topInset: 72, margin: 16 });
  assert.equal(tiny.ceiling, tiny.floor);
});

test('nudge', () => {
  assert.equal(nudge('ArrowUp', false), 16);
  assert.equal(nudge('ArrowDown', true), -64);
  assert.equal(nudge('Home', false), 'ceiling');
  assert.equal(nudge('End', false), 'floor');
  assert.equal(nudge('a', false), null);
});

test('parseStoredBottom', () => {
  for (const bad of [null, 'abc', '-5', 'Infinity', '']) assert.equal(parseStoredBottom(bad), null);
  assert.equal(parseStoredBottom('120'), 120);
});

test('labels', () => {
  assert.equal(dockLabel('failed', summarize([item('failed')]), 0), '1 upload failed. Open uploads');
  assert.equal(dockLabel('done', summarize([]), 0), 'Uploads done. Open uploads');
  assert.match(dockLabel('uploading', summarize([item('uploading', { progress: 0.45 })]), 0), /1 file left, 45%/);
});

test('reducer: auto-open only on new failures', () => {
  let s = dockReducer(INITIAL_DOCK, { type: 'batch-started' });
  assert.equal(s.batchId, 1);
  s = dockReducer(s, { type: 'minimise', failed: 2 });
  assert.equal(s.minimised, true);
  assert.equal(dockReducer(s, { type: 'failed-changed', failed: 2 }).minimised, true);
  assert.equal(shouldAutoOpen(s, 3), true);
  const opened = dockReducer(s, { type: 'failed-changed', failed: 3 });
  assert.equal(opened.minimised, false);
  assert.equal(opened.failedAck, 3);
  // retry: failures drop to 0, minimise, then one new failure re-opens
  let t = dockReducer(s, { type: 'failed-changed', failed: 0 });
  assert.equal(t.failedAck, 0);
  assert.equal(t.minimised, true);
  assert.equal(dockReducer(t, { type: 'failed-changed', failed: 1 }).minimised, false);
});

test('reducer: done stays minimised; expand keeps ack; new batch resets', () => {
  const m = dockReducer(INITIAL_DOCK, { type: 'minimise', failed: 0 });
  assert.equal(dockReducer(m, { type: 'failed-changed', failed: 0 }).minimised, true);
  const m2 = dockReducer(INITIAL_DOCK, { type: 'minimise', failed: 2 });
  assert.equal(dockReducer(m2, { type: 'expand' }).failedAck, 2);
  assert.deepEqual(dockReducer(m2, { type: 'batch-started' }), { batchId: 1, minimised: false, failedAck: 0 });
});
