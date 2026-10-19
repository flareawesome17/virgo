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
const logger = { warn: jest.fn(), error: jest.fn() } as unknown as Logger;

describe('streamZip', () => {
  it('opens the next object while the current one is still being appended', async () => {
    const order: string[] = [];
    const open = jest.fn(async (key: string) => { order.push(`open ${key}`); return Readable.from([key]); });
    await streamZip(res(), 'a.zip', [{ key: 'a', name: 'a' }, { key: 'b', name: 'b' }, { key: 'c', name: 'c' }], open, logger);
    expect(order).toEqual(['open a', 'open b', 'open c']);
    expect(open).toHaveBeenCalledTimes(3);
  });

  it('skips one unreadable file but still delivers the rest', async () => {
    const open = jest.fn(async (key: string) => { if (key === 'b') throw new Error('gone'); return Readable.from([key]); });
    await streamZip(res(), 'a.zip', [{ key: 'a', name: 'a' }, { key: 'b', name: 'b' }, { key: 'c', name: 'c' }], open, logger);
    expect(open).toHaveBeenCalledTimes(3);
  });
});
