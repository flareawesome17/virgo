'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState, type ComponentType, type ReactNode } from 'react';
import {
  BriefcaseBusiness,
  FileText,
  Gift,
  LifeBuoy,
  CalendarDays,
  FolderOpen,
  Home,
  LogOut,
  MapPin,
  MessageCircle,
  Menu,
  Settings,
  Users,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useUnreadCount } from '@/hooks/useChat';
import { useCollaboratorInvitations } from '@/hooks/useCollaborators';
import { useIncomingFriendRequests } from '@/hooks/useFriends';
import { SidebarFriends } from '@/components/sidebar-friends';
import { useEventInvitations } from '@/hooks/useScheduleEvents';
import { useUnseenJobs } from '@/hooks/useJobs';
import { usePromoOffers } from '@/hooks/usePromos';
import { NotificationBell } from '@/components/notification-bell';
import { ThemeToggle } from '@/components/theme-toggle';
import { VerifyEmailBanner } from '@/components/verify-email-banner';
import { DesktopUpdateBanner } from '@/components/desktop-update-banner';
import { OfflineBanner } from '@/components/offline-banner';

import { DesktopTitleBar } from '@/components/desktop-title-bar';

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Which live count fills this item's badge slot, if any. */
  badge?:
    | 'unread'
    | 'invitations'
    | 'friendRequests'
    | 'eventInvites'
    | 'newJobs'
    | 'rewards';
}

const NAV: { heading?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: '/', label: 'Home', icon: Home },
      { href: '/workspaces', label: 'Workspaces', icon: FolderOpen, badge: 'invitations' },
      { href: '/schedule', label: 'Schedule', icon: CalendarDays, badge: 'eventInvites' },
    ],
  },
  {
    heading: 'People',
    items: [
      { href: '/network', label: 'Network', icon: Users, badge: 'friendRequests' },
      { href: '/chat', label: 'Chat', icon: MessageCircle, badge: 'unread' },
      { href: '/nearby', label: 'Nearby', icon: MapPin },
      { href: '/jobs/mine', label: 'Jobs', icon: BriefcaseBusiness, badge: 'newJobs' },
      // Beside Jobs, because a booking is where a job ends up.
      { href: '/bookings', label: 'Bookings', icon: FileText },
    ],
  },
  {
    // Its own group at the bottom rather than buried in settings. During a
    // pre-release the most valuable thing a user can do is tell you what
    // broke, and a support link nobody finds collects nothing.
    items: [
      // Badged, because an offer can expire — a reward nobody noticed in time
      // is worse than no reward at all.
      { href: '/rewards', label: 'Rewards', icon: Gift, badge: 'rewards' },
      { href: '/support', label: 'Support', icon: LifeBuoy },
    ],
  },
];

