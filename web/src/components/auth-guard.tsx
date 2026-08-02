'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

/**
 * Gate for every signed-in route.
 *
 * Three states kept deliberately apart, the same distinction the app makes:
 *
 *   resolving  -> a spinner. Rendering children first would flash private UI.
 *   signed out -> the sign-in page, remembering where you were headed so the
 *                 link you followed still works after you authenticate.
 *   unreachable-> a retry. A dropped connection is NOT proof of being signed
 *                 out, and bouncing to login there would log people out over a
 *                 flaky network.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, isSessionError, retrySession } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const shouldRedirect = !isLoading && !isSessionError && !isAuthenticated;

  useEffect(() => {
    if (!shouldRedirect) return;
    const next = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
    router.replace(`/sign-in${next}`);
  }, [shouldRedirect, pathname, router]);

  if (isLoading) {
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (isSessionError && !isAuthenticated) {
    return (
      <div className="grid h-full place-items-center px-6">
        <div className="max-w-sm text-center">
          <WifiOff className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-4 text-lg font-bold">Can&rsquo;t reach the server</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Check your connection and try again. You are still signed in.
          </p>
          <Button className="mt-6" onClick={() => retrySession()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // The redirect is in flight; a spinner beats a flash of empty layout.
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
