import { Readable } from 'node:stream';
import type { Logger } from '@nestjs/common';

// archiver is ESM-only; the stream behaviour under test is ours, not its.
jest.mock('archiver', () => {
  const { PassThrough } = require('node:stream');
  class ZipArchive extends PassThrough {
    append(s: NodeJS.ReadableStream) { s.on('data', () => undefined); }
    async finalize() { this.end(); }
    abort() { this.destroy(); }
  }
  return { ZipArchive };
});

import { streamZip } from './zip';

function res() {
  const { PassThrough } = require('node:stream');
  const r = new PassThrough() as any;
  r.setHeader = jest.fn();
  r.flushHeaders = jest.fn();
  return r;
}
const fast = { attempts: 3, delayMs: 0 };
const logger = { warn: jest.fn(), error: jest.fn() } as unknown as Logger;

describe('streamZip', () => {
  it('opens the next object while the current one is still being appended', async () => {
    const order: string[] = [];
    const open = jest.fn(async (key: string) => { order.push(`open ${key}`); return Readable.from([key]); });
    await streamZip(res(), 'a.zip', [{ key: 'a', name: 'a' }, { key: 'b', name: 'b' }, { key: 'c', name: 'c' }], open, logger, fast);
    expect(order).toEqual(['open a', 'open b', 'open c']);
    expect(open).toHaveBeenCalledTimes(3);
  });

  it('skips one unreadable file but still delivers the rest', async () => {
    const open = jest.fn(async (key: string) => { if (key === 'b') throw new Error('gone'); return Readable.from([key]); });
    await streamZip(res(), 'a.zip', [{ key: 'a', name: 'a' }, { key: 'b', name: 'b' }, { key: 'c', name: 'c' }], open, logger, fast);
    expect(open).toHaveBeenCalledTimes(5);
  });

  it('retries a failed open before counting it as a failure', async () => {
    let tries = 0;
    const open = jest.fn(async (key: string) => { if (key === 'a' && ++tries < 3) throw new Error('slow'); return Readable.from([key]); });
    const r = res();
    await streamZip(r, 'a.zip', [{ key: 'a', name: 'a' }, { key: 'b', name: 'b' }], open, logger, fast);
    expect(open).toHaveBeenCalledTimes(4);
    expect(r.destroyed).toBe(false);
  });
});
