import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Token storage.
 *
 * AsyncStorage rather than SecureStore because the app already depends on it
 * and the web build has no SecureStore equivalent. Note this is unencrypted —
 * on a rooted or jailbroken device the refresh token is readable. That is the
 * same exposure the previous backend client had, so this migration does not make it
 * worse, but expo-secure-store on native is the upgrade path if it matters.
 */
const ACCESS_KEY = 'virgo.auth.accessToken';
const REFRESH_KEY = 'virgo.auth.refreshToken';

/**
 * Cached in memory so the request path does not await AsyncStorage on every
 * call. Storage stays the source of truth across app restarts.
 */
let accessToken: string | null = null;
let refreshToken: string | null = null;
let hydrated = false;

export async function hydrateTokens(): Promise<void> {
  if (hydrated) return;
  try {
    const pairs = await AsyncStorage.multiGet([ACCESS_KEY, REFRESH_KEY]);
    accessToken = pairs.find(([k]) => k === ACCESS_KEY)?.[1] ?? null;
    refreshToken = pairs.find(([k]) => k === REFRESH_KEY)?.[1] ?? null;
  } catch {
    accessToken = null;
    refreshToken = null;
  }
  hydrated = true;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

export async function setTokens(
  access: string,
  refresh: string,
): Promise<void> {
  accessToken = access;
  refreshToken = refresh;
  await AsyncStorage.multiSet([
    [ACCESS_KEY, access],
    [REFRESH_KEY, refresh],
  ]);
}

export async function clearTokens(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]);
}
