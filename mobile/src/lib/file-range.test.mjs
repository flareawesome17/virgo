// Run: node --experimental-strip-types --test src/lib/file-range.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { uploadInParts } from '../api/multipart-upload.ts';
import { CopyCancelled, copyRange, FileRange, SourceShrank } from './file-range.ts';

/** A file of `size` bytes, each byte its own index mod 251, so misplaced bytes show. */
const bytesOf = (size) => Uint8Array.from({ length: size }, (_, i) => i % 251);

/**
 * expo-file-system's FileHandle, as each platform behaves.
 *
 * `android` reproduces FileSystemFileHandle.kt: the buffer is allocated at the
 * length asked for (capped at what is left) and returned whole, however much
 * the channel actually filled. `maxRead` caps one read, to force short reads.
 */
function handleOver(data, { android = false, maxRead = Infinity } = {}) {
  const reads = [];
  return {
    reads,
    offset: 0,
    readBytes(length) {
      const start = this.offset;
      const filled = Math.max(0, Math.min(length, data.length - start, maxRead));
      reads.push(length);
      this.offset = start + filled;
      if (!android) return data.slice(start, start + filled);
      const out = new Uint8Array(Math.max(0, Math.min(length, data.length - start)));
      out.set(data.subarray(start, start + filled));
      return out;
    },
  };
}

function sinkInto() {
  const chunks = [];
  return {
    chunks,
    writeBytes(bytes) {
      chunks.push(Uint8Array.from(bytes));
    },
    bytes() {
      return Uint8Array.from(chunks.flatMap((c) => [...c]));
    },
  };
}

describe('FileRange', () => {
  it('measures and slices relative to itself, as Blob.slice does', () => {
    const whole = new FileRange('file:///x.mp4', 0, 100);
    assert.equal(whole.size, 100);

    const part = whole.slice(32, 48);
    assert.deepEqual([part.uri, part.start, part.end, part.size], ['file:///x.mp4', 32, 48, 16]);

    const inner = part.slice(4, 8);
    assert.deepEqual([inner.start, inner.end], [36, 40]);
  });

  it('clamps past the end and counts negatives from it', () => {
    const r = new FileRange('u', 10, 20);
    assert.deepEqual([r.slice(5, 999).start, r.slice(5, 999).end], [15, 20]);
    assert.deepEqual([r.slice(-3).start, r.slice(-3).end], [17, 20]);
    assert.equal(r.slice(8, 2).size, 0, 'end before start is empty, never negative');
    assert.equal(r.slice().size, 10);
  });

  it('cuts exactly the ranges the shared uploader asks for, the last one short', async () => {
    const cut = [];
    const size = 40;
    await uploadInParts(
      new FileRange('file:///film.mp4', 0, size),
      { contentType: 'video/mp4', scope: 'albums', backoff: async () => {} },
      {
        start: async () => ({ key: 'k', uploadId: 'u', partSize: 16, partCount: 3 }),
        partUrl: async () => ({ uploadUrl: 'x', requiredHeaders: {}, expiresAt: '' }),
        putPart: async (part, _t, onLoaded) => {
          assert.ok(part instanceof FileRange, 'putPart receives the range itself');
          cut.push([part.start, part.end]);
          onLoaded(part.size);
          return `"${part.start}"`;
        },
        complete: async (b) => ({ key: b.key, size }),
        abort: async () => {},
      },
    );
    assert.deepEqual(cut.sort((a, b) => a[0] - b[0]), [[0, 16], [16, 32], [32, 40]]);
  });
});

describe('copyRange', () => {
  it('copies exactly the range, a chunk at a time, seeking each read', async () => {
    const data = bytesOf(100);
    const source = handleOver(data);
    const sink = sinkInto();
    const written = await copyRange(source, sink, 30, 75, { chunkBytes: 10 });

    assert.equal(written, 45);
    assert.deepEqual(sink.bytes(), data.slice(30, 75));
    assert.deepEqual(source.reads, [10, 10, 10, 10, 5]);
  });

  it('never asks for more than one chunk, however big the range', async () => {
    const source = handleOver(bytesOf(1000));
    await copyRange(source, sinkInto(), 0, 1000, { chunkBytes: 64 });
    assert.ok(source.reads.every((n) => n <= 64));
  });

  it('drops the zero padding of a short read on Android rather than writing it', async () => {
    const data = bytesOf(50);
    const source = handleOver(data, { android: true, maxRead: 7 });
    const sink = sinkInto();
    await copyRange(source, sink, 0, 50, { chunkBytes: 16 });

    assert.deepEqual(sink.bytes(), data, 'byte for byte, no zeros spliced in');
    assert.ok(sink.chunks.every((c) => c.length <= 7));
  });

  it('copies correctly when every read is short on iOS too', async () => {
    const data = bytesOf(33);
    const sink = sinkInto();
    await copyRange(handleOver(data, { maxRead: 5 }), sink, 3, 33, { chunkBytes: 16 });
    assert.deepEqual(sink.bytes(), data.slice(3, 33));
  });

  it('fails when the file ends before the range does', async () => {
    const source = handleOver(bytesOf(20));
    await assert.rejects(copyRange(source, sinkInto(), 0, 40, { chunkBytes: 16 }), SourceShrank);
  });

  it('fails rather than looping when a read makes no progress', async () => {
    const stuck = { offset: 0, readBytes: (n) => new Uint8Array(n) };
    // Offset never moves: Android's padded buffer with nothing behind it.
    const pinned = {
      get offset() {
        return 0;
      },
      set offset(_v) {},
      readBytes: stuck.readBytes,
    };
    await assert.rejects(copyRange(pinned, sinkInto(), 0, 10, { chunkBytes: 4 }), SourceShrank);
  });

  it('stops between chunks when cancelled', async () => {
    let reads = 0;
    const source = handleOver(bytesOf(100));
    const original = source.readBytes.bind(source);
    source.readBytes = (n) => {
      reads++;
      return original(n);
    };
    await assert.rejects(
      copyRange(source, sinkInto(), 0, 100, { chunkBytes: 10, isCancelled: () => reads >= 3 }),
      CopyCancelled,
    );
    assert.equal(reads, 3);
  });

  it('pauses between chunks, not after the last', async () => {
    let pauses = 0;
    await copyRange(handleOver(bytesOf(30)), sinkInto(), 0, 30, {
      chunkBytes: 10,
      pause: async () => {
        pauses++;
      },
    });
    assert.equal(pauses, 2);
  });

  it('copies nothing for an empty range', async () => {
    const sink = sinkInto();
    assert.equal(await copyRange(handleOver(bytesOf(10)), sink, 4, 4, { chunkBytes: 4 }), 0);
    assert.equal(sink.chunks.length, 0);
  });
});
