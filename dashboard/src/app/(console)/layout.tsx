'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { tokens } from '@/api/client';
import { AppSidebar } from '@/components/console/app-sidebar';
import { ForcePasswordChange } from '@/components/console/force-password-change';
import { useMe, useOverview } from '@/hooks/useConsole';
import { Skeleton } from '@/components/ui/skeleton';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';

/**
 * The console shell.
 *
 * Uses shadcn's Sidebar rather than a hand-rolled `<aside>`, which is what
 * this was. The difference is not cosmetic: collapse-to-icon with tooltips,
 * the off-canvas sheet on mobile, cmd/ctrl+B, and a persisted open state all
 * come with it — every one of which had to be reinvented otherwise, and three
 * of which simply were not there.
 */
export default function ConsoleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const { me, isLoading, isError } = useMe();

  // The nav's counts come from the overview, which the Overview page is
  // fetching anyway — same query key, so this is a cache read rather than a
  // second request. Skipped entirely for a role that cannot see it.
  const canSeeOverview = me?.permissions.includes('overview.read') ?? false;
  const { data: overview } = useOverview(30, canSeeOverview);

  // Bounce before rendering anything if there is no token at all — otherwise
  // the shell flashes into view and then disappears.
  useEffect(() => {
    if (!tokens.access()) router.replace('/sign-in');
  }, [router]);

  useEffect(() => {
    if (isError) router.replace('/sign-in');
  }, [isError, router]);

  if (isLoading || !me) {
    return (
      <div className="flex min-h-dvh">
        <div className="hidden w-64 border-r p-4 lg:block">
          <Skeleton className="h-10 w-full" />
          <div className="mt-6 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-8">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-4 h-64 w-full" />
        </div>
      </div>
    );
  }

  // Before the shell, not inside it. A seeded password is single-use by
  // design, and a banner someone can scroll past would not enforce that.
  if (me.mustChangePassword) {
    return <ForcePasswordChange email={me.email} />;
  }

  return (
    <SidebarProvider>
      <AppSidebar
        me={me}
        counts={
          overview
            ? {
                openTickets: overview.totals.openTickets,
                // Both kinds land on the Content page's Reports tab, so the
                // badge counts both. `reports` stays job posts only in the
                // API, which is what the previous console still reads.
                reports:
                  overview.totals.reports + (overview.totals.userReports ?? 0),
              }
            : undefined
        }
      />
      <SidebarInset>
        {/* Sticky, so the collapse control stays reachable down a long table. */}
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <span className="text-sm font-medium text-muted-foreground">
            Virgo Console
          </span>
        </header>
        <main className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
