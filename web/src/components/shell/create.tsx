'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  AlarmClock,
  BriefcaseBusiness,
  CalendarPlus,
  FolderPlus,
  HandCoins,
  ImagePlus,
  Images,
  NotebookPen,
  Plus,
  Receipt,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CreateWorkspaceDialog } from '@/components/workspaces/create-workspace-dialog';
import { NewAlbumDialog } from '@/components/new-album-dialog';
import { EventDialog } from '@/components/schedule/event-dialog';
import { NewReminderDialog } from '@/components/schedule/reminder-dialog';
import { MoneyEntryDialog } from '@/components/money/money-entry-dialog';
import { PackageDialog } from '@/components/money/package-dialog';
import { useUsage } from '@/hooks/useUsage';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { DiscardScope, isPageDirty, leaveIfDiscarded } from '@/lib/discard-guard';
import { todayKey } from '@/lib/calendar';
import { cn } from '@/lib/utils';

/** Everything the + in the top bar can start. The phone's list, in its order. */
export type CreateKind =
  | 'showcase'
  | 'job'
  | 'workspace'
  | 'album'
  | 'event'
  | 'reminder'
  | 'income'
  | 'expense'
  | 'package';

interface CreateItem {
  kind: CreateKind;
  label: string;
  /** One line saying what it is, for somebody who has never made one. */
  detail: string;
  icon: ComponentType<{ className?: string }>;
}

/**
 * The phone's Create sheet, word for word (mobile/components/CreateSheet.tsx).
 *
 * In four groups, by what the thing is for, and in an order that never
 * changes with the page: the page you are on marks its own row instead.
 */
const GROUPS: { title: string; items: CreateItem[] }[] = [
  {
    title: 'Share',
    items: [
      { kind: 'showcase', label: 'Showcase', detail: 'Post your work to the Feed', icon: ImagePlus },
      { kind: 'job', label: 'Job', detail: 'Hire people for a shoot', icon: BriefcaseBusiness },
    ],
  },
  {
    title: 'Organize',
    items: [
      { kind: 'workspace', label: 'Workspace', detail: 'A home for one client', icon: FolderPlus },
      { kind: 'album', label: 'Album', detail: 'Photos and films, in a workspace', icon: Images },
    ],
  },
  {
    title: 'Plan',
    items: [
      { kind: 'event', label: 'Event', detail: 'A shoot, review or deadline', icon: CalendarPlus },
      { kind: 'reminder', label: 'Reminder', detail: 'A nudge at a set time', icon: AlarmClock },
    ],
  },
  {
    title: 'Money',
    items: [
      { kind: 'income', label: 'Income', detail: 'A fee, a deposit, a balance paid', icon: HandCoins },
      { kind: 'expense', label: 'Expense', detail: 'Transport, meals, crew, gear', icon: Receipt },
      { kind: 'package', label: 'Package', detail: "A client's total, deposit and balance", icon: NotebookPen },
    ],
  },
];

/**
 * Not yet on the web. A row here stays in the list, so nothing moves when it
 * arrives, and says where it can be done today. Empty since showcases came.
 */
const UNAVAILABLE: Partial<Record<CreateKind, string>> = {};

/** The ones that are pages of their own rather than dialogs over this one. */
const PAGES: Partial<Record<CreateKind, string>> = {
  showcase: '/showcase/new',
  job: '/jobs/new',
};

/** The row the current page is about, if any. */
function kindFor(pathname: string): CreateKind | undefined {
  if (pathname === '/feed' || pathname.startsWith('/showcase/')) return 'showcase';
  if (pathname === '/jobs' || pathname.startsWith('/jobs/')) return 'job';
  if (pathname === '/workspaces') return 'workspace';
  if (pathname === '/albums' || pathname.startsWith('/albums/')) return 'album';
  if (pathname.startsWith('/workspaces/')) return 'album';
  if (pathname === '/schedule') return 'event';
  return undefined;
}

/** `/workspaces/<id>`, the workspace a new album or event starts in. */
function workspaceIn(pathname: string): string | null {
  const match = /^\/workspaces\/([^/]+)$/.exec(pathname);
  return match && match[1] !== 'archived' ? match[1] : null;
}

interface CreateApi {
  open: (kind: CreateKind) => void;
}

const CreateContext = createContext<CreateApi | null>(null);

/** Opens a Create flow from anywhere, as the menu does. */
export function useCreate(): CreateApi {
  const api = useContext(CreateContext);
  if (!api) throw new Error('useCreate needs a CreateProvider above it');
  return api;
}

/**
 * The forms behind the Create menu, mounted once beside the shell.
 *
 * Dialogs over the page you are on, as the phone's are modals over its
 * screen: Cancel leaves you where you were. The workspace, event and reminder
 * forms used to be private to their own pages and could not be opened from
 * anywhere else.
 */
