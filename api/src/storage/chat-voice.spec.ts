import { spawnSync } from 'node:child_process';
import {
  VOICE_BARS,
  encodeVoiceNote,
  voiceLength,
  voiceWaveform,
  wavSamples,
} from './chat-voice';

/** A mono 16-bit WAV of `seconds` of a tone whose loudness `gain(t)` gives. */
function wav(seconds: number, rate: number, gain: (t: number) => number): Buffer {
  const count = Math.round(seconds * rate);
  const data = Buffer.alloc(count * 2);
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 330 * t) * gain(t) * 32000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

describe('wavSamples', () => {
  it('finds the samples past any chunk before them', () => {
    const plain = wav(0.01, 8000, () => 0.5);
    const list = Buffer.alloc(8 + 6);
    list.write('LIST', 0, 'ascii');
    list.writeUInt32LE(6, 4);
    const withList = Buffer.concat([plain.subarray(0, 36), list, plain.subarray(36)]);
    expect(wavSamples(withList)?.equals(plain.subarray(44))).toBe(true);
  });

  it('says null for anything that is not a WAV', () => {
    expect(wavSamples(Buffer.from('OggS not a wav at all'))).toBeNull();
  });
});

describe('voiceWaveform', () => {
  it('gives 48 levels, loudest at 100, quiet parts low but not flat', () => {
    // A quiet first half, then loud.
    const samples = wav(2, 8000, (t) => (t < 1 ? 0.1 : 1)).subarray(44);
    const levels = voiceWaveform(samples);
    expect(levels).toHaveLength(VOICE_BARS);
    expect(Math.max(...levels)).toBe(100);
    expect(levels[2]).toBeGreaterThan(10);
    expect(levels[2]).toBeLessThan(30);
    expect(levels[40]).toBeGreaterThan(95);
  });

  it('is flat for silence and for nothing', () => {
    expect(voiceWaveform(Buffer.alloc(16_000))).toEqual(new Array(VOICE_BARS).fill(0));
    expect(voiceWaveform(Buffer.alloc(0), 4)).toEqual([0, 0, 0, 0]);
  });
});

describe('voiceLength', () => {
  it('reads as minutes and seconds, never 0:00', () => {
    expect(voiceLength(32_400)).toBe('0:32');
    expect(voiceLength(65_000)).toBe('1:05');
    expect(voiceLength(120_000)).toBe('2:00');
    expect(voiceLength(200)).toBe('0:01');
  });
});

// The re-encode itself, where ffmpeg is installed (the API's image has it).
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
(hasFfmpeg ? describe : describe.skip)('encodeVoiceNote, with ffmpeg', () => {
  it('turns a recording into AAC in an .m4a, measured', async () => {
    const note = await encodeVoiceNote(wav(3, 44_100, (t) => (t < 1 ? 0.2 : 1)));
    expect(note).not.toBeNull();
    // An MP4 container: 'ftyp' four bytes in.
    expect(note!.audio.toString('ascii', 4, 8)).toBe('ftyp');
    expect(note!.durationMs).toBeGreaterThan(2_900);
    expect(note!.durationMs).toBeLessThan(3_100);
    expect(note!.waveform).toHaveLength(VOICE_BARS);
    expect(note!.waveform[2]).toBeLessThan(note!.waveform[40]);
  }, 30_000);

  it('refuses a tap and a recording past the limit', async () => {
    await expect(encodeVoiceNote(wav(0.1, 8000, () => 1))).resolves.toBeNull();
    await expect(encodeVoiceNote(wav(130, 8000, () => 0.5))).resolves.toBeNull();
  }, 30_000);

  it('throws on something that is not audio', async () => {
    await expect(encodeVoiceNote(Buffer.from('not audio at all'))).rejects.toThrow();
  }, 30_000);
});
