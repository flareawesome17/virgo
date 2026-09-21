import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * What this client is, for the parts of the API that answer differently by
 * platform — at present, which update announcements belong in its list.
 *
 * Platform-specific by nature, so it is one of the few files under `api/` that
 * differs between web and mobile (see scripts/check-client-sync.mjs). The
 * shared code that uses it only ever calls `clientIdentity()`.
 */
export type ClientPlatform = 'web' | 'windows' | 'macos' | 'ios' | 'android';

export interface ClientIdentity {
  platform: ClientPlatform;
  /** Null when the build carries no version, which matches no version bound. */
  version: string | null;
}

/**
 * The phone app, as iOS or Android.
 *
 * The version is the one this binary was built with. An over-the-air update
 * can only ever reach a binary of the same version — it is part of the runtime
 * fingerprint — so this is also the version every OTA announcement is aimed
 * at. `web` covers the Expo web preview, which is a development surface and
 * sees only announcements with no version bound.
 */
export function clientIdentity(): ClientIdentity {
  const platform: ClientPlatform =
    Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
  return { platform, version: Constants.expoConfig?.version ?? null };
}
