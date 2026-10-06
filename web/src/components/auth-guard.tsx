'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RolesRequiredDialog } from '@/components/roles-required';
import { DesktopTitleBar } from '@/components/desktop-title-bar';
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
  const { isAuthenticated, isLoading, isSessionError, isCheckingSession, retrySession } =
    useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const shouldRedirect = !isLoading && !isSessionError && !isAuthenticated;

  useEffect(() => {
    if (!shouldRedirect) return;
    // The query too: a link like /jobs/mine?tab=posted&post=… lost everything
    // after the path, and landed on the right page showing the wrong thing.
    // Read from location rather than useSearchParams, which would need a
    // Suspense boundary around every signed-in page.
    const target = pathname ? `${pathname}${window.location.search}` : '';
    const next = target && target !== '/' ? `?next=${encodeURIComponent(target)}` : '';
    router.replace(`/sign-in${next}`);
  }, [shouldRedirect, pathname, router]);

  if (isLoading) {
    return (
      <GuardFrame>
        <Loader2 className="size-6 animate-spin text-primary" />
      </GuardFrame>
    );
  }

  if (isSessionError && !isAuthenticated) {
    return (
      <GuardFrame>
        <div className="max-w-sm text-center">
          <WifiOff className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-4 text-lg font-bold">Can&rsquo;t reach the server</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Check your connection and try again. You are still signed in.
          </p>
          <Button
            className="mt-6"
            onClick={() => retrySession()}
            disabled={isCheckingSession}
          >
            {isCheckingSession && <Loader2 className="size-4 animate-spin" />}
            Retry
          </Button>
        </div>
      </GuardFrame>
    );
  }

  if (!isAuthenticated) {
    // The redirect is in flight; a spinner beats a flash of empty layout.
    return (
      <GuardFrame>
        <Loader2 className="size-6 animate-spin text-primary" />
      </GuardFrame>
    );
  }

  return (
    <>
      {/* Here rather than in a page, so an account with no roles is asked
          wherever it lands rather than only if it happens to open Profile. */}
      <RolesRequiredDialog />
      {children}
    </>
  );
}

/**
 * The guard's own screens, with the desktop title bar over them.
 *
 * They show before the signed-in shell that carries the bar, on every full
 * page load. On Windows, where the window has no frame of its own, "Can't
 * reach the server" could not be closed or moved. The bar renders nothing in
 * a browser.
 */
function GuardFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <DesktopTitleBar />
      <div className="grid min-h-0 flex-1 place-items-center px-6">{children}</div>
    </div>
  );
}
