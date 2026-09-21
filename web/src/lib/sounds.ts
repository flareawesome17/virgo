/**
 * Notification sounds.
 *
 * Three, because three kinds of thing want your attention differently: a
 * message from a person, a shoot that is about to start, and everything else.
 * Told apart by ear, you know whether to look now without looking at all.
 *
 * Every part of this is best-effort. A browser that refuses to play, a muted
 * tab, a device with no output — none of them are failures worth surfacing,
 * because the toast and the title-bar count already carried the message. Sound
 * is the part you notice from across the room, not the part that has to work.
 */

export type AlertSound = 'global' | 'chat' | 'event';

/** Kept as the user named them, so the file matches what it is for. */
const FILES: Record<AlertSound, string> = {
  global: '/sounds/globalNotification.mp3',
  chat: '/sounds/chatNotification.mp3',
  event: '/sounds/upcomingEvents.mp3',
};

const STORAGE_KEY = 'virgo.sound';

/**
 * The floor on how close together two sounds may land.
 *
 * Accepting a job fires a notification and opens a chat, which is two frames
 * in the same instant; being added to a workspace with five albums is more.
 * Without a gap they overlap into a noise that says less than one clean tone.
 *
 * A floor rather than the whole rule: these files run from 1s to nearly 4s,
 * so a fixed gap would let a long one be cut off and restarted halfway
 * through, which sounds like a fault rather than like two notifications. The
 * check below also waits for whatever is playing to finish.
 */
const MIN_GAP_MS = 800;

let lastPlayedAt = 0;
let playing: HTMLAudioElement | null = null;
const players = new Map<AlertSound, HTMLAudioElement>();

/**
 * The choice storage would not keep.
 *
 * Null while storage works, which is almost always. When a write is refused
 * the choice is held here for the rest of the visit instead, so the switch
 * goes on showing it and `playAlert` goes on obeying it.
 */
let unsaved: boolean | null = null;

const listeners = new Set<() => void>();

/**
 * Whether sounds are on. Defaults to on, and stored per browser rather than
 * on the account: whether this room wants noise is a property of where you
 * are sitting, not of who you are.
 */
export function soundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (unsaved !== null) return unsaved;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    // Storage blocked entirely (private mode, or third-party cookie rules).
    return true;
  }
}

export function setSoundEnabled(on: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
    unsaved = null;
  } catch {
    // Not persisting a preference is survivable; failing to set it is not
    // worth an error in front of somebody who just flipped a switch.
    unsaved = on;
  }
  for (const listener of listeners) listener();
}

/**
 * Subscribes to `soundEnabled()`, for useSyncExternalStore. Announces every
 * change made through `setSoundEnabled`.
 */
export function subscribeToSoundEnabled(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function playerFor(sound: AlertSound): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  let audio = players.get(sound);
  if (!audio) {
    audio = new Audio(FILES[sound]);
    // 'auto' would fetch all three on load for a signal most sessions never
    // hear. Metadata is enough to have it ready without the bytes.
    audio.preload = 'metadata';
    audio.volume = 0.6;
    players.set(sound, audio);
  }
  return audio;
}

/**
 * Plays one of the three, if sound is on and one did not just play.
 *
 * Never throws and never rejects. The common reason a browser refuses is that
 * the user has not interacted with the page yet — see primeSounds — and an
 * unhandled rejection for that would be noise in the console on every load.
 */
export function playAlert(sound: AlertSound): void {
  if (!soundEnabled()) return;

  const now = Date.now();
  if (now - lastPlayedAt < MIN_GAP_MS) return;
  // Never talk over the previous one. A second notification is worth less than
  // the first one being audible all the way through.
  if (playing && !playing.paused && !playing.ended) return;

  const audio = playerFor(sound);
  if (!audio) return;
  lastPlayedAt = now;
  playing = audio;

  try {
    // Rewound rather than played from wherever it stopped: two messages in a
    // row should sound the same, and a half-finished tone sounds like a fault.
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // Autoplay refused, or the file is missing. Either way the toast stands.
      playing = null;
    });
  } catch {
    // Some browsers throw synchronously on currentTime before metadata loads.
    playing = null;
  }
}

/**
 * Buys permission to make noise later.
 *
 * Browsers block audio until the user has interacted with the page, and the
 * first notification of a session usually arrives before that has happened —
 * so the sound that matters most is exactly the one that gets refused. A
 * muted play on the first real interaction spends that gesture on unlocking
 * playback, after which the rest of the session can sound freely.
 *
 * Returns a cleanup function.
 */
export function primeSounds(): () => void {
  if (typeof window === 'undefined') return () => {};

  let done = false;
  const unlock = () => {
    if (done) return;
    done = true;
    for (const sound of Object.keys(FILES) as AlertSound[]) {
      const audio = playerFor(sound);
      if (!audio) continue;
      const restore = audio.volume;
      audio.muted = true;
      void audio
        .play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
        })
        .catch(() => {
          // Still refused. Nothing more to try, and nothing is broken.
        })
        .finally(() => {
          audio.muted = false;
          audio.volume = restore;
        });
    }
    remove();
  };

  const remove = () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };

  // pointerdown and keydown both count as interaction, and both fire before
  // the user has committed to anything — no need to wait for a click.
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  return remove;
}
