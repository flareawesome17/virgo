import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { createAudioPlayer, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { nextVoiceRate, type VoiceRate } from '@/src/api';
import { enterVoiceMode, setVoiceActive } from '@/src/lib/audio-mode';

/**
 * Voice notes in chat (phase 5), played one at a time through one player.
 *
 * Nothing loads until play is tapped (weak-signal rule 6): the bubble shows
 * the length and the waveform, both of which came with the message. Starting
 * one note stops another, and leaving the app stops it, the way a voice note
 * behaves everywhere else. The speed chosen carries over to the next note.
 *
 * Playback only, which every installed build can do: expo-audio has been in
 * the apps since before the OTA base. Recording is voice-recorder.ts.
 */
export interface VoicePlayback {
  /** The note this is about: playing, or paused part-way. Null when none is. */
  id: string | null;
  playing: boolean;
  /** Fetching or buffering: the button shows it is working. */
  loading: boolean;
  positionMs: number;
  durationMs: number;
  rate: VoiceRate;
  /** It wouldn't play: the link lapsed or the connection dropped. A tap tries again. */
  failed: boolean;
}

/** How long a note may take to start before it is called failed. */
const START_TIMEOUT_MS = 20_000;

let player: AudioPlayer | null = null;
let rate: VoiceRate = 1;
let state: VoicePlayback = idle(1);
let startTimer: ReturnType<typeof setTimeout> | undefined;
/** Asks for a fresh link when the one the message came with has lapsed. */
let refresh: (() => Promise<string | null>) | null = null;
const listeners = new Set<() => void>();
const idleByRate = new Map<VoiceRate, VoicePlayback>();

function idle(r: VoiceRate): VoicePlayback {
  return { id: null, playing: false, loading: false, positionMs: 0, durationMs: 0, rate: r, failed: false };
}

function idleFor(r: VoiceRate): VoicePlayback {
  let found = idleByRate.get(r);
  if (!found) {
    found = idle(r);
    idleByRate.set(r, found);
  }
  return found;
}

function set(patch: Partial<VoicePlayback>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function onStatus(status: AudioStatus): void {
  if (!state.id) return;
  if (status.isLoaded) clearTimeout(startTimer);
  if (status.didJustFinish) {
    // Back to the start, paused, the way it was before play.
    player?.pause();
    void player?.seekTo(0).catch(() => undefined);
    setVoiceActive(false);
    set({ playing: false, loading: false, positionMs: 0 });
    return;
  }
  const duration = status.duration > 0 ? Math.round(status.duration * 1000) : state.durationMs;
  set({
    playing: status.playing,
    loading: state.playing && (!status.isLoaded || status.isBuffering),
    positionMs: Math.min(duration || Infinity, Math.max(0, Math.round(status.currentTime * 1000))),
    durationMs: duration,
  });
}

function ensurePlayer(): AudioPlayer {
  if (player) return player;
  player = createAudioPlayer(null, { updateInterval: 200 });
  player.addListener('playbackStatusUpdate', onStatus);
  return player;
}

function watchStart(): void {
  clearTimeout(startTimer);
  startTimer = setTimeout(() => {
    if (state.id && state.loading) {
      player?.pause();
      setVoiceActive(false);
      set({ playing: false, loading: false, failed: true });
    }
  }, START_TIMEOUT_MS);
}

async function load(url: string): Promise<void> {
  const p = ensurePlayer();
  await enterVoiceMode();
  setVoiceActive(true);
  p.replace({ uri: url });
  // Pitch held, so 2× sounds fast rather than high.
  p.setPlaybackRate(rate, 'high');
  p.play();
  watchStart();
}

/**
 * Plays a note, or carries on with it if it is the one paused. `freshUrl`
 * asks the server for a new link; it is used when the message came without
 * one, and after a try that failed.
 */
export async function playVoice(note: {
  id: string;
  url: string | null;
  durationMs: number | null;
  freshUrl: () => Promise<string | null>;
}): Promise<void> {
  const p = ensurePlayer();
  if (state.id === note.id && !state.failed) {
    await enterVoiceMode();
    setVoiceActive(true);
    p.setPlaybackRate(rate, 'high');
    p.play();
    set({ playing: true });
    return;
  }
  const retry = state.id === note.id && state.failed;
  p.pause();
  refresh = note.freshUrl;
  set({
    id: note.id,
    playing: true,
    loading: true,
    positionMs: 0,
    durationMs: note.durationMs ?? 0,
    rate,
    failed: false,
  });
  try {
    const url = retry || !note.url ? await note.freshUrl() : note.url;
    // Another note was started while the link was fetched.
    if (state.id !== note.id) return;
    if (!url) {
      set({ playing: false, loading: false, failed: true });
      return;
    }
    await load(url);
  } catch {
    if (state.id === note.id) set({ playing: false, loading: false, failed: true });
  }
}

export function pauseVoice(): void {
  if (!state.id || !state.playing) return;
  player?.pause();
  setVoiceActive(false);
  set({ playing: false, loading: false });
}

/** Stops whatever is playing and forgets where it was: leaving a chat. */
export function stopVoice(): void {
  if (!state.id) return;
  clearTimeout(startTimer);
  player?.pause();
  setVoiceActive(false);
  refresh = null;
  state = idleFor(rate);
  for (const listener of listeners) listener();
}

/** Jumps within the note that is playing or paused. */
export function seekVoice(id: string, ms: number): void {
  if (state.id !== id || !player) return;
  const to = Math.max(0, Math.min(state.durationMs || ms, ms));
  void player.seekTo(to / 1000).catch(() => undefined);
  set({ positionMs: to });
}

/** 1× → 1.5× → 2× → 1×, for this note and the ones after it. */
export function cycleVoiceRate(): void {
  rate = nextVoiceRate(rate);
  if (player && state.id) player.setPlaybackRate(rate, 'high');
  set({ rate });
}

/** Whether a fresh link is worth asking for: the last try at this note failed. */
export function voiceNeedsFreshLink(id: string): boolean {
  return state.id === id && state.failed && refresh !== null;
}

// Leaving the app stops the note, as everywhere else: there is no
// background playback for chat.
AppState.addEventListener('change', (next) => {
  if (next !== 'active') pauseVoice();
});

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** One note's playback: its own state when it is the active one, idle otherwise. */
export function useVoicePlayback(id: string | null | undefined): VoicePlayback {
  return useSyncExternalStore(
    subscribe,
    () => (id && state.id === id ? state : idleFor(rate)),
    () => idleFor(rate),
  );
}
