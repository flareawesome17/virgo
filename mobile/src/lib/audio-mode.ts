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
type Mode = 'album' | 'alert' | 'voice' | 'record';

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
        : mode === 'voice'
          ? {
              // Someone pressed play: heard through the ringer switch, the
              // way a voice note is in every messaging app, and through the
              // speaker. It stops when the app leaves the screen.
              playsInSilentMode: true,
              shouldPlayInBackground: false,
              interruptionMode: 'doNotMix',
              allowsRecording: false,
              shouldRouteThroughEarpiece: false,
            }
          : mode === 'record'
            ? {
                // Only while the microphone is on. Left on, iOS sends every
                // sound after it to the earpiece, so the recorder hands the
                // session back to 'voice' as soon as it stops.
                playsInSilentMode: true,
                shouldPlayInBackground: false,
                interruptionMode: 'doNotMix',
                allowsRecording: true,
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

/**
 * Whether a voice note is playing or the microphone is on: a chime that
 * arrives meanwhile keeps their mode rather than taking the session.
 */
let voiceActive = false;

export function setVoiceActive(active: boolean): void {
  voiceActive = active;
}

/** Before a voice note plays, and again once the microphone is off. */
export function enterVoiceMode(): Promise<void> {
  return enter('voice');
}

/** Before the microphone goes on, and only then. */
export function enterRecordMode(): Promise<void> {
  return enter('record');
}

/** Before a chime plays; a no-op while album audio or a voice note is playing. */
export function enterAlertMode(): Promise<void> {
  if (albumPlaying || voiceActive) return Promise.resolve();
  return enter('alert');
}
