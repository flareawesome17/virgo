import type { ReactNode } from 'react';
import { AppDocument, appMetadata, appViewport } from '../app-document';

/**
 * Signed-out pages: sign in, sign up, and the public legal document.
 *
 * A root layout of its own, rendering the app's document: these screens use
 * the app's providers (the session, the query cache) exactly as before.
 */
export const metadata = appMetadata;
export const viewport = appViewport;

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <AppDocument>
      <div className="h-full overflow-y-auto">{children}</div>
    </AppDocument>
  );
}
