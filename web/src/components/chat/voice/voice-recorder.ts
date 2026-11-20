'use client';

import { useSyncExternalStore } from 'react';
import { MAX_VOICE_MS, MIN_VOICE_MS, VOICE_BIT_RATE } from '@/api';
import { IS_DESKTOP } from '@/lib/desktop';

/*
 * Recording a voice note on this computer (chat phase 5).
 *
 * Click the mic, talk, click Send: on a keyboard and a mouse there is no
 * thumb to hold down, so the composer becomes a recorder bar until Send or
 * Discard. One recording at a time, held here rather than in the thread so
 * the clock and the bars ticking ten times a second redraw the bar and
 * nothing else.
 *
 * The length is measured here, from the clock, rather than read from what
 * the browser made: Chrome's WebM says nothing about how long it is. The
 * server measures it again when it arrives.
 *
 * The microphone is let go of every time it stops: the tracks are stopped
 * and the audio context closed, so the browser's recording light goes out.
 */

/** How many live bars the recorder bar draws, newest on the right. */
export const RECORDER_LEVELS = 28;

/** How often the clock and the bars move. */
const TICK_MS = 80;

/**
 * What to record as, best first: AAC is what the server makes anyway, and
 * what Safari and the Mac app record; Chrome and Edge fall to Opus in WebM,
 * Firefox to Opus in WebM or Ogg. None of these: the browser's own default.
 */
const MIME_TYPES = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
] as const;

export type RecorderPhase = 'idle' | 'starting' | 'recording';

/** A finished recording, ready to go. */
export interface VoiceTake {
  blob: Blob;
  /** What the browser recorded it as: `recorder.mimeType`. */
  mimeType: string;
  /** How long it is, by the clock, in whole milliseconds. */
  durationMs: number;
}

export interface RecorderMeter {
  elapsedMs: number;
  /** RECORDER_LEVELS values from 0 to 1, oldest first. */
  levels: readonly number[];
}

/** Why it couldn't record, in words: a title, and what to do about it. */
export interface MicrophoneProblem {
  title: string;
  description: string;
}

export interface RecorderHandlers {
  onTake: (take: VoiceTake) => void;
  onProblem: (problem: MicrophoneProblem) => void;
  /** Stopped before MIN_VOICE_MS: nothing is sent. */
  onTooShort: () => void;
}

interface Session {
  handlers: RecorderHandlers;
  stream: MediaStream | null;
  recorder: MediaRecorder | null;
  context: AudioContext | null;
  analyser: AnalyserNode | null;
  samples: Uint8Array<ArrayBuffer> | null;
  chunks: Blob[];
  /** performance.now() when recording began; 0 until it has. */
  startedAt: number;
  mimeType: string;
  tick?: ReturnType<typeof setInterval>;
  limit?: ReturnType<typeof setTimeout>;
}

const FLAT: readonly number[] = new Array<number>(RECORDER_LEVELS).fill(0);
const RESTING: RecorderMeter = { elapsedMs: 0, levels: FLAT };

let phase: RecorderPhase = 'idle';
let meter: RecorderMeter = RESTING;
let session: Session | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setPhase(next: RecorderPhase): void {
  phase = next;
  if (next === 'idle') meter = RESTING;
  emit();
}

/** Whether this browser can record at all: hidden where it can't, never offered to fail. */
export function voiceRecordingSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder === 'function' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

const never = () => () => undefined;

/** False on the server and before hydration, so the first paint matches. */
export function useCanRecordVoice(): boolean {
  return useSyncExternalStore(never, voiceRecordingSupported, () => false);
}

export function useRecorderPhase(): RecorderPhase {
  return useSyncExternalStore(subscribe, () => phase, () => 'idle' as const);
}

export function useRecorderMeter(): RecorderMeter {
  return useSyncExternalStore(subscribe, () => meter, () => RESTING);
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  return MIME_TYPES.find((type) => {
    try {
      return MediaRecorder.isTypeSupported(type);
    } catch {
      return false;
    }
  });
}

