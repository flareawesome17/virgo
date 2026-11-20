import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * What this build of the app can do that older builds cannot: the
 * microphone (voice notes) and the camera (a photo from the + sheet).
 *
 * The apps people have installed were built with both permissions switched
 * off, and on iOS asking for one the build never declared ends the app on
 * the spot. So the screens only offer them when the build says it has them,
 * and a build says so in app.json's `extra.nativeFeatures`, set in the same
 * change that switches the permissions on.
 *
 * Read from the config the running JavaScript was published with. An update
 * only ever reaches builds with the same native code (the runtime version is
 * a fingerprint of it), so an update for the older builds carries their
 * app.json, without the flag, and one for a newer build carries the flag.
 * A missing flag is "no", so this fails closed.
 */
export interface NativeFeatures {
  /** Recording voice notes. */
  microphone: boolean;
  /** Taking a photo from the + sheet. */
  camera: boolean;
}

function read(): NativeFeatures {
  // Expo web (the preview) has neither, whatever app.json says.
  if (Platform.OS === 'web') return { microphone: false, camera: false };
  const flags = (Constants.expoConfig?.extra as { nativeFeatures?: Partial<NativeFeatures> } | undefined)
    ?.nativeFeatures;
  return {
    microphone: flags?.microphone === true,
    camera: flags?.camera === true,
  };
}

export const NATIVE_FEATURES: NativeFeatures = read();
