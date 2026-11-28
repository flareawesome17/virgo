import { decodeHeic } from './heic-decoder';

/**
 * The real thread and the real libheif: what the converter's own spec fakes.
 *
 * No HEIC can be made here — this libheif has no HEVC encoder, and neither
 * does sharp — so a photograph is not decoded in this suite. What it pins is
 * the plumbing every decode depends on: the thread starts, loads the
 * WebAssembly, and comes back with an answer rather than hanging or taking
 * the process down. Decoding real iPhone photos was checked by hand against
 * samples (see the PR).
 */
describe('decodeHeic', () => {
  jest.setTimeout(60_000);

  it('answers a file that is not a HEIC with libheif\'s refusal', async () => {
    await expect(decodeHeic(Buffer.from('this is not a heic file at all'), 30_000)).rejects.toThrow(
      /libheif|no image|HEIF/i,
    );
  });

  it('gives up on a decode that runs past its time, and stops the thread', async () => {
    // Far shorter than the thread takes even to load the WebAssembly.
    await expect(decodeHeic(Buffer.alloc(16), 1)).rejects.toThrow('took longer than');
  });
});
