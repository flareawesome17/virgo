'use client';

import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type FocusEvent,
  type ReactNode,
} from 'react';
import { Copy, Forward, MoreHorizontal, Pencil, Reply, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  EDIT_WINDOW_MINUTES,
  REACTIONS,
  REACTION_EMOJI,
  REACTION_LABEL,
  canEditMessage,
  type ConversationMessage,
  type ReactionKey,
} from '@/api';

type Side = 'start' | 'end' | 'center';
type Placement = 'beside' | 'above' | 'below';

/** Where the toolbar sits against the bubble, by side and by how much room there is. */
function placementClass(side: Side, placement: Placement): string {
  const toEnd = side === 'end';
  if (placement === 'beside') {
    // Padding, not margin, for the gap: the gap is then part of the toolbar,
    // so the pointer crossing it never leaves the message.
    return toEnd ? 'right-full top-1/2 -translate-y-1/2 pr-2' : 'left-full top-1/2 -translate-y-1/2 pl-2';
  }
  const across = toEnd || side === 'center' ? 'right-0' : 'left-0';
  return placement === 'above' ? `bottom-full pb-1 ${across}` : `top-full pt-1 ${across}`;
}

/**
 * One message in the thread, with its actions on hover and on focus.
 *
 * The row itself takes focus, so a keyboard reaches each message with Tab,
 * and the toolbar is the next stop after it — one stop, with the arrow keys
 * moving inside it. The toolbar sits beside the bubble when there is room
 * there (board 148), and above it in a narrow window rather than pushing the
 * thread sideways.
 */
export function MessageFrame({
  side,
  label,
  header,
  below,
  toolbar,
  width = 'max-w-[75%]',
  children,
}: {
  side: Side;
  /** What a screen reader hears for the row: who, and when. */
  label: string;
  /** Above the bubble: the sender's name in a group. */
  header?: ReactNode;
  /** Under the bubble: its reactions. */
  below?: ReactNode;
  /** The actions; `hold` keeps them showing while a menu of theirs is open. */
  toolbar?: ((hold: (open: boolean) => void) => ReactNode) | null;
  width?: string;
  children: ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement>('beside');
  const [held, setHeld] = useState(false);

  const place = () => {
    const row = rowRef.current;
    const bubble = bubbleRef.current;
    const bar = barRef.current;
    if (!row || !bubble || !bar) return;
    const r = row.getBoundingClientRect();
    const b = bubble.getBoundingClientRect();
    const room = side === 'end' ? b.left - r.left : r.right - b.right;
    if (room >= bar.offsetWidth + 4) {
      setPlacement('beside');
      return;
    }
    const scroller = row.closest('[data-thread-scroller]');
    const top = scroller ? scroller.getBoundingClientRect().top : 0;
    setPlacement(b.top - top >= bar.offsetHeight + 4 ? 'above' : 'below');
  };

  return (
    <div
      ref={rowRef}
      role="group"
      aria-label={label}
      tabIndex={0}
      onPointerEnter={toolbar ? place : undefined}
      onFocus={toolbar ? place : undefined}
      className={cn(
        'group/message flex flex-col outline-none',
        side === 'end' ? 'items-end' : side === 'center' ? 'items-center' : 'items-start',
      )}
    >
      <div
        className={cn(
          'flex min-w-0 flex-col',
          width,
          side === 'end' ? 'items-end' : side === 'center' ? 'w-full items-center' : 'items-start',
        )}
      >
        {header}
        <div ref={bubbleRef} className={cn('relative max-w-full', side === 'center' && 'w-full')}>
          {children}
          {toolbar && (
            <div
              ref={barRef}
              data-held={held}
              className={cn(
                'absolute z-20 w-max transition-opacity duration-150',
                'pointer-events-none opacity-0',
                'group-hover/message:pointer-events-auto group-hover/message:opacity-100',
                'group-focus-within/message:pointer-events-auto group-focus-within/message:opacity-100',
                'data-[held=true]:pointer-events-auto data-[held=true]:opacity-100',
                placementClass(side, placement),
              )}
            >
              {toolbar(setHeld)}
            </div>
          )}
        </div>
        {below}
      </div>
    </div>
  );
}

/**
 * Arrow keys between a toolbar's buttons, with one Tab stop for the lot —
 * the toolbar pattern. Without it, every message in a thread was eight more
 * presses of Tab.
 */
function RovingToolbar({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef(0);

  const items = () =>
    Array.from(ref.current?.querySelectorAll<HTMLElement>('[data-toolbar-item]') ?? []);
  const sync = () => {
    const list = items();
    if (active.current >= list.length) active.current = 0;
    list.forEach((el, i) => {
      el.tabIndex = i === active.current ? 0 : -1;
    });
  };

  // After every render: the buttons a toolbar has can change with the message.
  useLayoutEffect(sync);

  // Events from the ⋯ menu reach here too, through React's tree though not
  // the page's: the menu is portalled out. Only the toolbar's own count.
  const inside = (target: EventTarget) => !!ref.current?.contains(target as Node);

  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (!inside(event.target)) return;
    const at = items().indexOf(event.target as HTMLElement);
    if (at < 0) return;
    active.current = at;
    sync();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!inside(event.target)) return;
    const list = items();
    if (list.length === 0) return;
    let next = active.current;
    if (event.key === 'ArrowRight') next = (next + 1) % list.length;
    else if (event.key === 'ArrowLeft') next = (next - 1 + list.length) % list.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = list.length - 1;
    else return;
    event.preventDefault();
    active.current = next;
    sync();
    list[next]?.focus();
  };

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={label}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      className={className}
    >
      {children}
    </div>
  );
}

