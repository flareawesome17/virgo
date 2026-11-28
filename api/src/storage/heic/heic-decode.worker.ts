/**
 * Decodes one HEIC, in a worker thread of its own. See heic-decoder.ts.
 *
 * libheif here is the WebAssembly build (libheif-js), with libde265 for the
 * HEVC inside an iPhone photo. It reads the whole tile grid an iPhone stores
 * a photograph as, applies the file's own rotation and mirroring, and hands
 * back every pixel at the photograph's full size — which ffmpeg, the decoder
 * this replaced, does not do for a grid unless it is new enough.
 *
 * The thread exists for two reasons. A decode is seconds of synchronous CPU,
 * which on the API's own thread would stall every request for as long. And a
 * WebAssembly memory only ever grows: a 48 MP decode leaves hundreds of
 * megabytes reserved for the life of whatever loaded it. A thread that ends
 * after one photograph gives all of it back.
 */
import { readFileSync } from 'node:fs';
import { parentPort, workerData } from 'node:worker_threads';

/** The parts of libheif-js's module this uses. It ships no types. */
interface LibheifImageHandle {
  handle: unknown;
  get_width(): number;
  get_height(): number;
  is_primary(): boolean;
  has_alpha_channel(): boolean;
  free(): void;
}

interface LibheifChannel {
  id: number;
  data: Uint8Array;
  stride: number;
  width: number;
  height: number;
}

interface LibheifModule {
  ready?: Promise<unknown>;
  HeifDecoder: new () => { decode(data: Uint8Array): LibheifImageHandle[] };
  heif_js_decode_image2(
    handle: unknown,
    colorspace: number,
    chroma: number,
  ): Promise<{ code?: number; message?: string; image: unknown; channels: LibheifChannel[] } | null>;
  heif_image_release(image: unknown): void;
  heif_colorspace: { heif_colorspace_RGB: number };
  heif_chroma: { heif_chroma_interleaved_RGB: number; heif_chroma_interleaved_RGBA: number };
  heif_channel: { heif_channel_interleaved: number };
}

/** What the thread sends back: the pixels, or why there are none. */
export type DecodeReply =
  | { ok: true; width: number; height: number; channels: 3 | 4; pixels: Uint8Array }
  | { ok: false; error: string };

async function loadLibheif(): Promise<LibheifModule> {
  // Loaded by path rather than through the package's own `wasm` entry, which
  // reads its .wasm relative to the process's working directory.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const factory = require('libheif-js/libheif-wasm/libheif.js') as (options: {
    wasmBinary: Buffer;
  }) => LibheifModule | Promise<LibheifModule>;
  const wasmBinary = readFileSync(require.resolve('libheif-js/libheif-wasm/libheif.wasm'));
  const lib = await factory({ wasmBinary });
  if (lib.ready) await lib.ready;
  return lib;
}

export async function decodeInThisThread(source: Uint8Array): Promise<DecodeReply> {
  const lib = await loadLibheif();
  const images = new lib.HeifDecoder().decode(source);
  try {
    if (images.length === 0) return { ok: false, error: 'libheif found no image in the file' };
    // The photograph, not a depth map or an HDR gain map stored beside it.
    const primary = images.find((image) => image.is_primary()) ?? images[0];
    const alpha = primary.has_alpha_channel();
    const channels: 3 | 4 = alpha ? 4 : 3;

    const decoded = await lib.heif_js_decode_image2(
      primary.handle,
      lib.heif_colorspace.heif_colorspace_RGB,
      alpha ? lib.heif_chroma.heif_chroma_interleaved_RGBA : lib.heif_chroma.heif_chroma_interleaved_RGB,
    );
    if (!decoded || decoded.code) {
      return { ok: false, error: `libheif could not decode it: ${decoded?.message ?? 'no image'}` };
    }
    try {
      const plane = decoded.channels.find(
        (channel) => channel.id === lib.heif_channel.heif_channel_interleaved,
      );
      if (!plane) return { ok: false, error: 'libheif gave no interleaved plane' };

      // Copied out before the image is released: the plane is a view into the
      // module's memory, and rows may be padded past the picture's width.
      const row = plane.width * channels;
      const pixels = new Uint8Array(row * plane.height);
      if (plane.stride === row) {
        pixels.set(plane.data.subarray(0, row * plane.height));
      } else {
        for (let y = 0; y < plane.height; y++) {
          pixels.set(plane.data.subarray(y * plane.stride, y * plane.stride + row), y * row);
        }
      }
      return { ok: true, width: plane.width, height: plane.height, channels, pixels };
    } finally {
      lib.heif_image_release(decoded.image);
    }
  } finally {
    for (const image of images) image.free();
  }
}

if (parentPort) {
  const port = parentPort;
  const { source } = workerData as { source: Uint8Array };
  decodeInThisThread(source)
    .then((reply) => {
      if (reply.ok) port.postMessage(reply, [reply.pixels.buffer as ArrayBuffer]);
      else port.postMessage(reply);
    })
    .catch((err: unknown) => {
      port.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
    });
}
