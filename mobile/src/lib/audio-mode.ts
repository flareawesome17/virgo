import { setAudioModeAsync } from 'expo-audio';

/**
 * Which of the app's two audio modes is in force.
 *
 * iOS gives an app one audio session, and every setAudioModeAsync replaces it
 * whole. Album audio has to keep playing in the background and through the
 * ringer switch; a chime must do neither. The chime set its mode the first
 * time one played and never gave it back, so the first message to arrive
 * stopped album audio as soon as the app went to the background, and with the
 * ringer off, straight away.
 *
 * So the mode belongs to whoever is making sound. Album playback takes it
 * whenever it plays. A chime takes it only while album audio is not playing —
 * over album audio it plays in the album's mode, which is only a short tone
 * heard through the ringer switch while music is already audible anyway.
 */
type Mode = 'album' | 'alert';

let current: Mode | null = null;
let albumPlaying = false;

export function setAlbumPlaying(playing: boolean): void {
  albumPlaying = playing;
}

async function enter(mode: Mode): Promise<void> {
  if (current === mode) return;
  current = mode;
  try {
    await setAudioModeAsync(
      mode === 'album'
        ? {
            playsInSilentMode: true,
            shouldPlayInBackground: true,
            interruptionMode: 'doNotMix',
            allowsRecording: false,
            shouldRouteThroughEarpiece: false,
          }
        : {
            // The ringer switch means "do not make noise", and a notification
            // that talks over it is an app people uninstall.
            playsInSilentMode: false,
            shouldPlayInBackground: false,
            // Ducks another app's music rather than stopping it.
            interruptionMode: 'duckOthers',
            shouldRouteThroughEarpiece: false,
          },
    );
  } catch {
    // An older runtime, or web: default routing still plays.
    current = null;
  }
}

/** Before album audio plays. */
export function enterAlbumMode(): Promise<void> {
  return enter('album');
}

/** Before a chime plays; a no-op while album audio is playing. */
export function enterAlertMode(): Promise<void> {
  if (albumPlaying) return Promise.resolve();
  return enter('alert');
}
