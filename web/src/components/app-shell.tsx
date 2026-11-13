'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from 'next-themes';
import {
  Gift,
  LifeBuoy,
  LogOut,
  Menu,
  MessageCircle,
  Monitor,
  Moon,
  PencilLine,
  Settings,
  Sun,
  UserRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { APP_COMMIT, RELEASE_LABEL } from '@/lib/version';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useUnreadCount } from '@/hooks/useChat';
import { SidebarFriends } from '@/components/sidebar-friends';
import { usePromoOffers } from '@/hooks/usePromos';
import { NotificationBell } from '@/components/notification-bell';
import { VerifyEmailBanner } from '@/components/verify-email-banner';
import { DesktopUpdateBanner } from '@/components/desktop-update-banner';
import { OfflineBanner } from '@/components/offline-banner';
import { UploadDock } from '@/components/upload/upload-dock';
import { DesktopTitleBar } from '@/components/desktop-title-bar';
import { IS_DESKTOP } from '@/lib/desktop';
import { DesktopAttention } from '@/components/desktop-attention';
import { DesktopDownloads } from '@/components/desktop-downloads';
import { CreateMenu } from '@/components/shell/create';
import { NAV, isActive, useNavCounts } from '@/components/shell/nav';
import { SidebarStorage } from '@/components/shell/sidebar-storage';
import { DesktopRail } from '@/components/desktop/rail';
import { DesktopStatusBar } from '@/components/desktop/status-bar';
import { JumpTo } from '@/components/desktop/jump-to';
import { useHydrated } from '@/lib/hydration';