function initials(name: string | null | undefined, email: string | undefined): string {
  const source = name?.trim() || email || '?';
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const unread = useUnreadCount();
  // An invitation is invisible until answered — the workspace does not
  // appear anywhere else — so the count has to live on the nav itself.
  const { invitations } = useCollaboratorInvitations();
  // Friend requests waiting on an answer. Kept out of the page so the
  // count is visible from anywhere, which is the point of a badge.
  const { count: friendRequests } = useIncomingFriendRequests();
  // Invitations to somebody else's shoot, waiting on an answer.
  const { invitations: eventInvites } = useEventInvitations();
  // Open postings this user has not looked at, plus applications on their own
  // posts that nobody has answered. The nav is the only place the second one
  // surfaces — an application otherwise announced itself over the socket and
  // by email and left no trace in the app at all.
  const { total: newJobs } = useUnseenJobs();
  // Rewards waiting to be claimed. Cheap — the list is almost always empty,
  // and it is the only surface that says an offer arrived.
  const { offers: rewards } = usePromoOffers();

  return (
    <nav className="flex flex-col gap-6 px-3 py-2">
      {NAV.map((group, i) => (
        <div key={group.heading ?? i} className="flex flex-col gap-1">
          {group.heading && (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {group.heading}
            </p>
          )}
          {group.items.map((item) => {
            // Exact match for the root, prefix for everything else, so
            // /workspaces/abc still lights up Workspaces.
            const active =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
                )}
              >
                <Icon
                  className={cn('size-4 shrink-0', active && 'text-primary')}
                />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge === 'unread' && unread > 0 && (
                  <Badge className="h-5 min-w-5 justify-center px-1.5 text-[11px] tabular-nums">
                    {unread > 99 ? '99+' : unread}
                  </Badge>
                )}
                {item.badge === 'eventInvites' && eventInvites.length > 0 && (
                  <Badge className="h-5 min-w-5 justify-center px-1.5 text-[11px] tabular-nums">
                    {eventInvites.length > 99 ? '99+' : eventInvites.length}
                  </Badge>
                )}
                {item.badge === 'newJobs' && newJobs > 0 && (
                  <Badge className="h-5 min-w-5 justify-center px-1.5 text-[11px] tabular-nums">
                    {newJobs > 99 ? '99+' : newJobs}
                  </Badge>
                )}
                {item.badge === 'friendRequests' && friendRequests > 0 && (
                  <Badge className="h-5 min-w-5 justify-center px-1.5 text-[11px] tabular-nums">
                    {friendRequests > 99 ? '99+' : friendRequests}
                  </Badge>
                )}
                {item.badge === 'rewards' && rewards.length > 0 && (
                  <Badge className="h-5 min-w-5 justify-center px-1.5 text-[11px] tabular-nums">
                    {rewards.length > 99 ? '99+' : rewards.length}
                  </Badge>
                )}
                {item.badge === 'invitations' && invitations.length > 0 && (
                  <Badge className="h-5 min-w-5 justify-center px-1.5 text-[11px] tabular-nums">
                    {invitations.length > 99 ? '99+' : invitations.length}
                  </Badge>
                )}
              </Link>
            );
          })}
        </div>
      ))}

    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, user, signOut } = useAuth();

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-14 items-center gap-2.5 px-5">
        {/* The mark is transparent, so it sits on either palette without a
            plate behind it. */}
        <Image
          src="/logo.png"
          alt=""
          width={32}
          height={32}
          className="size-8 shrink-0 object-contain"
          priority
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-none">Virgo</p>
          <p className="mt-1 truncate text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Creative OS
          </p>
        </div>
      </div>

      {/* min-h-0 is what makes this scroll instead of grow.
          A flex item defaults to min-height:auto, so flex-1 alone cannot
          shrink it below its own content — the nav pushed itself past the
          bottom of the sidebar, taking the profile button and the last few
          links off the screen, and never showed a scrollbar because as far
          as the browser was concerned nothing overflowed. On a short window
          Support and the sign-out menu were simply unreachable. */}
      {/* A plain scroller, not Radix's ScrollArea.

          ScrollArea exists to draw a custom scrollbar, and this sidebar wants
          none — so hiding its bar with a class meant fighting a component for
          the one thing it is for, and losing if it ever set the property
          inline. Dropping it removes the argument: the native bar is hidden by
          `.no-scrollbar`, there is no second bar to hide, and scrolling by
          wheel, trackpad, keyboard and touch is untouched. */}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <NavLinks onNavigate={onNavigate} />
      </div>

      {/* Below the destinations, not among them: these are people, and a row
          that changes colour when somebody signs in does not belong in a list
          of places. Outside the nav's scroller too — it owns its own, so a
          long friends list no longer pushes Rewards and Support out of reach.
          Renders nothing until there are friends with accounts. */}
      {/* px-3 replaces the padding it used to inherit from the nav, so the
          rows keep their original indent. min-h-0 rather than shrink-0: on a
          short window this block gives height back to the nav above it, down
          to the floor the component sets on itself. */}
      <div className="min-h-0 px-3">
        <SidebarFriends />
      </div>

      <div className="shrink-0 border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-accent/60">
              <Avatar className="size-8">
                {profile?.avatarUrl && <AvatarImage src={profile.avatarUrl} alt="" />}
                <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
                  {initials(profile?.displayName, user?.email)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight">
                  {profile?.displayName || 'Your profile'}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {user?.email}
                </p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
              {user?.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile" onClick={onNavigate}>
                <Users className="size-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings" onClick={onNavigate}>
                <Settings className="size-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => signOut.mutate()}
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* The running release: the image's version in a browser, the staged
            bundle's in the desktop app, which until now showed nothing at all.
            Absent entirely on a local build, because a local build is not a
            release and labelling it with one would be a small lie told on every
            screen. */}
        {RELEASE_LABEL && (
          <p
            className="mt-2 px-2 text-center text-[10px] tabular-nums text-muted-foreground/60"
            title={
              APP_COMMIT
                ? `Release ${RELEASE_LABEL} · commit ${APP_COMMIT}`
                : undefined
            }
          >
            {RELEASE_LABEL}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The signed-in frame.
 *
 * A persistent sidebar rather than the app's bottom tab bar: a browser window
 * is wide and long-lived, so navigation belongs where it stays visible and
 * every destination is one click away, instead of five slots competing for the
 * bottom of a phone.
 *
 * Under `lg` it collapses into a sheet, which is the same navigation on a
 * narrow window rather than a second, cut-down one.
 */
export function AppShell({
  children,
  title,
  actions,
}: {
  /**
   * Shown in the mobile header, where the sidebar is hidden, and used as the
   * browser tab title.
   *
   * One prop for both so a route cannot name itself two different things.
   * Every signed-in page is a client component, and Next's `metadata` export
   * is Server Components only, so the tab title has to be set from here.
   */
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  /*
   * `title` names the mobile header only. It does NOT set the browser tab.
   *
   * Two ways were tried and neither holds. Assigning document.title from an
   * effect is overwritten about 7ms later, when Next re-asserts the route's
   * title from its metadata after client navigation. Rendering a <title> and
   * letting React 19 hoist it does better but still races: measured on the
   * deployed build it won on four routes and lost on four, leaving two <title>
   * elements in the head and the outcome depending on document order.
   *
   * Doing this properly means what the Next docs prescribe — `metadata` is
   * Server Components only, so each page.tsx becomes a thin server component
   * exporting it, with the client half beside it. That is the right fix and it
   * is twenty files; it is not something to graft on from here.
   */

  return (
    // data-app-shell is what globals.css keys `body { overflow: hidden }` off.
    // The rule has to be conditional: it keeps the sidebar still while the app
    // scrolls, and it stops the marketing page scrolling at all.
    //
    // h-dvh, not h-full. h-full inherits from html/body, whose 100% is the
    // *large* viewport — the height a phone browser would have if its URL bar
    // were retracted. With the bar on screen the app was that much taller than
    // the room it had, and because body is overflow:hidden here, the part
    // underneath could not be scrolled to. dvh tracks what is actually visible.
    <div data-app-shell className="flex h-dvh flex-col">
      {/* Renders nothing on the web, where the browser owns the chrome. In the
          desktop app it is the title bar: the whole strip on Windows, where
          decorations are off, and a drag region beside the native traffic
          lights on macOS. The column wrapper is what gives it somewhere to sit
          above the sidebar rather than beside it. */}
      <DesktopTitleBar />

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 border-r lg:block">
          <SidebarBody />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarBody onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="flex-1 truncate text-sm font-semibold">
            {title ?? 'Virgo'}
          </span>
          <NotificationBell />
          <ThemeToggle />
          {actions}
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          {/* Above the verification notice: that one is about this account and
              comes back every load until it is resolved, while this is about
              the application itself and can be dismissed for good. Renders
              nothing at all in the web build. */}
          {/* First of the three: being offline explains most other failures,
              so it belongs above them rather than under. */}
          <OfflineBanner />
          <DesktopUpdateBanner />
          <VerifyEmailBanner />
          {children}
          </main>
        </div>
      </div>
    </div>
  );
}

/**
 * The header inside a page's scroll area.
 *
 * Separate from the shell's mobile bar, which is outside the scroll area and
 * pinned by the layout itself.
 *
 * Sticky, because of what lives in it. The bell is here — it is the only way
 * into the notification list — and so are a page's actions, and both were
 * scrolling out of reach on any list long enough to be worth scrolling. A
 * solid background rather than a blur: content passes directly underneath
 * this, and translucency over a dense list is noise, not depth.
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
  return (
    <div
      className={cn(
        'sticky top-0 z-30 flex flex-wrap items-start justify-between gap-4 border-b bg-background px-6 py-5',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* Under `lg` this sits in the shell's own bar instead, which is
            already pinned — two bells on one screen is one too many. */}
        <span className="hidden lg:inline-flex">
          <NotificationBell />
          <ThemeToggle />
        </span>
        {actions}
      </div>
    </div>
  );
}
