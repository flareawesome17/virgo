import { createContext, useContext, type ReactNode } from 'react';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

/**
 * The window's own safe area, whatever the banners have done to it.
 *
 * While the upload strip or the email banner shows, it takes the notch and
 * hands the screens under it a top inset of 0, so they do not pad for it a
 * second time. A <Modal> is not under the banner, though: it covers the whole
 * window. Reading the zeroed inset, the rename and new-section sheets came up
 * against the Dynamic Island for as long as an upload ran.
 */
const WindowInsets = createContext<EdgeInsets | null>(null);

/** Mounted above the banners, where the inset is still the window's. */
export function WindowInsetsProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <WindowInsets.Provider value={insets}>{children}</WindowInsets.Provider>;
}

/** For anything drawn over the whole window: a <Modal>, a sheet, a viewer. */
export function useWindowInsets(): EdgeInsets {
  const window = useContext(WindowInsets);
  const local = useSafeAreaInsets();
  return window ?? local;
}
