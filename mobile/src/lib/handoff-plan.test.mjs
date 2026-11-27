// Run: node --experimental-strip-types --test src/lib/handoff-plan.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  fractionSent,
  handoffStanding,
  isWorthAnotherHandoff,
  itemsForTicket,
  nextHandoffBatch,
  taskIdOf,
  withoutContentLength,
} from './handoff-plan.ts';

const MB = 1024 * 1024;

describe('itemsForTicket', () => {
  it('hands over a small file whole, without Content-Length', () => {
    const items = itemsForTicket('t1', 'file:///c/1.jpg', {
      key: 'k',
      contentType: 'image/jpeg',
      size: 4 * MB,
      expiresAt: 'x',
      single: { uploadUrl: 'https://b2/put', requiredHeaders: { 'Content-Type': 'image/jpeg', 'Content-Length': '4194304' } },
    });
    assert.deepEqual(items, [
      { id: 't1', url: 'https://b2/put', headers: { 'Content-Type': 'image/jpeg' }, file: 'file:///c/1.jpg' },
    ]);
  });

  it('hands over a film as byte ranges, the last part short', () => {
    const size = 2 * 16 * MB + 5;
    const parts = [1, 2, 3].map((partNumber) => ({
      partNumber,
      uploadUrl: `https://b2/part${partNumber}`,
      requiredHeaders: { 'Content-Length': 'x' },
    }));
    const items = itemsForTicket('t2', 'file:///c/2.mov', {
      key: 'k',
      contentType: 'video/quicktime',
      size,
      expiresAt: 'x',
      multipart: { uploadId: 'u', partSize: 16 * MB, partCount: 3, parts },
    });
    assert.deepEqual(
      items.map((item) => [item.id, item.offset, item.length, item.headers]),
      [
        ['t2#1', 0, 16 * MB, {}],
        ['t2#2', 16 * MB, 16 * MB, {}],
        ['t2#3', 32 * MB, 5, {}],
      ],
    );
  });

  it('has nothing to hand over for a ticket with neither', () => {
    assert.deepEqual(itemsForTicket('t', 'f', { key: 'k', contentType: 'x', size: 1, expiresAt: 'x' }), []);
  });
});

describe('taskIdOf', () => {
  it('is the item itself for a whole file, and the file for a part', () => {
    assert.equal(taskIdOf('1764-abc'), '1764-abc');
    assert.equal(taskIdOf('1764-abc#12'), '1764-abc');
  });
});

describe('withoutContentLength', () => {
  it('drops it whatever its case, and keeps the rest', () => {
    assert.deepEqual(withoutContentLength({ 'content-length': '1', 'Content-Type': 'a' }), { 'Content-Type': 'a' });
  });
});

describe('handoffStanding', () => {
  const r = (id, status, error) => [id, { id, status, error }];

  it('is still sending until every item is in', () => {
    assert.deepEqual(handoffStanding(['a#1', 'a#2'], new Map([r('a#1', 200)])), { state: 'sending' });
  });

  it('is sent when every item answered 2xx', () => {
    assert.deepEqual(handoffStanding(['a#1', 'a#2'], new Map([r('a#1', 200), r('a#2', 204)])), { state: 'sent' });
  });

  it('has failed as soon as one item did, with that item', () => {
    const standing = handoffStanding(['a#1', 'a#2'], new Map([r('a#2', 403)]));
    assert.equal(standing.state, 'failed');
    assert.equal(standing.result.status, 403);
  });

  it('is never sent with no items', () => {
    assert.deepEqual(handoffStanding([], new Map()), { state: 'sending' });
  });
});

describe('fractionSent', () => {
  it('adds what each part has sent, a finished part counting whole', () => {
    const items = [
      { id: 'a#1', length: 60 },
      { id: 'a#2', length: 40 },
    ];
    const sent = new Map([['a#2', 10]]);
    const done = new Map([['a#1', { id: 'a#1', status: 200 }]]);
    assert.equal(fractionSent(items, 100, sent, done), 0.7);
  });

  it('counts a whole file by its own size, and never passes 1', () => {
    assert.equal(fractionSent([{ id: 'a' }], 100, new Map([['a', 150]]), new Map()), 1);
    assert.equal(fractionSent([{ id: 'a' }], 0, new Map([['a', 5]]), new Map()), 0);
  });
});

describe('nextHandoffBatch', () => {
  it('takes the first album waiting, up to the limit', () => {
    const tasks = [
      { id: 1, albumId: 'x' },
      { id: 2, albumId: 'y' },
      { id: 3, albumId: 'x' },
      { id: 4, albumId: 'x' },
    ];
    assert.deepEqual(nextHandoffBatch(tasks, 2).map((t) => t.id), [1, 3]);
    assert.deepEqual(nextHandoffBatch([], 2), []);
  });
});

describe('isWorthAnotherHandoff', () => {
  it('is no answer, a dead signature, a pause or a server fault', () => {
    for (const status of [0, 403, 408, 429, 500, 503]) {
      assert.equal(isWorthAnotherHandoff({ id: 'a', status }), true, String(status));
    }
  });

  it('is not a refusal of the file itself', () => {
    for (const status of [400, 404, 413]) {
      assert.equal(isWorthAnotherHandoff({ id: 'a', status }), false, String(status));
    }
  });
});
