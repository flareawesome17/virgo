import type { ReactNode } from 'react';
import { AppDocument, appMetadata, appViewport } from '../app-document';
import { AppLayoutClient } from './app-layout-client';

/**
 * The root of everything behind the sign-in wall: the app's document and
 * providers (see app-document.tsx), then the guard and the players.
 */
export const metadata = appMetadata;
export const viewport = appViewport;

export default function AppRootLayout({ children }: { children: ReactNode }) {
  return (
    <AppDocument>
      <AppLayoutClient>{children}</AppLayoutClient>
    </AppDocument>
  );
}
