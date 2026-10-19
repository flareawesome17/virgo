import type { ReactNode } from 'react';
import { SettingsFrame } from '@/components/settings/settings-nav';

/**
 * Every page under /settings, with the settings list beside it. A layout, so
 * the list stays put while you move between them.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <SettingsFrame>{children}</SettingsFrame>;
}
