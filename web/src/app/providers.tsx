'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { queryClient, persistOptions } from '@/lib/queryClient';
import type { ReactNode } from 'react';
import { useMessageAlerts } from '@/hooks/useChat';
import { useRealtime } from '@/hooks/useRealtime';
import { useAuth } from '@/hooks/useAuth';
import { AnalyticsBridge } from '@/components/analytics-bridge';

/**
 * Everything the client tree needs.
 *
 * One client boundary at the root rather than several deeper down: the app is
 * a signed-in tool where nearly every route is interactive and reads the
 * session, so splitting hairs over which subtree is a server component would
 * buy prerendering for a handful of static pages and cost a lot of plumbing.
 *
 * `queryClient` is a module singleton, which is safe here because this file is
 * client-only — it is never shared between requests on a server.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      // The app has its own palette transition; letting next-themes also
      // disable transitions on change causes a visible flash of unstyled
      // colour on slower machines.
      disableTransitionOnChange
      storageKey="virgo.theme"
    >
      <QueryCache>
        <TooltipProvider delayDuration={300}>
          <RealtimeBridge />
          <AnalyticsBridge />
          {children}
          <Toaster position="bottom-right" richColors closeButton />
        </TooltipProvider>
      </QueryCache>
    </ThemeProvider>
  );
}

/**
 * The query provider, with the cache kept on disk in the desktop app.
 *
 * Two providers rather than one with a flag, because they differ in a way that
 * matters: `PersistQueryClientProvider` holds its children back until the
 * cache has been read off disk. That pause is what makes a cold start offline
 * show the workspace instead of a spinner or a "can't reach the server" — the
 * gate has an answer by the time it asks.
 *
 * `persistOptions` is null on the web, where the plain provider keeps exactly
 * the behaviour that shipped.
 */
function QueryCache({ children }: { children: ReactNode }) {
  if (!persistOptions) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

/**
 * Holds the live connection and the unread-count alerts open for the whole
 * session.
 *
 * A component rather than hooks in Providers because both need the session,
 * which only exists inside QueryClientProvider.
 */
function RealtimeBridge() {
  const { isAuthenticated } = useAuth();
  useRealtime(isAuthenticated);
  useMessageAlerts(isAuthenticated);
  return null;
}
