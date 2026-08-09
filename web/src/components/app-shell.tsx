'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState, type ComponentType, type ReactNode } from 'react';
import {
  BriefcaseBusiness,
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { useEventInvitations } from '@/hooks/useScheduleEvents';
import { useUnseenJobs } from '@/hooks/useJobs';
import { ThemeToggle } from '@/components/theme-toggle';
import { VerifyEmailBanner } from '@/components/verify-email-banner';

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Which live count fills this item's badge slot, if any. */
  badge?: 'unread' | 'invitations' | 'friendRequests' | 'eventInvites' | 'newJobs';
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
  // Open postings this user has not looked at yet.
  const { count: newJobs } = useUnseenJobs();

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

      <ScrollArea className="flex-1">
        <NavLinks onNavigate={onNavigate} />
      </ScrollArea>

      <div className="border-t p-3">
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
  children: ReactNode;
  /** Shown in the mobile header, where the sidebar is hidden. */
  title?: string;
  actions?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    // data-app-shell is what globals.css keys `body { overflow: hidden }` off.
    // The rule has to be conditional: it keeps the sidebar still while the app
    // scrolls, and it stops the marketing page scrolling at all.
    <div data-app-shell className="flex h-full">
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
          <ThemeToggle />
          {actions}
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <VerifyEmailBanner />
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * The header inside a page's scroll area.
 *
 * Separate from the shell's mobile bar so a page's title and actions scroll
 * with its content on desktop, where there is no persistent top bar to pin
 * them to.
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
        'flex flex-wrap items-start justify-between gap-4 border-b px-6 py-5',
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
        <span className="hidden lg:inline-flex">
          <ThemeToggle />
        </span>
        {actions}
      </div>
    </div>
  );
}