function initials(name: string | null | undefined, email: string | undefined): string {
  const source = name?.trim() || email || '?';
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function CountBadge({ count, className }: { count: number; className?: string }) {
  if (!(count > 0)) return null;
  return (
    <Badge className={cn('h-5 min-w-5 justify-center px-1.5 text-[11px] tabular-nums', className)}>
      {count > 99 ? '99+' : count}
    </Badge>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const counts = useNavCounts();

  return (
    <nav className="flex flex-col gap-5 px-3 py-2">
      {NAV.map((group, i) => (
        <div key={group.heading ?? i} className="flex flex-col gap-0.5">
          {group.heading && (
            <p className="px-2.5 pb-1.5 text-xs font-semibold text-muted-foreground">
              {group.heading}
            </p>
          )}
          {group.items.map((item) => {
            const active = isActive(item, pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-sm transition-colors',
                  // The one filled row in the sidebar is where you are: a
                  // white pill on the cream, as a card sits on a page.
                  active
                    ? 'bg-card font-semibold text-foreground ring-1 ring-border/60'
                    : 'font-medium text-secondary-foreground hover:bg-sidebar-accent hover:text-foreground',
                )}
              >
                <Icon className={cn('size-[17px] shrink-0', active && 'text-primary')} />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge && <CountBadge count={counts[item.badge]} />}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-sidebar">
      <Link href="/" onClick={onNavigate} className="flex h-14 shrink-0 items-center gap-2.5 px-5">
        {/* The mark is transparent, so it sits on either palette without a
            plate behind it. */}
        <Image
          src="/logo.png"
          alt=""
          width={28}
          height={28}
          className="size-7 shrink-0 object-contain"
          priority
        />
        <span className="truncate text-[17px] font-bold tracking-tight">Virgo</span>
      </Link>

      {/* min-h-0 is what makes this scroll instead of grow; the native bar is
          hidden by the no-scrollbar class. */}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <NavLinks onNavigate={onNavigate} />
      </div>

      {/* Below the destinations, not among them: these are people. It owns its
          own scroller, and gives height back to the nav on a short window. */}
      <div className="min-h-0 px-3 pb-3">
        <SidebarFriends />
      </div>

      {/* How full storage is, in view from every page. */}
      <div className="shrink-0 px-3 pb-3">
        <SidebarStorage onNavigate={onNavigate} />
      </div>
    </div>
  );
}

const THEMES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

/**
 * Your picture, at the end of the bar: who you are, and everything about your
 * account. The phone keeps Profile and Settings behind the same picture.
 *
 * Rewards and Support moved in here from the sidebar, and the theme from the
 * bar. Rewards marks the picture, because an offer can expire unnoticed.
 */
function AccountMenu() {
  const { profile, user, signOut } = useAuth();
  const { offers: rewards } = usePromoOffers();
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={rewards.length > 0 ? 'Your account, rewards waiting' : 'Your account'}
          className="relative ml-0.5 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Avatar className="size-8">
            {profile?.avatarUrl && <AvatarImage src={profile.avatarUrl} alt="" />}
            <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
              {initials(profile?.displayName, user?.email)}
            </AvatarFallback>
          </Avatar>
          {rewards.length > 0 && (
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-background bg-primary"
            />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-semibold">{profile?.displayName || 'Your profile'}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          {/* Your page as others see it, with your drafts and private shelves:
              it needs no published handle, so it is always somewhere. */}
          <Link href="/profile">
            <UserRound className="size-4" />
            Your profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/profile">
            <PencilLine className="size-4" />
            Edit profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="size-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/rewards">
            <Gift className="size-4" />
            <span className="flex-1">Rewards</span>
            <CountBadge count={rewards.length} />
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/support">
            <LifeBuoy className="size-4" />
            Support
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Sun className="size-4" />
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={hydrated ? (theme ?? 'system') : undefined}
              onValueChange={setTheme}
            >
              {THEMES.map((option) => {
                const Icon = option.icon;
                return (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    <Icon className="size-4" />
                    {option.label}
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => signOut.mutate()}>
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
        {/* The running release, absent on a local build, which is not one. */}
        {RELEASE_LABEL && (
          <p
            className="px-2 pb-1 pt-2 text-[10px] tabular-nums text-muted-foreground/70"
            title={APP_COMMIT ? `Release ${RELEASE_LABEL} · commit ${APP_COMMIT}` : undefined}
          >
            {RELEASE_LABEL}
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Messages, in the bar where the sidebar is folded away. */
function MessagesButton() {
  const unread = useUnreadCount();
  return (
    <Button asChild variant="ghost" size="icon" className="relative lg:hidden">
      <Link href="/chat" aria-label={unread > 0 ? `Messages, ${unread} unread` : 'Messages'}>
        <MessageCircle className="size-5" />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none tabular-nums text-primary-foreground"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Link>
    </Button>
  );
}

/*
 * Where a page puts its name and its buttons: three places in the shell's
 * bar, filled from the page by portal.
 *
 * Portals rather than state lifted into the shell. A page's actions are
 * elements made fresh on every render; setting them into the shell's state
 * would re-render the shell, which re-renders the page, which makes them again.
 */
interface Slots {
  title: HTMLElement | null;
  fallback: HTMLElement | null;
  actions: HTMLElement | null;
}

const SlotsContext = createContext<Slots>({ title: null, fallback: null, actions: null });

const WIDE = '(min-width: 768px)';

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Whether the bar has room for a page's buttons. */
function useWideBar(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

/*
 * Where each page was scrolled to, so Back returns to it.
 *
 * The scroller is the shell's, which now outlives the pages, so a page
 * opened from a link would otherwise start wherever the last one was left.
 * Positions are kept per history entry, as the browser keeps its own for the
 * window: the Navigation API names every entry, and the name is already the
 * new one by the time the next page is drawn. A new entry starts at the top;
 * one you come back to returns to where it was.
 *
 * Not `popstate`: the router draws the page Back lands on before a popstate
 * listener runs, so a flag set there arrived one navigation late. Where the
 * Navigation API is missing, every page starts at the top, as it always did.
 */
type NavigationLike = { currentEntry?: { key: string } | null };

function currentEntryKey(): string | null {
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
  return nav?.currentEntry?.key ?? null;
}

/** Returns the ref for the scroller it looks after. */
function useScrollMemory(): RefObject<HTMLElement | null> {
  const scroller = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const positions = useRef(new Map<string, number>());

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const remember = () => {
      const key = currentEntryKey();
      if (key) positions.current.set(key, el.scrollTop);
    };
    // As it happens, and once more as a link is followed, while the page
    // being left is still the one on screen.
    const onClick = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest?.('a[href]')) remember();
    };
    el.addEventListener('scroll', remember, { passive: true });
    document.addEventListener('click', onClick, true);
    return () => {
      el.removeEventListener('scroll', remember);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  // Before paint, so the page never shows at the last one's position.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const key = currentEntryKey();
    const target = key ? positions.current.get(key) : undefined;
    el.scrollTop = target ?? 0;
    if (target === undefined || Math.abs(el.scrollTop - target) <= 2) return;
    // Not all of the page is drawn yet, so it is tried again as it fills in,
    // for up to a second.
    const started = performance.now();
    const timer = window.setInterval(() => {
      el.scrollTop = target;
      if (Math.abs(el.scrollTop - target) <= 2 || performance.now() - started > 1000) {
        window.clearInterval(timer);
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [pathname]);

  return scroller;
}

/**
 * The signed-in frame, mounted once by the (app) layout.
 *
 * It used to be rendered by every page, so every click threw it away and
 * built it again: the sidebar and friends list jumped back to the top, the
 * bell and upload dock closed, a dismissed banner came back and the desktop
 * update restarted its download. As part of the layout it stays put, and
 * the pages change inside it.
 *
 * One bar at every width, shaped like the phone's: the page's name, its
 * buttons, then Create, Messages (where the sidebar is folded away), the bell
 * and your picture. Under `lg` the sidebar is a sheet: the same navigation on
 * a narrow window rather than a second, cut-down one.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // The setters are the refs: stable, and called once each element exists.
  const [titleEl, setTitleEl] = useState<HTMLDivElement | null>(null);
  const [fallbackEl, setFallbackEl] = useState<HTMLDivElement | null>(null);
  const [actionsEl, setActionsEl] = useState<HTMLDivElement | null>(null);
  const slots = useMemo(
    () => ({ title: titleEl, fallback: fallbackEl, actions: actionsEl }),
    [titleEl, fallbackEl, actionsEl],
  );
  const scroller = useScrollMemory();

  // The shell is pinned to the viewport, so a document scroll (a focused
  // off-screen control, an anchor, scrollIntoView) cannot move it; put the
  // document back too so nothing else is left offset behind it.
  useEffect(() => {
    const reset = () => {
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    };
    window.addEventListener('scroll', reset, { passive: true });
    reset();
    return () => window.removeEventListener('scroll', reset);
  }, []);

  // The bar every page shares: its name, its buttons, then Create, Messages
  // (where the sidebar is folded away), the bell and your picture.
  const bar = (
    <>
      {/* The page's own heading when it has one, its plain name when
          not: the second shows only while the first is empty. */}
      <div className="flex min-w-0 flex-1 items-center">
        <div ref={setTitleEl} className="peer flex min-w-0 flex-1 items-center gap-2 empty:hidden" />
        <div
          ref={setFallbackEl}
          className="hidden min-w-0 flex-1 items-center text-[15px] font-semibold peer-empty:flex"
        />
      </div>

      <div ref={setActionsEl} className="flex shrink-0 items-center gap-2 empty:hidden" />
      <CreateMenu />
      {!IS_DESKTOP && <MessagesButton />}
      <NotificationBell />
      <AccountMenu />
    </>
  );

  // Banners above the scroller rather than inside it: a full-height page such
  // as Chat was a banner taller than the room it had, and its composer slid
  // off the bottom. Offline first: being offline explains most other failures.
  const page = (
    <>
      <div className="shrink-0 empty:hidden">
        <OfflineBanner />
        <DesktopUpdateBanner />
        <VerifyEmailBanner />
      </div>

      <main ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <SlotsContext.Provider value={slots}>{children}</SlotsContext.Provider>
      </main>
    </>
  );

  /*
   * The desktop app: its own frame, not the website's in a window.
   *
   * A dark frame in either theme — the title bar across the top with a field
   * to jump anywhere, a rail of icons down the side, a status bar along the
   * foot — and the page as one sheet set into it. The web's sidebar spends a
   * quarter of the window naming nine places; somebody who opens this every
   * day knows them, and wants the width for the work.
   */
  if (IS_DESKTOP) {
    return (
      <div
        data-app-shell
        className="fixed inset-x-0 top-0 flex h-dvh flex-col overflow-hidden bg-[var(--frame)]"
        onScroll={(event) => {
          event.currentTarget.scrollTop = 0;
        }}
      >
        {/* Render nothing anywhere. They keep the window's title, dock badge
            and taskbar in step with what is unread, and say where a download
            went. */}
        <DesktopAttention />
        <DesktopDownloads />

        <DesktopTitleBar frame center={<JumpTo />} />

        <div className="flex min-h-0 flex-1">
          <DesktopRail />
          <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-tl-xl bg-background">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-4">
              {bar}
            </header>
            {page}
          </div>
        </div>

        <DesktopStatusBar />
        {/* On every signed-in page: uploads keep reporting wherever you go. */}
        <UploadDock />
      </div>
    );
  }

  return (
    // data-app-shell is what globals.css keys the body's hidden overflow off.
    // h-dvh, not h-full: dvh tracks what is actually visible on a phone.
    <div
      data-app-shell
      // Clipped, and held at the top if anything scrolls it anyway. A banner
      // arriving pushed the whole shell up by its own height: the top of the
      // sidebar went off the window.
      className="fixed inset-x-0 top-0 flex h-dvh overflow-hidden"
      onScroll={(event) => {
        event.currentTarget.scrollTop = 0;
      }}
    >
      {/* The sidebar runs the full height of the window. */}
      <aside className="hidden h-full min-h-0 w-60 shrink-0 overflow-hidden border-r border-border/60 lg:block">
        <SidebarBody />
      </aside>

      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-border/60 bg-background px-2 sm:gap-2 sm:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarBody onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          {bar}
        </header>
        {page}
      </div>
      {/* On every signed-in page: uploads keep reporting wherever you go. */}
      <UploadDock />
    </div>
  );
}

/**
 * A page inside the shell.
 *
 * `title` is the page's plain name for the bar, shown when the page has no
 * PageHeader of its own. The browser tab's title is the route's metadata,
 * set in each page.tsx.
 */
export function Screen({ title, children }: { title?: ReactNode; children: ReactNode }) {
  const { fallback } = useContext(SlotsContext);
  return (
    <>
      {fallback &&
        title != null &&
        createPortal(<span className="truncate">{title}</span>, fallback)}
      {children}
    </>
  );
}

/**
 * A page's heading and buttons, drawn in the shell's bar.
 *
 * The bar replaces the page-sized title every screen used to carry, as the
 * phone's did: one name per screen, in one place, with the page's own buttons
 * beside it, and the description as the line under the name. Where the bar
 * has no room for the buttons, on a phone-sized window, they sit at the top
 * of the page instead.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const { title: titleSlot, actions: actionsSlot } = useContext(SlotsContext);
  const wide = useWideBar();

  return (
    <>
      {titleSlot &&
        createPortal(
          <div className="min-w-0">
            <h1 className="flex min-w-0 items-center gap-1 truncate text-[15px] font-semibold leading-tight">
              {title}
            </h1>
            {description && (
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                {description}
              </p>
            )}
          </div>,
          titleSlot,
        )}
      {actions && wide && actionsSlot && createPortal(actions, actionsSlot)}
      {actions && !wide && (
        <div className={cn('flex flex-wrap items-center justify-end gap-2 px-4 pt-3', className)}>
          {actions}
        </div>
      )}
    </>
  );
}
