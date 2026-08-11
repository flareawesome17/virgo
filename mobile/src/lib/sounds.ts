import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/**
 * Notification sounds, for events that arrive while the app is open.
 *
 * Three, because three kinds of thing want your attention differently: a
 * message from a person, a shoot that is about to start, and everything else.
 * Told apart by ear, you know whether to look now without looking at all.
 *
 * Scope is deliberately the foreground only. A backgrounded app is covered by
 * the notification channels in `notifications.ts`, which play the system sound
 * the user chose for that channel — playing our own on top of that would be
 * two sounds for one event, and the one the user picked would lose.
 *
 * Every part of this is best-effort. Silence is an acceptable outcome
 * everywhere: the badge, the toast and the OS notification all still carry the
 * signal.
 */

export type AlertSound = 'global' | 'chat' | 'event';

/**
 * require, not a path string: Metro resolves these at build time so the audio
 * ships inside the bundle. A runtime path would be a file that is not there.
 */
const SOURCES: Record<AlertSound, number> = {
  global: require('../../assets/sounds/globalNotification.mp3'),
  chat: require('../../assets/sounds/chatNotification.mp3'),
  event: require('../../assets/sounds/upcomingEvents.mp3'),
};

const STORAGE_KEY = 'virgo.sound';

/**
 * The floor on how close together two sounds may land.
 *
 * Accepting a job fires a notification and opens a chat, which is two frames
 * in the same instant. Without a gap they overlap into a noise that says less
 * than one clean tone.
 *
 * A floor rather than the whole rule: these files run from 1s to nearly 4s, so
 * a fixed gap would let a long one be cut off and restarted halfway through,
 * which sounds like a fault rather than like two notifications. playAlert also
 * waits for whatever is playing to finish.
 */
const MIN_GAP_MS = 800;

let lastPlayedAt = 0;
let enabled = true;
let modeSet = false;
const players = new Map<AlertSound, AudioPlayer>();

/**
 * Reads the stored preference. Call once at startup.
 *
 * Cached in a module variable afterwards because playAlert is called from a
 * socket frame handler, which cannot wait on storage — an await there would
 * put the sound behind the message it is announcing.
 */
export async function loadSoundPreference(): Promise<boolean> {
  try {
    enabled = (await AsyncStorage.getItem(STORAGE_KEY)) !== 'off';
  } catch {
    enabled = true;
  }
  return enabled;
}

export function soundEnabled(): boolean {
  return enabled;
}

export async function setSoundEnabled(on: boolean): Promise<void> {
  enabled = on;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // The in-memory value already took effect; failing to persist it only
    // costs the setting on next launch, which is not worth an error.
  }
}

/**
 * Makes a notification behave like a notification rather than like music.
 *
 * playsInSilentMode stays false on purpose: the ringer switch means "do not
 * make noise", and an app that talks over it is an app people uninstall.
 * shouldPlayInBackground is false for the same reason the module only covers
 * the foreground.
 */
async function ensureAudioMode(): Promise<void> {
  if (modeSet) return;
  modeSet = true;
  try {
    await setAudioModeAsync({
      playsInSilentMode: false,
      shouldPlayInBackground: false,
      // Ducks whatever is playing rather than stopping it. Somebody editing to
      // music should hear the alert over the track, and still have the track.
      interruptionMode: 'duckOthers',
      shouldRouteThroughEarpiece: false,
    });
  } catch {
    // An older runtime, or web. The player still works with default routing.
  }
}

function playerFor(sound: AlertSound): AudioPlayer | null {
  let player = players.get(sound);
  if (!player) {
    try {
      player = createAudioPlayer(SOURCES[sound]);
      player.volume = 0.6;
      players.set(sound, player);
    } catch {
      return null;
    }
  }
  return player;
}

/** Plays one of the three, if sound is on and one did not just play. */
export function playAlert(sound: AlertSound): void {
  if (!enabled) return;

  const now = Date.now();
  if (now - lastPlayedAt < MIN_GAP_MS) return;
  // Never talk over the previous one. A second notification is worth less than
  // the first one being audible all the way through.
  for (const existing of players.values()) {
    if (existing.playing) return;
  }
  lastPlayedAt = now;

  void (async () => {
    try {
      await ensureAudioMode();
      const player = playerFor(sound);
      if (!player) return;
      // Rewound rather than played from wherever it stopped: two messages in a
      // row should sound the same, and a half-finished tone sounds like a fault.
      await player.seekTo(0);
      player.play();
    } catch {
      // No output route, an unsupported file, or the session was taken by a
      // call. None of these are worth surfacing over a notification.
    }
  })();
}

/** Releases the native players. Used on sign-out. */
export function releaseSounds(): void {
  for (const player of players.values()) {
    try {
      player.remove();
    } catch {
      // Already released.
    }
  }
  players.clear();
}
