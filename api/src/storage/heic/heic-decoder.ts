import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import type { DecodeReply } from './heic-decode.worker';

/** A HEIC decoded to plain pixels: RGB, or RGBA when the file has transparency. */
export interface DecodedHeic {
  width: number;
  height: number;
  channels: 3 | 4;
  pixels: Buffer;
}

/**
 * The worker's file beside this one: compiled JavaScript in a build, the
 * TypeScript source under ts-node and jest, which the thread then loads
 * through ts-node's transpiler.
 */
function workerEntry(): { file: string; execArgv?: string[] } {
  if (__filename.endsWith('.ts')) {
    return {
      file: join(__dirname, 'heic-decode.worker.ts'),
      execArgv: ['--require', 'ts-node/register/transpile-only'],
    };
  }
  return { file: join(__dirname, 'heic-decode.worker.js') };
}

/**
 * Decodes a HEIC in a thread that ends when it is done.
 *
 * Rejects when libheif cannot read the file, when the thread dies, and when
 * `timeoutMs` passes first — the thread is then terminated where it stands,
 * which is the only way to stop a WebAssembly decode part-way.
 */
export function decodeHeic(source: Buffer, timeoutMs: number): Promise<DecodedHeic> {
  const { file, execArgv } = workerEntry();
  return new Promise<DecodedHeic>((resolve, reject) => {
    const worker = new Worker(file, {
      // A copy goes to the thread; the caller keeps its buffer.
      workerData: { source: new Uint8Array(source) },
      execArgv,
    });
    let settled = false;
    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      outcome();
      // Ended either way, so its memory goes with it.
      void worker.terminate();
    };
    const timer = setTimeout(() => {
      finish(() => reject(new Error(`HEIC decode took longer than ${Math.round(timeoutMs / 1000)} s`)));
    }, timeoutMs);

    worker.once('message', (reply: DecodeReply) => {
      if (!reply.ok) {
        finish(() => reject(new Error(reply.error)));
        return;
      }
      finish(() =>
        resolve({
          width: reply.width,
          height: reply.height,
          channels: reply.channels,
          pixels: Buffer.from(reply.pixels.buffer, reply.pixels.byteOffset, reply.pixels.byteLength),
        }),
      );
    });
    worker.once('error', (err) => finish(() => reject(err)));
    worker.once('exit', (code) => {
      finish(() => reject(new Error(`The HEIC decoder stopped (exit ${code}) before it answered`)));
    });
  });
}