export function CreateProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [openKind, setOpenKind] = useState<CreateKind | null>(null);
  const { atWorkspaceLimit, usage } = useUsage();
  // The same query the dialogs list from, so this costs no request of its own.
  const { workspaces } = useWorkspaces({ limit: 100, orderBy: 'name', direction: 'asc' });

  // Only a workspace of your own: an album or event can only be filed under one.
  const hereId = workspaceIn(pathname);
  const here = hereId ? workspaces.find((w) => w.id === hereId && w.is_owner) : undefined;

  const open = useCallback(
    (kind: CreateKind) => {
      if (UNAVAILABLE[kind]) return;
      const page = PAGES[kind];
      if (page) {
        leaveIfDiscarded(isPageDirty(), () => router.push(page));
        return;
      }
      // Checked as it is chosen, as on the phone, not after the form is filled.
      if (kind === 'workspace' && atWorkspaceLimit) {
        toast.error('Workspace limit reached', {
          description: `Your ${usage?.plan ?? 'free'} plan includes ${usage?.workspaces.limit} workspace${usage?.workspaces.limit === 1 ? '' : 's'}. Archived ones count too, so delete one you have finished with to add another.`,
        });
        return;
      }
      setOpenKind(kind);
    },
    [atWorkspaceLimit, router, usage],
  );

  /*
   * Onto what was made, unless the page beneath has unsaved work: then it is
   * offered instead, and taking it asks first. A router.push is not a link,
   * so nothing else would have asked.
   */
  const created = (what: string, href: string) => {
    if (!isPageDirty()) {
      router.push(href);
      return;
    }
    toast.success(`${what} created`, {
      action: {
        label: 'Open',
        onClick: () => leaveIfDiscarded(isPageDirty(), () => router.push(href)),
      },
    });
  };

  const close = (next: boolean) => {
    if (!next) setOpenKind(null);
  };

  const api = useMemo(() => ({ open }), [open]);

  return (
    <CreateContext.Provider value={api}>
      {children}
      {/* Scoped, so a half-filled Create form never counts as the page's. */}
      <DiscardScope value="create">
        <CreateWorkspaceDialog
          open={openKind === 'workspace'}
          onOpenChange={close}
          onCreated={(workspace) => created('Workspace', `/workspaces/${workspace.id}`)}
        />
        <NewAlbumDialog
          open={openKind === 'album'}
          onOpenChange={close}
          workspaceId={here?.id}
          onCreated={(album) => created('Album', `/albums/${album.id}`)}
        />
        <EventDialog
          open={openKind === 'event'}
          onOpenChange={close}
          defaultDate={todayKey()}
          defaultWorkspaceId={here?.id ?? null}
          onCreated={(event) => created('Event', `/schedule?event=${event.id}`)}
        />
        <NewReminderDialog
          open={openKind === 'reminder'}
          onOpenChange={close}
          onCreated={() => created('Reminder', '/schedule?tab=reminders')}
        />
        {/* Logged where you are, without leaving it: the dialog says it saved. */}
        <MoneyEntryDialog
          open={openKind === 'income' || openKind === 'expense'}
          onOpenChange={close}
          kind={openKind === 'income' ? 'income' : 'expense'}
        />
        <PackageDialog
          open={openKind === 'package'}
          onOpenChange={close}
          onCreated={(pkg) => created('Package', `/money/packages/${pkg.id}`)}
        />
      </DiscardScope>
    </CreateContext.Provider>
  );
}

/** Whether a key press landed somewhere that takes typing. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]');
}

/**
 * The one + that starts everything: what the separate buttons on Dashboard,
 * Workspaces, Schedule, Jobs and Albums used to do between them.
 *
 * C opens it from anywhere that is not a text field, a dialog or a menu.
 * Not Ctrl+N, which the browser keeps for a new window, and not Ctrl+K, which
 * is worth keeping for a search later.
 */
export function CreateMenu() {
  const pathname = usePathname();
  const { open } = useCreate();
  const [menuOpen, setMenuOpen] = useState(false);
  const current = kindFor(pathname);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'c' && event.key !== 'C') return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (isTyping(event.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
      event.preventDefault();
      setMenuOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          aria-label="Create"
          title="Create (C)"
          className="gap-1.5 px-2.5 sm:px-3"
        >
          <Plus className="size-4" />
          <span className="hidden sm:inline">Create</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-1.5">
        <DropdownMenuLabel className="flex items-center justify-between px-2 pb-1 pt-1.5 text-base font-bold text-foreground">
          Create
          <DropdownMenuShortcut>C</DropdownMenuShortcut>
        </DropdownMenuLabel>
        {GROUPS.map((group, i) => (
          <DropdownMenuGroup key={group.title}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {group.title}
            </DropdownMenuLabel>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isHere = item.kind === current;
              const unavailable = UNAVAILABLE[item.kind];
              return (
                <DropdownMenuItem
                  key={item.kind}
                  disabled={!!unavailable}
                  onSelect={() => open(item.kind)}
                  aria-label={`${item.label}. ${unavailable ?? item.detail}`}
                  className={cn('gap-3 rounded-lg px-2 py-2', isHere && 'bg-primary/10')}
                >
                  <span
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-lg',
                      isHere ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
                    )}
                  >
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {unavailable ?? item.detail}
                    </span>
                  </span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
