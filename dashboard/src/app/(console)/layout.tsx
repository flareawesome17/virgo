'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  Activity,
  CreditCard,
  FolderOpen,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  ScrollText,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { signOut, tokens } from '@/api/client';
import { useMe } from '@/hooks/useConsole';
import { ForcePasswordChange } from '@/components/console/force-password-change';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Every nav entry names the permission it needs.
 *
 * The same string the server checks, so a viewer is not shown a Console
 * Accounts tab that would 403 the moment they clicked it. This is presentation
 * only — AdminGuard is what actually enforces it, and a hand-typed URL is
 * refused there regardless of what this array says.
 */
const NAV = [
  { href: '/', label: 'Overview', icon: LayoutDashboard, permission: 'overview.read' },
  { href: '/users', label: 'Users', icon: Users, permission: 'users.read' },
  { href: '/content', label: 'Content', icon: FolderOpen, permission: 'content.read' },
  { href: '/billing', label: 'Billing', icon: CreditCard, permission: 'billing.read' },
  { href: '/support', label: 'Support', icon: LifeBuoy, permission: 'support.read' },
  { href: '/system', label: 'System', icon: Activity, permission: 'system.read' },
  { href: '/accounts', label: 'Console accounts', icon: ShieldCheck, permission: 'admins.read' },
  { href: '/audit', label: 'Audit log', icon: ScrollText, permission: 'audit.read' },
];

export default function ConsoleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const { me, can, isLoading, isError } = useMe();

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
        <div className="hidden w-60 border-r p-4 lg:block">
          <Skeleton className="h-8 w-32" />
          <div className="mt-6 space-y-2">
            {NAV.map((n) => (
              <Skeleton key={n.href} className="h-9 w-full" />
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

  const visible = NAV.filter((item) => can(item.permission));

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 flex-col border-r lg:flex">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight">Virgo Console</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {me.roleLabel}
            </p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2">
          {visible.map((item) => {
            const active =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors',
                  active
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t px-3 py-3">
          <p className="truncate text-xs font-medium">{me.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">{me.email}</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-8 w-full justify-start px-2 text-muted-foreground"
            onClick={async () => {
              await signOut();
              router.replace('/sign-in');
            }}
          >
            <LogOut className="size-3.5" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* The nav collapses to a scrolling strip rather than a hamburger:
            a console is used on a laptop, and a drawer would be more
            machinery than the narrow case deserves. */}
        <div className="flex gap-1 overflow-x-auto border-b px-3 py-2 lg:hidden">
          {visible.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
            >
              {item.label}
            </Link>
          ))}
        </div>
        <main className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