const ITEM =
  'grid size-7 place-items-center rounded-full transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * A message's actions: the six reactions, Reply, and ⋯ for the rest.
 *
 * Each part is there only when it applies — no reactions or Reply where the
 * thread takes nothing new, no Edit once the window has passed, only Delete
 * on a message that has not gone yet.
 */
export function MessageToolbar({
  hold,
  side,
  react,
  onReply,
  onForward,
  onCopy,
  edit,
  onDelete,
  canDeleteForEveryone,
  onDiscard,
}: {
  hold: (open: boolean) => void;
  side: Side;
  /** Yours now, and how to change it. */
  react?: { current: ReactionKey | null; onReact: (reaction: ReactionKey | null) => void };
  onReply?: () => void;
  onForward?: () => void;
  onCopy?: () => void;
  /** Offered while canEditMessage holds, checked as the menu opens. */
  edit?: { message: ConversationMessage; meId: string | undefined; onEdit: () => void };
  onDelete?: (scope: 'me' | 'everyone') => void;
  canDeleteForEveryone?: boolean;
  /** An unsent message: taken off this device, nothing to ask the server. */
  onDiscard?: () => void;
}) {
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  /**
   * Set when a choice sends focus somewhere else — the composer for Edit, a
   * dialog for Forward — so the closing menu does not pull it back to ⋯.
   */
  /*
   * An action that moves focus elsewhere — Edit into the message box, Forward
   * into its dialog — runs once the menu has closed, not while it is closing.
   * Run straight away, it lost to the menu's own focus trap: the box got focus
   * and the closing menu took it back, so typing went nowhere.
   */
  const leaving = useRef<(() => void) | null>(null);
  const away = (run: () => void) => {
    leaving.current = run;
  };

  const minutesLeft =
    edit && openedAt !== null && canEditMessage(edit.message, edit.meId, openedAt)
      ? Math.max(
          1,
          Math.ceil(
            (new Date(edit.message.created_at).getTime() +
              EDIT_WINDOW_MINUTES * 60_000 -
              openedAt) /
              60_000,
          ),
        )
      : 0;

  const hasMenu = !!(onForward || onCopy || edit || onDelete || onDiscard);

  return (
    <RovingToolbar
      label="Message actions"
      className="flex h-9 items-center gap-0.5 rounded-full border bg-popover px-1 text-popover-foreground shadow-md"
    >
      {react &&
        REACTIONS.map((key) => (
          <button
            key={key}
            type="button"
            data-toolbar-item
            aria-label={REACTION_LABEL[key]}
            aria-pressed={react.current === key}
            title={REACTION_LABEL[key]}
            onClick={() => react.onReact(react.current === key ? null : key)}
            className={cn(
              ITEM,
              'text-[17px] leading-none',
              react.current === key && 'bg-accent ring-1 ring-primary',
            )}
          >
            <span aria-hidden>{REACTION_EMOJI[key]}</span>
          </button>
        ))}
      {react && (onReply || hasMenu) && <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />}
      {onReply && (
        <button
          type="button"
          data-toolbar-item
          aria-label="Reply"
          title="Reply"
          onClick={onReply}
          className={ITEM}
        >
          <Reply className="size-4" />
        </button>
      )}
      {hasMenu && (
        <DropdownMenu
          onOpenChange={(open) => {
            hold(open);
            if (open) setOpenedAt(Date.now());
          }}
        >
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-toolbar-item
              aria-label="More"
              title="More"
              className={cn(ITEM, 'aria-expanded:bg-accent')}
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align={side === 'end' ? 'end' : 'start'}
            className="w-52"
            onCloseAutoFocus={(event) => {
              const run = leaving.current;
              if (!run) return;
              leaving.current = null;
              event.preventDefault();
              run();
            }}
          >
            {onForward && (
              <DropdownMenuItem onSelect={() => away(onForward)}>
                <Forward />
                Forward
              </DropdownMenuItem>
            )}
            {onCopy && (
              <DropdownMenuItem onSelect={onCopy}>
                <Copy />
                Copy
              </DropdownMenuItem>
            )}
            {edit && minutesLeft > 0 && (
              <DropdownMenuItem onSelect={() => away(edit.onEdit)}>
                <Pencil />
                <span className="flex flex-col">
                  <span>Edit</span>
                  <span className="text-xs text-muted-foreground">
                    For {minutesLeft} more minute{minutesLeft === 1 ? '' : 's'}
                  </span>
                </span>
              </DropdownMenuItem>
            )}
            {(onDelete || onDiscard) && (onForward || onCopy || minutesLeft > 0) && (
              <DropdownMenuSeparator />
            )}
            {onDiscard && (
              <DropdownMenuItem variant="destructive" onSelect={onDiscard}>
                <Trash2 />
                Delete
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem onSelect={() => onDelete('me')}>
                <Trash2 />
                Delete for me
              </DropdownMenuItem>
            )}
            {onDelete && canDeleteForEveryone && (
              <DropdownMenuItem variant="destructive" onSelect={() => onDelete('everyone')}>
                <Trash2 />
                Delete for everyone
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </RovingToolbar>
  );
}
