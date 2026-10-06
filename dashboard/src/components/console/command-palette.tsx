'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { Dialog } from 'radix-ui';
import {
  CornerDownLeft,
  LifeBuoy,
  LogOut,
  Monitor,
  CircleUser,
  Moon,
  PanelLeft,
  Search,
  Sun,
  User,
  type LucideIcon,
} from 'lucide-react';
import { signOut } from '@/api/client';
import type { AdminMe } from '@/api/console';
import { useTickets, useUsers } from '@/hooks/useConsole';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { cn } from '@/lib/utils';
import { NAV } from './nav';
import { useRecordTabs } from './record-tabs';

interface Command {
  id: string;
  group: string;
  label: string;
  /** Second line of context, on the right: an email, a status. */
  hint?: string;
  icon: LucideIcon;
  /** Extra words to match on that are not shown. */
  keywords?: string;
  run: () => void;
}

/** Every word typed has to appear somewhere in the command. */
function matches(command: Command, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack =
    `${command.label} ${command.hint ?? ''} ${command.keywords ?? ''} ${command.group}`.toLowerCase();
  return words.every((w) => haystack.includes(w));
}

/** Searching the server starts here; one letter matches half the database. */
const MIN_SEARCH = 2;

/**
 * Ctrl/⌘ K: go anywhere, find anyone, do the common things.
 *
 * Pages, the records already open as tabs, a live search of accounts and
 * tickets, and a handful of actions, in one list driven by the keyboard. The
 * searches reuse the lists' own endpoints and only run for a role that may
 * read them, so nobody is offered a result that would 403 when opened.
 */
