'use client';

import { useSyncExternalStore } from 'react';
import { nextVoiceRate, type VoiceRate } from '@/api';

/*
 * Voice notes in chat (phase 5), played one at a time through one audio
 * element, as the phone does it (mobile/src/lib/voice-player.ts).
 *
 * Nothing loads until play is clicked (weak-signal rule 6): the element is
 * `preload="none"`, and the bubble draws its length and waveform from what
 * came with the message. Starting one note stops another; leaving the chat or
 * hiding the page pauses it. The speed chosen carries over to the next note.
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
  /** It wouldn't play, even from a fresh link. A click tries again. */
  failed: boolean;
}

/** How long a note may take to start before it is called failed. */
const START_TIMEOUT_MS = 20_000;

interface Note {
  id: string;
  /** Asks the server for a new link: after the first one fails, and on a retry. */
  freshUrl: () => Promise<string | null>;
  /** A fresh link has been tried already, so the next failure is the last. */
  triedFresh: boolean;
}

type PitchedAudio = HTMLAudioElement & { webkitPreservesPitch?: boolean; mozPreservesPitch?: boolean };

let audio: PitchedAudio | null = null;
let note: Note | null = null;
let rate: VoiceRate = 1;
let state: VoicePlayback = idle(1);
let startTimer: ReturnType<typeof setTimeout> | undefined;
/** We paused it to switch notes: that pause is not the listener's to report. */
let swallowPause = false;
const listeners = new Set<() => void>();
const idleByRate = new Map<VoiceRate, VoicePlayback>();
const SERVER_IDLE = idle(1);

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

function emit(): void {
  for (const listener of listeners) listener();
}

function set(patch: Partial<VoicePlayback>): void {
  state = { ...state, ...patch };
  emit();
}

/** The speed, with the pitch held, so 2× sounds fast rather than high. */
function applyRate(el: PitchedAudio): void {
  el.preservesPitch = true;
  el.webkitPreservesPitch = true;
  el.mozPreservesPitch = true;
  // The default too: loading a new source resets the rate to it.
  el.defaultPlaybackRate = rate;
  el.playbackRate = rate;
}

function fail(): void {
  clearTimeout(startTimer);
  if (audio && !audio.paused) {
    swallowPause = true;
    audio.pause();
  }
  set({ playing: false, loading: false, failed: true });
}

function watchStart(): void {
  clearTimeout(startTimer);
  startTimer = setTimeout(() => {
    if (state.id && state.loading) fail();
  }, START_TIMEOUT_MS);
}

/** The link didn't load: once with a fresh one, then "Couldn't play". */
async function onError(): Promise<void> {
  const current = note;
  if (!current || state.id !== current.id) return;
  clearTimeout(startTimer);
  if (!current.triedFresh) {
    current.triedFresh = true;
    set({ playing: true, loading: true });
    try {
      const url = await current.freshUrl();
      if (note !== current) return;
      if (url) {
        load(url, state.positionMs);
        return;
      }
    } catch {
      if (note !== current) return;
    }
  }
  fail();
}

function ensureAudio(): PitchedAudio {
  if (audio) return audio;
  const el: PitchedAudio = new Audio();
  el.preload = 'none';
  el.addEventListener('playing', () => {
    if (!state.id) return;
    clearTimeout(startTimer);
    set({ playing: true, loading: false, failed: false });
  });
  el.addEventListener('waiting', () => {
    if (state.id && state.playing) set({ loading: true });
  });
  el.addEventListener('pause', () => {
    if (swallowPause) {
      swallowPause = false;
      return;
    }
    // Paused from outside: a media key, headphones unplugged.
    if (state.id && state.playing && el.paused && !el.ended) set({ playing: false, loading: false });
  });
  el.addEventListener('timeupdate', () => {
    if (!state.id || el.ended) return;
    set({ positionMs: Math.max(0, Math.round(el.currentTime * 1000)) });
  });
  el.addEventListener('durationchange', () => {
    // A WebM straight from a recorder says Infinity: the length it came with stands.
    const seconds = el.duration;
    if (state.id && Number.isFinite(seconds) && seconds > 0) set({ durationMs: Math.round(seconds * 1000) });
  });
  el.addEventListener('ended', () => {
    if (!state.id) return;
    clearTimeout(startTimer);
    // Back to the start, paused, the way it was before play; still loaded,
    // so playing it again downloads nothing.
    set({ playing: false, loading: false, positionMs: 0 });
  });
  el.addEventListener('error', () => {
    if (el.getAttribute('src')) void onError();
  });
  // A hidden page pauses it: there is no background playback for chat.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pauseVoice();
  });
  audio = el;
  return el;
}

