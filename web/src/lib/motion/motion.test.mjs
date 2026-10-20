import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MOTION, SPRING_LINEAR } from './tokens.ts';
import { bounceKeyframes, fadeKeyframes, genieKeyframes } from './genie.ts';

const panel = { left: 100, top: 100, width: 352, height: 120 };
const icon = { left: 500, top: 400, width: 44, height: 44 };

test('close starts at identity and ends on the icon', () => {
  const { keyframes, transformOrigin } = genieKeyframes(panel, icon, 'close');
  assert.equal(keyframes[0].transform, 'none');
  const last = keyframes.at(-1);
  assert.match(last.transform, /^translate\(246px, 262px\)/);
  assert.equal(last.opacity, 0);
  assert.equal(transformOrigin, '352px 120px');
});

test('open is close reversed', () => {
  const close = genieKeyframes(panel, icon, 'close').keyframes;
  const open = genieKeyframes(panel, icon, 'open').keyframes;
  assert.equal(open[0].transform, close.at(-1).transform);
  assert.equal(open.at(-1).transform, 'none');
  assert.deepEqual(open.map((f) => f.offset), [0, 0.45, 1]);
});

test('fade never uses transform', () => {
  for (const d of ['in', 'out']) for (const f of fadeKeyframes(d)) assert.equal('transform' in f, false);
});

test('bounce returns to rest', () => {
  const k = bounceKeyframes();
  assert.equal(k[0].transform, 'scale(1)');
  assert.equal(k.at(-1).transform, 'scale(1)');
});

test('tokens are sane', () => {
  for (const v of Object.values(MOTION.duration)) assert.ok(v > 0);
  assert.ok(SPRING_LINEAR.startsWith('linear(0,'));
  assert.ok(MOTION.magnify.hover > 1 && MOTION.magnify.press < 1);
});
