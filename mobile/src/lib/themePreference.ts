import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorScheme } from 'nativewind';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'virgo.theme-preference';

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * The user's theme choice, kept across launches.
 *
 * NativeWind's `colorScheme` only holds the *resolved* scheme for the current
 * session — it cannot tell you whether "dark" was chosen explicitly or simply
 * inherited from the device, and it resets on restart. The preference is
 * therefore stored separately and re-applied on boot.
 *
 * The settings screen previously kept the selection in `useState` alone, so
 * tapping Light or Dark moved a checkmark and changed nothing else.
 */
export async function loadThemePreference(): Promise<ThemePreference> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return isPreference(stored) ? stored : 'system';
  } catch {
    // A storage failure must not stop the app rendering; follow the device.
    return 'system';
  }
}

export async function saveThemePreference(pref: ThemePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Non-fatal: the choice still applies for this session.
  }
}

/**
 * Applies a preference to NativeWind.
 *
 * Imperative rather than the hook so it can run during boot, before any
 * component that would consume the theme has mounted — otherwise the app
 * paints in the wrong scheme and then snaps.
 */
export function applyThemePreference(pref: ThemePreference): void {
  colorScheme.set(pref);
}