/** Where to allow the microphone again, wherever Virgo is running. */
function whereToAllow(): string {
  const inApp = IS_DESKTOP || (typeof window !== 'undefined' && '__TAURI__' in window);
  if (!inApp) return "your browser's site settings";
  const os = process.env.NEXT_PUBLIC_DESKTOP_OS;
  if (os === 'macos') return 'System Settings › Privacy & Security › Microphone';
  if (os === 'windows') return 'Windows Settings › Privacy › Microphone';
  // The Linux build, or one staged without an OS: no single place to name.
  if (typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent)) {
    return 'System Settings › Privacy & Security › Microphone';
  }
  if (typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)) {
    return 'Windows Settings › Privacy › Microphone';
  }
  return "your computer's privacy settings";
}

/** A refusal from getUserMedia or the recorder, said plainly. */
export function microphoneProblem(err: unknown): MicrophoneProblem {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return {
      title: 'The microphone is blocked for Virgo',
      description: `Allow it in ${whereToAllow()}, then try again.`,
    };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return {
      title: 'No microphone found',
      description: 'Plug one in or turn it on, then try again.',
    };
  }
  return {
    title: "Couldn't start recording",
    description: 'Try again. If it keeps happening, check that no other app is using the microphone.',
  };
}

/** Lets go of the microphone: tracks stopped, timers cleared, the audio context closed. */
function release(s: Session): void {
  clearInterval(s.tick);
  clearTimeout(s.limit);
  s.stream?.getTracks().forEach((track) => track.stop());
  s.stream = null;
  const context = s.context;
  s.context = null;
  s.analyser = null;
  if (context && context.state !== 'closed') void context.close().catch(() => undefined);
}

/** How loud the microphone is right now, 0 to 1, as the eye reads it. */
function sampleLevel(s: Session): number {
  if (!s.analyser || !s.samples) return 0;
  s.analyser.getByteTimeDomainData(s.samples);
  let sum = 0;
  for (const value of s.samples) {
    const centred = (value - 128) / 128;
    sum += centred * centred;
  }
  const rms = Math.sqrt(sum / s.samples.length);
  // Speech sits around 0.02–0.3; the square root spreads it across the bar.
  return Math.min(1, Math.sqrt(rms) * 1.6);
}

function tick(s: Session): void {
  if (session !== s || !s.startedAt) return;
  const levels = [...meter.levels.slice(1), sampleLevel(s)];
  meter = { elapsedMs: Math.min(MAX_VOICE_MS, performance.now() - s.startedAt), levels };
  emit();
}

/** Stopped from outside (the microphone unplugged, the recorder failing): said, and nothing sent. */
function broke(s: Session, problem: MicrophoneProblem): void {
  if (session !== s) return;
  session = null;
  if (s.recorder && s.recorder.state !== 'inactive') {
    s.recorder.ondataavailable = null;
    s.recorder.onstop = null;
    try {
      s.recorder.stop();
    } catch {
      // Already stopping.
    }
  }
  release(s);
  setPhase('idle');
  s.handlers.onProblem(problem);
}

/**
 * Asks for the microphone and starts recording. Called from the mic's click,
 * so the audio context it makes is allowed to run.
 */
