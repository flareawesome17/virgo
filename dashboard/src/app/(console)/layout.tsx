'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Menu, Search } from 'lucide-react';
import { tokens } from '@/api/client';
import type { AdminMe } from '@/api/console';
import { AppRail, NavList, RailFooter, type NavCounts } from '@/components/console/app-rail';
import {
  CommandPalette,
  Kbd,
  useCommandPaletteShortcut,
} from '@/components/console/command-palette';
import { ForcePasswordChange } from '@/components/console/force-password-change';
import { RecordTabBar, RecordTabsProvider } from '@/components/console/record-tabs';
import { useMe, useOverview } from '@/hooks/useConsole';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

const PINNED_KEY = 'virgo.console.railPinned';

function readPinned(): boolean {
  try {
    return localStorage.getItem(PINNED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * The console shell, laid out the way Termix lays out its own: an icon rail on
 * the left, a top bar holding the records you have open as tabs and the search,
 * and the page beneath. The shell owns scrolling, so the rail and the tabs
 * stay put however long the table.
 */
export default function ConsoleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const { me, isLoading, isError } = useMe();

  // The rail's counts come from the overview, which the Overview page is
  // fetching anyway — same query key, so this is a cache read rather than a
  // second request. Skipped entirely for a role that cannot see it, and while
  // the password still has to be changed — the API refuses it until then.
  const canSeeOverview =
    (me?.permissions.includes('overview.read') ?? false) && !me?.mustChangePassword;
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
      <div className="flex h-dvh">
        <div className="hidden w-12 border-r bg-sidebar md:block" />
        <div className="flex-1">
          <div className="h-12 border-b" />
          <div className="mx-auto max-w-7xl px-6 py-6">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="mt-5 h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  // Before the shell, not inside it. A password someone else chose is single
  // use by design, and a banner someone can scroll past would not enforce it.
  if (me.mustChangePassword) {
    return <ForcePasswordChange email={me.email} />;
  }

  const counts: NavCounts | undefined = overview
    ? {
        openTickets: overview.totals.openTickets,
        // Both kinds land on the Content page's Reports tab, so the badge
        // counts both. `reports` stays job posts only in the API.
        reports: overview.totals.reports + (overview.totals.userReports ?? 0),
      }
    : undefined;

  // Keyed by account: signing in as somebody else on the same browser must
  // not inherit the last person's open records.
  return (
    <RecordTabsProvider key={me.id} adminId={me.id}>
      <Shell me={me} counts={counts}>
        {children}
      </Shell>
    </RecordTabsProvider>
  );
}

function Shell({
  me,
  counts,
  children,
}: {
  me: AdminMe;
  counts?: NavCounts;
  children: React.ReactNode;
}) {
  const [pinned, setPinnedState] = useState(readPinned);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const setPinned = useCallback((value: boolean) => {
    setPinnedState(value);
    try {
      localStorage.setItem(PINNED_KEY, value ? '1' : '0');
    } catch {
      /* a convenience; nothing breaks without it */
    }
  }, []);

  // The shell only renders in the browser (see ConsoleLayout), so reading
  // the platform here cannot disagree with a server render.
  const [mac] = useState(() => /Mac|iPhone|iPad/.test(navigator.userAgent));

  const togglePalette = useCallback(() => setPaletteOpen((v) => !v), []);
  useCommandPaletteShortcut(togglePalette);

  return (
    <div data-app-shell className="flex h-dvh overflow-hidden">
      <AppRail me={me} counts={counts} pinned={pinned} onPinnedChange={setPinned} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-stretch border-b bg-sidebar">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open the menu"
            className="grid w-12 shrink-0 place-items-center border-r text-muted-foreground hover:text-foreground md:hidden"
          >
            <Menu className="size-4" />
          </button>

          <div className="flex min-w-0 flex-1 items-center">
            <RecordTabBar />
          </div>

          <div className="flex shrink-0 items-center border-l px-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex h-8 items-center gap-2 rounded-md border bg-background px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:w-56"
            >
              <Search className="size-3.5 shrink-0" />
              <span className="hidden flex-1 text-left sm:block">Search…</span>
              <span className="hidden items-center gap-0.5 sm:flex">
                <Kbd>{mac ? '⌘' : 'Ctrl'}</Kbd>
                <Kbd>K</Kbd>
              </span>
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>

      {/* Phones get the same list in a sheet; the rail needs a pointer. */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-64 gap-0 bg-sidebar p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <NavList me={me} counts={counts} expanded onNavigate={() => setMenuOpen(false)} />
          <RailFooter me={me} expanded />
        </SheetContent>
      </Sheet>

      <CommandPalette
        me={me}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        railPinned={pinned}
        onRailPinnedChange={setPinned}
      />
    </div>
  );
}
