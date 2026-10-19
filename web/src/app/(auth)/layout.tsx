import type { ReactNode } from 'react';
import { AppDocument, appMetadata, appViewport } from '../app-document';
import { DesktopTitleBar } from '@/components/desktop-title-bar';
import { DesktopUpdateBanner } from '@/components/desktop-update-banner';

/**
 * Signed-out pages: sign in, sign up, and the public legal document.
 *
 * A root layout of its own, rendering the app's document: these screens use
 * the app's providers (the session, the query cache) exactly as before.
 *
 * The desktop app's title bar and update banner are here as well as in the
 * signed-in shell. On Windows the window has no frame of its own, so without
 * the bar these pages could not be closed, moved or minimised; and somebody
 * stuck before signing in could not reach the update that fixes it. Both
 * render nothing in a browser.
 */
export const metadata = appMetadata;
export const viewport = appViewport;

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <AppDocument>
      <div className="flex h-full flex-col">
        <DesktopTitleBar />
        <DesktopUpdateBanner />
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </AppDocument>
  );
}