export async function startRecording(handlers: RecorderHandlers): Promise<void> {
  if (session || !voiceRecordingSupported()) return;
  const s: Session = {
    handlers,
    stream: null,
    recorder: null,
    context: null,
    analyser: null,
    samples: null,
    chunks: [],
    startedAt: 0,
    mimeType: '',
  };
  session = s;
  setPhase('starting');

  // Made inside the click: one made after the permission prompt can start
  // suspended. Only for the live bars; recording works without it.
  try {
    const Context =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    s.context = Context ? new Context() : null;
  } catch {
    s.context = null;
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
  } catch (err) {
    release(s);
    if (session !== s) return;
    session = null;
    setPhase('idle');
    handlers.onProblem(microphoneProblem(err));
    return;
  }
  s.stream = stream;
  // Discarded, or the chat changed, while the browser was asking.
  if (session !== s) {
    release(s);
    return;
  }

  const mimeType = pickMimeType();
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: VOICE_BIT_RATE,
    });
  } catch {
    try {
      recorder = new MediaRecorder(stream);
    } catch (err) {
      broke(s, microphoneProblem(err));
      return;
    }
  }
  s.recorder = recorder;
  s.mimeType = recorder.mimeType || mimeType || '';
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) s.chunks.push(event.data);
  };
  recorder.onerror = () =>
    broke(s, {
      title: 'The recording stopped',
      description: 'Nothing was sent. Try recording it again.',
    });
  // The microphone unplugged, or its permission taken away, mid-recording.
  stream.getAudioTracks().forEach((track) =>
    track.addEventListener('ended', () =>
      broke(s, {
        title: 'The microphone stopped',
        description: 'Nothing was sent. Check the microphone and record it again.',
      }),
    ),
  );

  if (s.context) {
    try {
      const source = s.context.createMediaStreamSource(stream);
      const analyser = s.context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      s.analyser = analyser;
      s.samples = new Uint8Array(analyser.fftSize);
      if (s.context.state === 'suspended') void s.context.resume().catch(() => undefined);
    } catch {
      s.analyser = null;
    }
  }

  try {
    // A slice a second, so a recording cut short still has what came before.
    recorder.start(1000);
  } catch (err) {
    broke(s, microphoneProblem(err));
    return;
  }
  s.startedAt = performance.now();
  meter = RESTING;
  setPhase('recording');
  s.tick = setInterval(() => tick(s), TICK_MS);
  // At the limit it stops and sends by itself.
  s.limit = setTimeout(() => sendRecording(), MAX_VOICE_MS);
}

/**
 * Stops and hands the recording over. Under MIN_VOICE_MS nothing is sent;
 * the handler's onTooShort says so.
 */
export function sendRecording(): void {
  const s = session;
  if (!s) return;
  const recorder = s.recorder;
  if (!recorder || !s.startedAt || recorder.state === 'inactive') {
    discardRecording();
    return;
  }
  session = null;
  clearInterval(s.tick);
  clearTimeout(s.limit);
  const durationMs = Math.round(Math.min(MAX_VOICE_MS, performance.now() - s.startedAt));
  setPhase('idle');

  if (durationMs < MIN_VOICE_MS) {
    recorder.ondataavailable = null;
    recorder.onstop = null;
    try {
      recorder.stop();
    } catch {
      // Already stopping.
    }
    release(s);
    s.handlers.onTooShort();
    return;
  }

  let done = false;
  const deliver = () => {
    if (done) return;
    done = true;
    release(s);
    const type = recorder.mimeType || s.mimeType;
    const blob = new Blob(s.chunks, type ? { type } : undefined);
    if (blob.size === 0) {
      s.handlers.onProblem({
        title: "Couldn't record that",
        description: 'Nothing was sent. Try recording it again.',
      });
      return;
    }
    s.handlers.onTake({ blob, mimeType: type, durationMs });
  };
  recorder.onstop = deliver;
  recorder.onerror = null;
  try {
    recorder.stop();
  } catch {
    deliver();
    return;
  }
  // Should the browser never say it stopped, the microphone is let go of anyway.
  setTimeout(deliver, 3000);
}

/** Stops and throws the recording away: Discard, Escape, leaving the chat. */
export function discardRecording(): void {
  const s = session;
  if (!s) return;
  session = null;
  const recorder = s.recorder;
  if (recorder && recorder.state !== 'inactive') {
    recorder.ondataavailable = null;
    recorder.onstop = null;
    recorder.onerror = null;
    try {
      recorder.stop();
    } catch {
      // Already stopping.
    }
  }
  release(s);
  setPhase('idle');
}
