'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // A console is read while things change underneath it. 30s keeps
            // the numbers honest without hammering the API on every focus.
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            // 401 is handled by the client, which refreshes once and then
            // redirects. Retrying it here would just delay the redirect.
            retry: (count, error) =>
              (error as { status?: number })?.status === 401 ? false : count < 2,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        {/* The sidebar's collapsed state shows each item's label as a
            tooltip, which needs a provider above it. */}
        <TooltipProvider delayDuration={0}>
          {children}
          <Toaster position="top-right" richColors />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
