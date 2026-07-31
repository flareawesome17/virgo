// ThemeProvider.tsx
import { useColorScheme } from 'nativewind';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { lightTheme, darkTheme } from '@/theme';
import {
  applyThemePreference,
  loadThemePreference,
  saveThemePreference,
  type ThemePreference,
} from '@/src/lib/themePreference';

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const { colorScheme } = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  // Restore the saved choice on boot. Without this the app always followed the
  // device, so picking Light or Dark in settings never survived a restart.
  useEffect(() => {
    let cancelled = false;
    loadThemePreference().then((pref) => {
      if (cancelled) return;
      setPreferenceState(pref);
      applyThemePreference(pref);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((pref: ThemePreference) => {
    // Apply first so the UI turns over immediately; persistence can lag.
    applyThemePreference(pref);
    setPreferenceState(pref);
    void saveThemePreference(pref);
  }, []);

  const themeVars = colorScheme === 'dark' ? darkTheme : lightTheme;

  // On web, RN Modal portals to document.body — outside any wrapper View —
  // so CSS variables set on a wrapper don't reach modal content. Apply them
  // to documentElement so they're globally available.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const root = document.documentElement;
    // themeVars may be a plain object of CSS vars or wrapped as { __cssVars: {...} }
    // by the browser-metro nativewind shim. Unwrap if needed.
    const vars: Record<string, string> =
      (themeVars as any).__cssVars ?? themeVars;
    const prev: Record<string, string> = {};
    for (const [key, value] of Object.entries(vars)) {
      prev[key] = root.style.getPropertyValue(key);
      root.style.setProperty(key, String(value));
    }
    root.classList.remove('light', 'dark');
    if (colorScheme) root.classList.add(colorScheme);
    return () => {
      for (const key of Object.keys(vars)) {
        if (prev[key]) root.style.setProperty(key, prev[key]);
        else root.style.removeProperty(key);
      }
    };
  }, [themeVars, colorScheme]);

  return (
    <ThemePreferenceContext.Provider value={{ preference, setPreference }}>
      <View style={themeVars} className={`${colorScheme} flex-1 bg-background`}>
        {children}
      </View>
    </ThemePreferenceContext.Provider>
  );
}

/**
 * Carries the *choice* (including "system"), which NativeWind does not track —
 * its colorScheme is only the resolved light/dark for this session.
 *
 * The default keeps `useTheme()` usable outside the provider: setting a
 * preference still applies, it just is not persisted or shared.
 */
const ThemePreferenceContext = createContext<{
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
}>({
  preference: 'system',
  setPreference: applyThemePreference,
});

export const useTheme = () => {
  const { colorScheme, setColorScheme } = useColorScheme();
  const { preference, setPreference } = useContext(ThemePreferenceContext);
  return {
    isDark: colorScheme === 'dark',
    colorScheme,
    setColorScheme,
    /** 'light' | 'dark' | 'system' — what the user picked, not what resolved. */
    preference,
    setPreference,
  };
};