export function CommandPalette({
  me,
  open,
  onOpenChange,
  railPinned,
  onRailPinnedChange,
}: {
  me: AdminMe;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  railPinned: boolean;
  onRailPinnedChange: (pinned: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 flex max-h-[70vh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <Dialog.Title className="sr-only">Search the console</Dialog.Title>
          {/* Radix unmounts the content while closed, so every opening starts
              from an empty search rather than last time's half-typed one. */}
          <PaletteBody
            me={me}
            close={() => onOpenChange(false)}
            railPinned={railPinned}
            onRailPinnedChange={onRailPinnedChange}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PaletteBody({
  me,
  close,
  railPinned,
  onRailPinnedChange,
}: {
  me: AdminMe;
  close: () => void;
  railPinned: boolean;
  onRailPinnedChange: (pinned: boolean) => void;
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { tabs } = useRecordTabs();
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const can = (permission: string) => me.permissions.includes(permission);
  const term = useDebouncedValue(query.trim(), 200);
  const searching = term.length >= MIN_SEARCH;

  const users = useUsers({ q: term, limit: 5 }, searching && can('users.read'));
  const tickets = useTickets({ q: term, limit: 5 }, searching && can('support.read'));

  const go = (href: string) => () => router.push(href);

  const commands = useMemo(() => {
    const found: Command[] = [];

    if (term.length >= MIN_SEARCH) {
      for (const u of users.data?.data ?? []) {
        found.push({
          id: `user:${u.id}`,
          group: 'Virgo users',
          label: u.display_name?.trim() || u.email,
          hint: u.email,
          icon: User,
          run: go(`/virgo-users/${u.id}`),
        });
      }
      for (const t of tickets.data?.data ?? []) {
        found.push({
          id: `ticket:${t.id}`,
          group: 'Tickets',
          label: t.subject,
          hint: `${t.status} · ${t.user_email}`,
          icon: LifeBuoy,
          run: go(`/support/${t.id}`),
        });
      }
    }

    const local: Command[] = [
      ...tabs.map((t) => ({
        id: `tab:${t.href}`,
        group: 'Open tabs',
        label: t.title ?? t.href,
        icon: t.kind === 'user' ? User : LifeBuoy,
        run: go(t.href),
      })),
      ...NAV.flatMap((group) =>
        group.items
          .filter((item) => can(item.permission))
          .map((item) => ({
            id: `page:${item.href}`,
            group: 'Go to',
            label: item.label,
            icon: item.icon,
            keywords: item.keywords,
            run: go(item.href),
          })),
      ),
      ...(
        [
          ['light', 'Light', Sun],
          ['dark', 'Dark', Moon],
          ['system', 'Match the system', Monitor],
        ] as const
      ).map(([value, label, icon]) => ({
        id: `theme:${value}`,
        group: 'Actions',
        label: `Theme: ${label}`,
        hint: theme === value ? 'current' : undefined,
        icon,
        keywords: 'appearance colour mode',
        run: () => setTheme(value),
      })),
      {
        id: 'account',
        group: 'Actions',
        label: 'My account',
        hint: me.twoFactorEnabled ? undefined : 'two-factor is off',
        icon: CircleUser,
        keywords: 'profile password two-factor 2fa sessions security',
        run: go('/account'),
      },
      {
        id: 'rail',
        group: 'Actions',
        label: railPinned ? 'Collapse the sidebar' : 'Keep the sidebar open',
        icon: PanelLeft,
        keywords: 'pin rail menu navigation',
        run: () => onRailPinnedChange(!railPinned),
      },
      {
        id: 'sign-out',
        group: 'Actions',
        label: 'Sign out',
        icon: LogOut,
        keywords: 'log out leave',
        run: async () => {
          await signOut();
          router.replace('/sign-in');
        },
      },
    ];

    return [...found, ...local.filter((c) => matches(c, query))];
    // `go` and `can` are rebuilt every render from stable inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, query, users.data, tickets.data, tabs, theme, railPinned, me.permissions]);

  // Results arriving can shorten the list under the highlight.
  const active = Math.min(highlight, Math.max(commands.length - 1, 0));

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function run(command: Command | undefined) {
    if (!command) return;
    close();
    command.run();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (commands.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setHighlight((active + step + commands.length) % commands.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(commands[active]);
    }
  }

  const loading =
    term.length >= MIN_SEARCH && (users.isFetching || tickets.isFetching);
  const waiting = query.trim().length >= MIN_SEARCH && term !== query.trim();

  let lastGroup = '';

  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-2.5 border-b px-4">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search people and tickets, or jump to a page…"
          role="combobox"
          aria-expanded
          aria-controls="command-list"
          aria-activedescendant={commands[active] ? `command-${active}` : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {(loading || waiting) && (
          <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
        )}
      </div>

      <div
        ref={listRef}
        id="command-list"
        role="listbox"
        className="min-h-0 flex-1 overflow-y-auto p-1.5"
      >
        {commands.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            {loading || waiting ? 'Searching…' : 'Nothing matches that.'}
          </p>
        ) : (
          commands.map((command, i) => {
            const header = command.group !== lastGroup ? command.group : null;
            lastGroup = command.group;
            const Icon = command.icon;
            const on = i === active;
            return (
              <div key={command.id}>
                {header && (
                  <p className={cn('caption px-2.5 pb-1', i === 0 ? 'pt-1' : 'pt-3')}>
                    {header}
                  </p>
                )}
                <div
                  id={`command-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={on}
                  onMouseMove={() => setHighlight(i)}
                  onClick={() => run(command)}
                  className={cn(
                    'flex cursor-default items-center gap-3 rounded-md px-2.5 py-1.5 text-sm',
                    on && 'bg-accent text-accent-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground',
                      on && 'bg-primary/15 text-primary',
                    )}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{command.label}</span>
                  {command.hint && (
                    <span className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">
                      {command.hint}
                    </span>
                  )}
                  {on && (
                    <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex shrink-0 items-center gap-4 border-t px-4 py-2 text-[11px] text-muted-foreground">
        <span>
          <Kbd>↑</Kbd> <Kbd>↓</Kbd> to move
        </span>
        <span>
          <Kbd>↵</Kbd> to open
        </span>
        <span>
          <Kbd>esc</Kbd> to close
        </span>
      </div>
    </>
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-grid h-5 min-w-5 place-items-center rounded border bg-muted px-1 font-sans text-[10px] font-medium text-muted-foreground',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** Ctrl+K on Windows and Linux, ⌘K on a Mac, from anywhere in the console. */
export function useCommandPaletteShortcut(toggle: () => void) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);
}