function startPlaying(el: PitchedAudio): void {
  const started = el.play();
  started?.catch((err: unknown) => {
    if (!state.id) return;
    // Refused without a click to go on (Safari after a wait for a link):
    // shown as paused, so the next click plays it. AbortError means another
    // note took over; a source that won't play arrives as an `error` event.
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      clearTimeout(startTimer);
      set({ playing: false, loading: false });
    }
  });
}

function load(url: string, startMs: number): void {
  const el = ensureAudio();
  // With preload="none", nothing is fetched until play() below.
  el.src = url;
  applyRate(el);
  if (startMs > 0) el.currentTime = startMs / 1000;
  watchStart();
  startPlaying(el);
}

/**
 * Plays a note, or carries on with it if it is the one paused. `url` is the
 * link it came with, or this computer's own copy; `freshUrl` asks the server
 * for a new one, used when there is none, after a try that failed, and on a
 * retry. `startMs` starts it part-way: a click on its waveform.
 */
export function playVoice(input: {
  id: string;
  url: string | null;
  durationMs: number | null;
  freshUrl: () => Promise<string | null>;
  startMs?: number;
}): void {
  const el = ensureAudio();
  const startMs = Math.max(0, input.startMs ?? 0);
  if (state.id === input.id && note && !state.failed) {
    if (input.startMs !== undefined) el.currentTime = startMs / 1000;
    applyRate(el);
    set({ playing: true, loading: el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA });
    if (el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) watchStart();
    startPlaying(el);
    return;
  }

  const retry = state.id === input.id && state.failed;
  if (!el.paused) {
    swallowPause = true;
    el.pause();
  }
  clearTimeout(startTimer);
  const current: Note = { id: input.id, freshUrl: input.freshUrl, triedFresh: retry };
  note = current;
  state = {
    id: input.id,
    playing: true,
    loading: true,
    positionMs: startMs,
    durationMs: input.durationMs ?? 0,
    rate,
    failed: false,
  };
  emit();

  if (!retry && input.url) {
    // Straight from the click, so the browser lets it play.
    load(input.url, startMs);
    return;
  }
  current.freshUrl().then(
    (url) => {
      if (note !== current) return;
      if (url) load(url, startMs);
      else fail();
    },
    () => {
      if (note === current) fail();
    },
  );
}

export function pauseVoice(): void {
  if (!state.id || (!state.playing && !state.loading)) return;
  clearTimeout(startTimer);
  audio?.pause();
  set({ playing: false, loading: false });
}

/** Stops whatever is playing and forgets it: leaving a chat. */
export function stopVoice(): void {
  if (!state.id) return;
  clearTimeout(startTimer);
  note = null;
  if (audio) {
    if (!audio.paused) {
      swallowPause = true;
      audio.pause();
    }
    // Drops what was buffered, and any download still going.
    audio.removeAttribute('src');
    audio.load();
  }
  state = idleFor(rate);
  emit();
}

/** Jumps within the note that is playing or paused. */
export function seekVoice(id: string, ms: number): void {
  if (state.id !== id || !audio) return;
  const to = Math.max(0, Math.min(state.durationMs || ms, ms));
  audio.currentTime = to / 1000;
  set({ positionMs: Math.round(to) });
}

/** 1× → 1.5× → 2× → 1×, for this note and the ones after it. */
export function cycleVoiceRate(): void {
  rate = nextVoiceRate(rate);
  if (audio && state.id) applyRate(audio);
  set({ rate });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** One note's playback: its own state when it is the active one, idle otherwise. */
export function useVoicePlayback(id: string | null | undefined): VoicePlayback {
  return useSyncExternalStore(
    subscribe,
    () => (id && state.id === id ? state : idleFor(rate)),
    () => SERVER_IDLE,
  );
}
