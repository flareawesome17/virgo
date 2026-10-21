import { PassThrough, Readable } from 'node:stream';
import type { Logger } from '@nestjs/common';

// archiver is ESM-only; the stream behaviour under test is ours, not its.
// Like the real one: append() only queues, entries are written one at a time,
// 'entry' fires as each one finishes, and an entry's stream errors are never
// heard (it pipes them).
jest.mock('archiver', () => {
  const { PassThrough } = require('node:stream');
  class ZipArchive extends PassThrough {
    private queue: NodeJS.ReadableStream[] = [];
    private busy = false;
    private drained?: () => void;
    append(s: NodeJS.ReadableStream) {
      this.queue.push(s);
      this.next();
    }
    private next() {
      if (this.busy) return;
      const s = this.queue.shift();
      if (!s) {
        this.drained?.();
        return;
      }
      this.busy = true;
      s.on('data', (c: Buffer) => this.write(c));
      s.on('end', () => {
        this.busy = false;
        this.emit('entry', {});
        this.next();
      });
    }
    async finalize() {
      if (this.busy || this.queue.length > 0) await new Promise<void>((r) => (this.drained = r));
      this.end();
    }
    abort() {
      this.destroy();
    }
  }
  return { ZipArchive };
});

import { streamZip, zipInto } from './zip';

function res() {
  const r = new PassThrough() as any;
  r.setHeader = jest.fn();
  r.flushHeaders = jest.fn();
  return r;
}
const fast = { retry: { attempts: 3, delayMs: 0 } };
const logger = { warn: jest.fn(), error: jest.fn() } as unknown as Logger;
const three = [{ key: 'a', name: 'a' }, { key: 'b', name: 'b' }, { key: 'c', name: 'c' }];

/** A source whose end the test decides. */
function held() {
  const s = new PassThrough();
  s.write('x');
  return s;
}

async function collect(out: PassThrough): Promise<string> {
  let body = '';
  out.on('data', (c: Buffer) => (body += c.toString()));
  await new Promise((r) => out.on('close', r));
  return body;
}

describe('zipInto', () => {
  it('opens the next object while the current one is sent, and no further', async () => {
    const sources: Record<string, PassThrough> = {};
    const open = jest.fn(async (key: string) => (sources[key] = held()));
    const out = res();
    const body = collect(out);
    const done = zipInto(out, 'a.zip', three, open, logger, fast);

    await new Promise((r) => setTimeout(r, 20));
    // a is being written and b waits its turn; c is not touched yet.
    expect(open.mock.calls.map(([k]) => k)).toEqual(['a', 'b']);

    sources.a.end();
    await new Promise((r) => setTimeout(r, 20));
    expect(open.mock.calls.map(([k]) => k)).toEqual(['a', 'b', 'c']);

    sources.b.end();
    sources.c.end();
    await done;
    expect(await body).toBe('xxx');
  });

  it('skips one unreadable file but still delivers the rest', async () => {
    const open = jest.fn(async (key: string) => {
      if (key === 'b') throw new Error('gone');
      return Readable.from([key]);
    });
    await streamZip(res(), 'a.zip', three, open, logger, fast);
    expect(open).toHaveBeenCalledTimes(5);
  });

  it('retries a failed open before counting it as a failure', async () => {
    let tries = 0;
    const open = jest.fn(async (key: string) => {
      if (key === 'a' && ++tries < 3) throw new Error('slow');
      return Readable.from([key]);
    });
    const r = res();
    await streamZip(r, 'a.zip', three.slice(0, 2), open, logger, fast);
    expect(open).toHaveBeenCalledTimes(4);
    expect(r.destroyed).toBe(false);
  });

  it('carries on a read that breaks part way from the byte it reached', async () => {
    const open = async (key: string) => {
      if (key !== 'a') return Readable.from([key]);
      const s = new PassThrough();
      s.write('hello');
      setTimeout(() => s.destroy(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })), 10);
      return s;
    };
    const reopen = jest.fn(async (_key: string, from: number) => Readable.from([` world from ${from}`]));
    const out = res();
    const body = collect(out);
    await zipInto(out, 'a.zip', three.slice(0, 2), open, logger, { ...fast, reopen });
    expect(reopen).toHaveBeenCalledWith('a', 5);
    expect(await body).toBe('hello world from 5b');
    expect(out.writableEnded).toBe(true);
  });

  it('ends the zip at once, as a storage failure, when a broken read cannot carry on', async () => {
    const open = async (key: string) => {
      if (key !== 'a') return Readable.from([key]);
      const s = new PassThrough();
      s.write('hel');
      setTimeout(() => s.destroy(new Error('read ECONNRESET')), 10);
      return s;
    };
    const out = res();
    const failed = new Promise<Error>((r) => out.on('error', r));
    // Before the fix this never settled: the archive waited on the dead entry.
    await zipInto(out, 'a.zip', three, open, logger, fast);
    expect(String(await failed)).toContain('Storage unavailable');
  });

  it('closes every stream it opened when the zip ends early', async () => {
    const sources: PassThrough[] = [];
    const open = async () => {
      const s = held();
      sources.push(s);
      return s;
    };
    const out = res();
    const done = zipInto(out, 'a.zip', three, open, logger, fast);
    await new Promise((r) => setTimeout(r, 20));
    expect(sources).toHaveLength(2);
    out.destroy();
    await done;
    await new Promise((r) => setImmediate(r));
    expect(sources.every((s) => s.destroyed)).toBe(true);
  });
});
