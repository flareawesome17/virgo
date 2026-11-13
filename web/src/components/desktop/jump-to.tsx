'use client';

import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useRouter } from 'next/navigation';
import { FolderOpen, Images, Search, Settings, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IS_WINDOWS } from '@/lib/desktop';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useAlbums } from '@/hooks/useAlbums';
import { useFriends } from '@/hooks/useFriends';
import { NAV } from '@/components/shell/nav';

interface Target {
  key: string;
  label: string;
  /** What kind of thing it is, shown at the end of its row. */
  kind: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}

const SHORTCUT = IS_WINDOWS ? 'Ctrl K' : '⌘K';
/** How many of each kind show, so one long list does not bury the others. */
const PER_KIND = 6;

const PAGES: Target[] = [
  ...NAV.flatMap((group) =>
    group.items.map((item) => ({
      key: `page:${item.href}`,
      label: item.label,
      kind: 'Page',
      href: item.href,
      icon: item.icon,
    })),
  ),
  { key: 'page:/profile', label: 'Your profile', kind: 'Page', href: '/profile', icon: UserRound },
  { key: 'page:/settings', label: 'Settings', kind: 'Page', href: '/settings', icon: Settings },
];

/**
 * The field in the middle of the desktop title bar: type a few letters, go
 * there.
 *
 * A page, a workspace, an album or a connection, by name. The desktop window
 * has no address bar and its navigation is a rail of icons, so this is how
 * somebody who knows what they want gets to it without walking there. Ctrl K
 * (⌘K on a Mac) opens it from anywhere.
 *
 * It matches names already loaded for the lists the app has; it is not a
 * search of files or messages, and says so by what it lists. The lists are
 * only asked for once it is opened.
 */
export function JumpTo() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const { workspaces } = useWorkspaces({ limit: 100 }, { enabled: open });
  const { albums } = useAlbums({ limit: 100 }, { enabled: open });
  const { friends } = useFriends({ status: 'accepted', limit: 100 }, { enabled: open });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.ctrlKey || event.metaKey)) return;
      if (event.altKey || event.shiftKey) return;
      event.preventDefault();
      setOpen((was) => !was);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    const match = (label: string) => !term || label.toLowerCase().includes(term);
    const take = (targets: Target[]) => targets.filter((t) => match(t.label)).slice(0, PER_KIND);

    const places: Target[] = [
      ...workspaces.map((w) => ({
        key: `workspace:${w.id}`,
        label: w.name,
        kind: 'Workspace',
        href: `/workspaces/${w.id}`,
        icon: FolderOpen,
      })),
    ];
    const pictures: Target[] = albums.map((a) => ({
      key: `album:${a.id}`,
      label: a.name,
      kind: 'Album',
      href: `/albums/${a.id}`,
      icon: Images,
    }));
    const people: Target[] = friends.map((f) => ({
      key: `person:${f.id}`,
      label: f.friend_name,
      kind: 'Person',
      // Their page when they have one; the list of people when they do not.
      href: f.friend_handle ? `/u/${f.friend_handle}` : '/people',
      icon: UserRound,
    }));

    // With nothing typed: the pages, then the work you opened last.
    if (!term) return [...PAGES, ...places.slice(0, PER_KIND)];
    return [...take(PAGES), ...take(places), ...take(pictures), ...take(people)];
  }, [query, workspaces, albums, friends]);

  const active = Math.min(cursor, Math.max(results.length - 1, 0));

  const go = (target: Target | undefined) => {
    if (!target) return;
    setOpen(false);
    router.push(target.href);
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery('');
      setCursor(0);
    }
  };

  const move = (by: number) => {
    if (results.length === 0) return;
    const next = (active + by + results.length) % results.length;
    setCursor(next);
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${next}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Jump to a workspace, album or person (${SHORTCUT})`}
        className="flex h-7 w-full max-w-[440px] items-center gap-2 rounded-lg bg-card pl-2.5 pr-2 text-left text-xs text-muted-foreground outline-none ring-1 ring-border transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Search className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Jump to a workspace, album or person</span>
        <kbd className="shrink-0 rounded bg-muted px-1.5 py-px font-sans text-[11px] font-semibold text-secondary-foreground">
          {SHORTCUT}
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="top-[18%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
        >
          <DialogTitle className="sr-only">Jump to</DialogTitle>
          <DialogDescription className="sr-only">
            Type the name of a page, workspace, album or person, then press Enter.
          </DialogDescription>
          <div className="flex items-center gap-2.5 border-b px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCursor(0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  move(1);
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  move(-1);
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  go(results[active]);
                }
              }}
              placeholder="Jump to a workspace, album or person"
              aria-label="Jump to"
              role="combobox"
              aria-expanded
              aria-controls="jump-to-results"
              aria-activedescendant={results[active] ? `jump-${active}` : undefined}
              className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div
            ref={listRef}
            id="jump-to-results"
            role="listbox"
            aria-label="Places"
            className="max-h-[320px] overflow-y-auto p-1.5"
          >
            {results.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nothing is called “{query.trim()}”.
              </p>
            ) : (
              results.map((target, i) => {
                const Icon = target.icon;
                return (
                  <button
                    key={target.key}
                    id={`jump-${i}`}
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    data-index={i}
                    onMouseMove={() => setCursor(i)}
                    onClick={() => go(target)}
                    className={cn(
                      'flex h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm',
                      i === active ? 'bg-muted text-foreground' : 'text-foreground',
                    )}
                  >
                    <Icon className="size-4 shrink-0 text-secondary-foreground" />
                    <span className="min-w-0 flex-1 truncate font-medium">{target.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{target.kind}</span>
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
