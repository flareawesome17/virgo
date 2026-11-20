import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * What a voice note may arrive as. A phone records AAC in an .m4a; a browser
 * records whatever its MediaRecorder offers: Opus in WebM (Chrome, Edge,
 * Firefox, the Windows desktop app), Opus in Ogg (older Firefox), or AAC in
 * MP4 (Safari, the Mac desktop app). All of it is re-encoded on arrival.
 */
export const CHAT_VOICE_TYPES = [
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
  'audio/webm',
  'audio/ogg',
] as const;

/** The plan's limit: hold to record, up to two minutes. */
export const MAX_VOICE_MS = 120_000;
/**
 * What is accepted: the limit and a moment more, since a phone stops its
 * recorder a beat after its timer reads 2:00.
 */
export const MAX_VOICE_MS_ACCEPTED = 125_000;
/** Shorter than this is a tap, not a voice note. */
export const MIN_VOICE_MS = 300;
/**
 * Headroom, not a target: two minutes at 24 kbps is about 360 KB, and a
 * browser that ignores the bitrate it was asked for still fits.
 */
export const MAX_CHAT_VOICE_BYTES = 5 * 1024 * 1024;

/** Bars in a voice note's waveform. The apps draw fewer by merging them. */
export const VOICE_BARS = 48;

/**
 * AAC-LC, one channel, 22.05 kHz, 24 kbps, with the index at the front so
 * playback can start before the whole file has loaded: about 180 KB a
 * minute. It plays on every iPhone, Android phone and browser, where the
 * Opus most browsers record does not play on an iPhone.
 */
const VOICE_BITRATE = '24k';
const VOICE_RATE = '22050';
/** The waveform is measured on a copy at telephone rate: it only needs levels. */
const LEVELS_RATE = 8000;
/** A two-minute note takes a second or two; one that hasn't finished by now won't. */
const ENCODE_TIMEOUT_MS = 60_000;

export const VOICE_CONTENT_TYPE = 'audio/mp4';
export const VOICE_NAME = 'Voice note.m4a';

/**
 * The 16-bit samples inside a WAV file. Reads the chunks rather than
 * assuming a 44-byte header, since an encoder may write others first.
 * Returns null when it isn't a WAV this could have made.
 */
export function wavSamples(wav: Buffer): Buffer | null {
  if (wav.length < 12 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    return null;
  }
  let at = 12;
  while (at + 8 <= wav.length) {
    const id = wav.toString('ascii', at, at + 4);
    const size = wav.readUInt32LE(at + 4);
    const start = at + 8;
    if (id === 'data') {
      // ffmpeg writing to a file it can seek fills the size in; a size past
      // the end (a stream it could not seek) means "the rest of the file".
      const end = Math.min(wav.length, size > 0 ? start + size : wav.length);
      return wav.subarray(start, end - ((end - start) % 2));
    }
    at = start + size + (size % 2);
  }
  return null;
}

/**
 * A voice note's shape: `bars` levels from 0 to 100, the loudness of each
 * stretch against the loudest one. Loudness is the root mean square, eased
 * so quiet speech still shows as more than a flat line.
 */
export function voiceWaveform(samples: Buffer, bars = VOICE_BARS): number[] {
  const count = Math.floor(samples.length / 2);
  if (count === 0) return new Array<number>(bars).fill(0);
  const per = count / bars;
  const levels: number[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const start = Math.floor(bar * per);
    const end = Math.max(start + 1, Math.min(count, Math.floor((bar + 1) * per)));
    let sum = 0;
    for (let i = start; i < end && i < count; i++) {
      const sample = samples.readInt16LE(i * 2) / 32768;
      sum += sample * sample;
    }
    levels.push(start < count ? Math.sqrt(sum / (end - start)) : 0);
  }
  const loudest = Math.max(...levels);
  if (loudest <= 0) return levels.map(() => 0);
  return levels.map((level) => Math.min(100, Math.round(Math.pow(level / loudest, 0.7) * 100)));
}

export interface VoiceNote {
  /** AAC in an .m4a, ready to store. */
  audio: Buffer;
  durationMs: number;
  waveform: number[];
}

/**
 * Re-encodes a recording as the one format every app plays, and measures it,
 * in one run of ffmpeg with two outputs: the .m4a, and a WAV at telephone
 * rate whose samples give the length and the waveform. Metadata is dropped,
 * and only the first audio stream is kept, whatever else the file carried.
 *
 * Throws when ffmpeg can't read it; returns null when it reads as too short
 * or too long to be a voice note.
 */
export async function encodeVoiceNote(source: Buffer): Promise<VoiceNote | null> {
  const folder = await mkdtemp(join(tmpdir(), 'virgo-voice-'));
  const input = join(folder, 'in');
  const output = join(folder, 'voice.m4a');
  const levels = join(folder, 'levels.wav');
  try {
    await writeFile(input, source);
    await run(
      'ffmpeg',
      [
        '-v', 'error',
        '-nostdin',
        '-i', input,
        // Past the limit, ffmpeg stops reading: an hour-long file costs no
        // more than a voice note before it is refused.
        '-t', String(MAX_VOICE_MS_ACCEPTED / 1000 + 1),
        '-map', '0:a:0',
        '-vn', '-sn', '-dn',
        '-map_metadata', '-1',
        '-ac', '1',
        '-ar', VOICE_RATE,
        '-c:a', 'aac',
        '-b:a', VOICE_BITRATE,
        '-movflags', '+faststart',
        '-f', 'mp4',
        '-y', output,
        '-t', String(MAX_VOICE_MS_ACCEPTED / 1000 + 1),
        '-map', '0:a:0',
        '-ac', '1',
        '-ar', String(LEVELS_RATE),
        '-c:a', 'pcm_s16le',
        '-f', 'wav',
        '-y', levels,
      ],
      { timeout: ENCODE_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
    );
    const samples = wavSamples(await readFile(levels));
    if (!samples) return null;
    const durationMs = Math.round((samples.length / 2 / LEVELS_RATE) * 1000);
    if (durationMs < MIN_VOICE_MS || durationMs > MAX_VOICE_MS_ACCEPTED) return null;
    return {
      audio: await readFile(output),
      durationMs,
      waveform: voiceWaveform(samples),
    };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

/** "0:32", "1:05": how long a voice note is, as the bubble and the push say it. */
export function voiceLength(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
