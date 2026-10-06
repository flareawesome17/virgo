'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ContextMenu } from 'radix-ui';
import { LifeBuoy, User, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type RecordKind = 'user' | 'ticket';

export interface RecordTab {
  href: string;
  kind: RecordKind;
  /** Absent until the record has loaded; the tab says "Loading…" until then. */
  title?: string;
}

/** Where closing the last record of a kind goes back to. */
const HOME: Record<RecordKind, string> = { user: '/virgo-users', ticket: '/support' };
const ICON = { user: User, ticket: LifeBuoy } as const;

/**
 * Enough to work a queue, few enough to read. Opening one more drops the
 * oldest tab that is not the one on screen.
 */
const MAX_TABS = 12;

interface TabsContext {
  tabs: RecordTab[];
  open: (tab: RecordTab) => void;
  close: (href: string) => void;
  closeOthers: (href: string) => void;
  closeAll: () => void;
}

const Context = createContext<TabsContext | null>(null);

/** Per console account, so two people sharing a browser keep their own. */
function storageKey(adminId: string) {
  return `virgo.console.tabs.${adminId}`;
}

function load(adminId: string): RecordTab[] {
  try {
    const raw = localStorage.getItem(storageKey(adminId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (t): t is RecordTab =>
            typeof t?.href === 'string' && (t.kind === 'user' || t.kind === 'ticket'),
        )
      : [];
  } catch {
    // Private windows and blocked storage throw. Tabs are a convenience, so
    // the console simply starts with none.
    return [];
  }
}

/**
 * The records a staff member has open — customers and tickets — as tabs.
 *
 * Termix keeps several servers open side by side; the console's equivalent is
 * working a support queue with the customer, the ticket and the next ticket
 * all one click apart. A tab is only a link plus a title: React Query's cache
 * is what makes switching back instant.
 */
export function RecordTabsProvider({
  adminId,
  children,
}: {
  adminId: string;
  children: React.ReactNode;
}) {
  // Read while rendering, not in an effect. The console shell only mounts
  // this once the signed-in account has loaded, which never happens in the
  // server render — and a page's own effect (useRecordTab) runs before its
  // parent's, so tabs loaded in an effect would overwrite the one it opened.
  const [tabs, setTabs] = useState<RecordTab[]>(() => load(adminId));

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(adminId), JSON.stringify(tabs));
    } catch {
      /* see load() */
    }
  }, [adminId, tabs]);

  const open = useCallback((tab: RecordTab) => {
    setTabs((prev) => {
      const at = prev.findIndex((t) => t.href === tab.href);
      if (at >= 0) {
        // Already open: only a title it did not have yet is worth a re-render.
        if (!tab.title || prev[at].title === tab.title) return prev;
        const next = prev.slice();
        next[at] = { ...prev[at], title: tab.title };
        return next;
      }
      const next = [...prev, tab];
      return next.length > MAX_TABS ? next.slice(next.length - MAX_TABS) : next;
    });
  }, []);

  const close = useCallback(
    (href: string) => setTabs((prev) => prev.filter((t) => t.href !== href)),
    [],
  );
  const closeOthers = useCallback(
    (href: string) => setTabs((prev) => prev.filter((t) => t.href === href)),
    [],
  );
  const closeAll = useCallback(() => setTabs([]), []);

  const value = useMemo(
    () => ({ tabs, open, close, closeOthers, closeAll }),
    [tabs, open, close, closeOthers, closeAll],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useRecordTabs(): TabsContext {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useRecordTabs needs RecordTabsProvider');
  return ctx;
}

/**
 * Opens the page's record as a tab, and names it once the record has loaded.
 *
 * Called by a detail page, so opening a customer from anywhere — a table row,
 * a report, the command palette, a pasted link — lands in the tab strip.
 */
export function useRecordTab(tab: RecordTab) {
  const { open } = useRecordTabs();
  const { href, kind, title } = tab;
  useEffect(() => {
    open({ href, kind, title });
  }, [open, href, kind, title]);
}

/** The strip in the top bar. Empty, it explains itself instead of vanishing. */
export function RecordTabBar() {
  const { tabs, close, closeOthers, closeAll } = useRecordTabs();
  const pathname = usePathname();
  const router = useRouter();

  function closeTab(href: string) {
    const at = tabs.findIndex((t) => t.href === href);
    close(href);
    if (href !== pathname) return;
    // Closing the record on screen moves to its neighbour, the way a browser
    // does, or back to its list when it was the last one.
    const neighbour = tabs[at + 1] ?? tabs[at - 1];
    router.push(neighbour ? neighbour.href : HOME[tabs[at].kind]);
  }

  if (tabs.length === 0) {
    return (
      <p className="hidden truncate px-1 text-xs text-muted-foreground/70 lg:block">
        Customers and tickets you open stay here as tabs.
      </p>
    );
  }

  return (
    <div
      role="tablist"
      aria-label="Open records"
      className="flex h-full min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => {
        const active = tab.href === pathname;
        const Icon = ICON[tab.kind];
        return (
          <ContextMenu.Root key={tab.href}>
            <ContextMenu.Trigger asChild>
              <div
                role="tab"
                aria-selected={active}
                className={cn(
                  'group relative flex max-w-52 shrink-0 items-center border-r text-sm transition-colors',
                  active
                    ? 'bg-background text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                )}
                // Middle-click closes, as it does in every browser and in Termix.
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    closeTab(tab.href);
                  }
                }}
              >
                {active && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" aria-hidden />
                )}
                <Link
                  href={tab.href}
                  className="flex h-full min-w-0 items-center gap-2 py-0 pl-3 pr-1"
                  title={tab.title}
                >
                  <Icon className={cn('size-3.5 shrink-0', active && 'text-primary')} />
                  <span className="truncate">{tab.title ?? 'Loading…'}</span>
                </Link>
                <button
                  type="button"
                  aria-label={`Close ${tab.title ?? 'tab'}`}
                  onClick={() => closeTab(tab.href)}
                  className={cn(
                    'mr-1.5 grid size-5 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                    !active && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                  )}
                >
                  <X className="size-3" />
                </button>
              </div>
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Content className="z-50 min-w-44 overflow-hidden rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md">
                <MenuItem onSelect={() => closeTab(tab.href)}>Close</MenuItem>
                <MenuItem
                  disabled={tabs.length < 2}
                  onSelect={() => {
                    closeOthers(tab.href);
                    if (tab.href !== pathname) router.push(tab.href);
                  }}
                >
                  Close others
                </MenuItem>
                <MenuItem
                  onSelect={() => {
                    const onRecord = tabs.find((t) => t.href === pathname);
                    closeAll();
                    if (onRecord) router.push(HOME[onRecord.kind]);
                  }}
                >
                  Close all
                </MenuItem>
              </ContextMenu.Content>
            </ContextMenu.Portal>
          </ContextMenu.Root>
        );
      })}
    </div>
  );
}

function MenuItem({
  children,
  disabled,
  onSelect,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <ContextMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className="cursor-default rounded-sm px-2 py-1.5 text-xs outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-accent data-[disabled]:opacity-50"
    >
      {children}
    </ContextMenu.Item>
  );
}
