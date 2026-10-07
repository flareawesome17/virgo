'use client';

import Link from 'next/link';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { Bookmark, ChevronDown, Heart, Lock, Maximize2, MessageCircle, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ShowcaseFilm } from '@/components/media/showcase-film';
import { useLike } from '@/hooks/useShowcases';
import { makerOf, showcaseStatus, type FeedItem, type ShowcasePiece } from '@/api';
import { shareShowcase, shareability } from '@/lib/share-showcase';
import { cn } from '@/lib/utils';
import { relativeTime } from '@/lib/workspaces';
import { useShowcaseHost } from './showcase-host';
import { ShowcaseMenu } from './showcase-menu';
import { PieceCarousel, PieceImage, cardFrame, pieceFit } from './showcase-media';

/**
 * How wide a card's picture is drawn, for the srcset: the 500 px card, or
 * the screen less the feed's 16 px gutters below that. A dialog draws it at
 * the same width.
 */
const CARD_SIZES = '(max-width: 532px) calc(100vw - 32px), 500px';

/** Two taps closer together than this, and nearer than DOUBLE_TAP_PX, are one double tap. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 30;
/** A touch that moved further than this was a swipe, not a tap. */
const TAP_SLOP_PX = 10;
/** How long the heart stays over a photograph liked by a double tap. */
const POP_MS = 900;

export type CardVariant = 'feed' | 'dialog' | 'page';

/**
 * One post, the way the feed draws it — and the way it is drawn everywhere
 * else one is opened: in a dialog from a shelf or a profile, and on its own
 * page.
 *
 * Laid out as the big feeds have taught everyone to read one: who made it,
 * the work at its own shape, the things you can do with it in one row, and
 * then the words. The card does not link to the post's page any more. The
 * comments open over the feed, and every action the page had is on the card;
 * the page stays for notifications and shared links.
 */
export function ShowcaseCard({
  item,
  variant = 'feed',
  priority = false,
  onDeleted,
  onComment,
  onOpenPhoto,
  onClose,
  className,
}: {
  item: FeedItem;
  variant?: CardVariant;
  /** The first card on the page, whose picture is what the page is waiting on. */
  priority?: boolean;
  /** Where to go once your own post is deleted, when what showed it cannot stay. */
  onDeleted?: () => void;
  /** Instead of opening the comments dialog: the page has the thread under it. */
  onComment?: () => void;
  /** Offers to open a photograph large, on the post's own page. */
  onOpenPhoto?: (piece: ShowcasePiece) => void;
  /** A close button in the header, for a card that is a dialog's whole content. */
  onClose?: () => void;
  className?: string;
}) {
  const host = useShowcaseHost();
  // By id, so a fast double click is queued rather than raced, and the
  // server's count — everyone else's likes included — is written back.
  const like = useLike(item.id);
  // Never read straight off the payload: see makerOf.
  const maker = makerOf(item);
  /*
   * Your own post. Your own work is in the feed, and offering to keep it,
   * hire you or report it is either refused by the server or absurd; how
   * many people kept it is what is worth seeing instead.
   */
  const mine = !!host.userId && item.userId === host.userId;
  const status = showcaseStatus(item);
  const frame = cardFrame(item.pieces[0]);
  const label = item.title ?? `${maker.displayName}'s showcase`;
  // Your own profile needs no published handle; anybody else's is only
  // reachable once they have published one.
  const profileHref = mine ? '/profile' : maker.handle ? `/u/${maker.handle}` : null;
  const share = shareability(item, mine);
  // The owner still reads and tidies a thread they turned off.
  const commentable = item.allowComments || mine;
  const page = variant === 'page';
  const TitleTag = page ? 'h1' : 'h2';
  const when = item.publishedAt ?? item.createdAt;

  const setLiked = (liked: boolean) => like.mutate({ showcaseId: item.id, liked });
  // A double tap only ever likes, as everywhere else it is the gesture: a
  // second one on something already liked must not take the like away.
  const likeFromPhoto = () => {
    if (!item.likedByMe) setLiked(true);
  };
  const comment = (write: boolean) => {
    if (onComment) onComment();
    else host.openComments(item, { write });
  };
  const shareNow = () =>
    void shareShowcase({ id: item.id, title: item.title, makerName: maker.displayName });

  const avatar = (
    <Avatar className="size-9">
      {maker.avatarUrl && <AvatarImage src={maker.avatarUrl} alt="" />}
      <AvatarFallback className="bg-primary/15 text-sm font-bold text-primary">
        {maker.displayName.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );

  return (
    <article
      aria-label={`${label}, by ${maker.displayName}`}
      className={cn(
        'w-full overflow-hidden bg-card text-card-foreground',
        variant !== 'dialog' && 'rounded-xl border',
        className,
      )}
    >
      <header className="flex items-center gap-3 py-2.5 pl-3 pr-2">
        {profileHref ? (
          <Link href={profileHref} aria-label={`${maker.displayName}'s profile`} className="rounded-full">
            {avatar}
          </Link>
        ) : (
          avatar
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex min-w-0 items-center gap-2">
            {profileHref ? (
              <Link href={profileHref} className="truncate text-sm font-bold hover:underline">
                {maker.displayName}
              </Link>
            ) : (
              <p className="truncate text-sm font-bold">{maker.displayName}</p>
            )}
            {mine && status !== 'live' && <StatusBadge removed={status === 'removed'} />}
          </div>
          {(maker.title || item.location) && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {[maker.title, item.location].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        {item.showHire && maker.handle && !mine && (
          <Button asChild size="sm" className="rounded-full px-3.5">
            <Link href={`/hire/${maker.handle}`}>Hire</Link>
          </Button>
        )}
        <ShowcaseMenu
          item={item}
          mine={mine}
          onReport={() => host.report(item.id)}
          onDeleted={onDeleted}
        />
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="size-5" />
          </Button>
        )}
      </header>

      {item.pieces.length > 0 && (
        <PieceCarousel
          pieces={item.pieces}
          aspect={frame.aspect}
          label={label}
          renderPage={(piece, i) => {
            const alt =
              item.pieces.length > 1 ? `${label}, ${i + 1} of ${item.pieces.length}` : label;
            return piece.kind === 'video' ? (
              // A film is its own control: a click plays it, so it is not
              // also the picture a double click likes.
              <ShowcaseFilm piece={piece} alt={alt} aspect={frame.aspect} fit={pieceFit(frame, i)} />
            ) : (
              <PhotoPage
                piece={piece}
                alt={alt}
                fit={pieceFit(frame, i)}
                priority={priority && i === 0}
                onDoubleTap={likeFromPhoto}
                onOpen={onOpenPhoto ? () => onOpenPhoto(piece) : undefined}
              />
            );
          }}
        />
      )}

      <div className="flex items-center px-1.5 pt-1">
        <ActionButton
          label="Like"
          pressed={item.likedByMe}
          onClick={() => setLiked(!item.likedByMe)}
        >
          <Heart
            className={cn(
              'size-6 transition-transform motion-safe:active:scale-90',
              item.likedByMe && 'fill-current text-destructive',
            )}
          />
        </ActionButton>
        {commentable && (
          <ActionButton label="Comment" onClick={() => comment(true)}>
            <MessageCircle className="size-6" />
          </ActionButton>
        )}
        {share.ok ? (
          <ActionButton label="Share" onClick={shareNow}>
            <Send className="size-6" />
          </ActionButton>
        ) : (
          share.offer && (
            <ActionButton
              label="Share"
              blocked={share.reason}
              onClick={() => toast(share.reason)}
            >
              <Send className="size-6 opacity-40" />
            </ActionButton>
          )
        )}

        <div className="ml-auto flex items-center">
          {mine ? (
            item.keptCount > 0 && (
              <span className="flex items-center gap-1.5 px-1.5 text-sm text-muted-foreground">
                <Bookmark className="size-4" />
                {item.keptCount.toLocaleString()} kept
              </span>
            )
          ) : (
            <ActionButton
              // Filled once it is yours: an outline that means "kept" and an
              // outline that means "keep" are the same picture.
              label={item.keptByMe ? 'Kept. Change where.' : 'Keep'}
              pressed={item.keptByMe}
              onClick={() => host.keep(item)}
            >
              <Bookmark className={cn('size-6', item.keptByMe && 'fill-current')} />
            </ActionButton>
          )}
        </div>
      </div>

      <div className="grid gap-1 px-3 pb-3 pt-0.5">
        {item.likeCount > 0 && (
          <p className="text-sm font-bold">
            {item.likeCount === 1 ? '1 like' : `${item.likeCount.toLocaleString()} likes`}
          </p>
        )}
        {item.title && (
          <TitleTag className={cn('font-bold', page ? 'text-base' : 'text-sm')}>{item.title}</TitleTag>
        )}
        {item.caption && <Caption name={maker.displayName} text={item.caption} open={page} />}
        {(item.craftNote || item.craftTags.length > 0) && (
          <HowItWasMade note={item.craftNote} tags={item.craftTags} open={page} />
        )}
        {commentable && item.commentCount > 0 && !page && (
          <button
            type="button"
            onClick={() => comment(false)}
            className="justify-self-start rounded text-left text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {item.commentCount === 1
              ? 'View 1 comment'
              : `View all ${item.commentCount.toLocaleString()} comments`}
          </button>
        )}
        <time
          dateTime={when}
          suppressHydrationWarning
          className="text-[11px] uppercase tracking-wide text-muted-foreground"
        >
          {relativeTime(when)}
        </time>
      </div>
    </article>
  );
}

/** Your own post, said to be out of sight: nobody else ever sees one. */
function StatusBadge({ removed }: { removed: boolean }) {
  return removed ? (
    <Badge variant="destructive">Removed by Virgo</Badge>
  ) : (
    <Badge variant="secondary">
      <Lock />
      Private
    </Badge>
  );
}

/**
 * One of the row's icons. Icons alone, as every feed draws them, so each
 * carries its name for a screen reader. A control that cannot be used here
 * (Share on a private post) says why on hover and on a click, rather than
 * sitting there greyed out with no reason given.
 */
function ActionButton({
  label,
  pressed,
  blocked,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  /** Why it cannot be used, when it cannot. */
  blocked?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      aria-label={blocked ? `${label}. ${blocked}` : label}
      aria-pressed={pressed}
      aria-disabled={blocked ? true : undefined}
      className="grid size-10 place-items-center rounded-full text-foreground transition-opacity hover:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
  if (!blocked) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{blocked}</TooltipContent>
    </Tooltip>
  );
}

/**
 * A photograph in the card's frame, liked by a double click or a double tap.
 *
 * Touch is read from pointer events rather than `dblclick`, which a phone
 * browser fires late, or not at all. A touch that moved is a swipe through
 * the set and never counts as a tap.
 */
function PhotoPage({
  piece,
  alt,
  fit,
  priority,
  onDoubleTap,
  onOpen,
}: {
  piece: ShowcasePiece;
  alt: string;
  fit: 'cover' | 'contain';
  priority: boolean;
  onDoubleTap: () => void;
  onOpen?: () => void;
}) {
  const [pop, setPop] = useState<{ key: number; leaving: boolean } | null>(null);
  const timers = useRef<number[]>([]);
  const press = useRef<{ t: number; x: number; y: number } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const lastPointer = useRef<string>('mouse');

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  const liked = () => {
    onDoubleTap();
    timers.current.forEach((id) => window.clearTimeout(id));
    setPop((current) => ({ key: (current?.key ?? 0) + 1, leaving: false }));
    timers.current = [
      window.setTimeout(() => setPop((p) => (p ? { ...p, leaving: true } : p)), POP_MS - 250),
      window.setTimeout(() => setPop(null), POP_MS),
    ];
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    lastPointer.current = event.pointerType;
    if (event.pointerType === 'mouse') return;
    press.current = { t: event.timeStamp, x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') return;
    const start = press.current;
    press.current = null;
    if (
      !start ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP_PX ||
      event.timeStamp - start.t > DOUBLE_TAP_MS
    ) {
      lastTap.current = null;
      return;
    }
    const tap = { t: event.timeStamp, x: event.clientX, y: event.clientY };
    const previous = lastTap.current;
    if (
      previous &&
      tap.t - previous.t < DOUBLE_TAP_MS &&
      Math.hypot(tap.x - previous.x, tap.y - previous.y) < DOUBLE_TAP_PX
    ) {
      lastTap.current = null;
      liked();
    } else {
      lastTap.current = tap;
    }
  };

  return (
    <div
      className="relative size-full select-none"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        press.current = null;
      }}
      // A phone may fire this too after a double tap, which was already
      // counted above.
      onDoubleClick={() => {
        if (lastPointer.current === 'mouse') liked();
      }}
    >
      <PieceImage piece={piece} alt={alt} sizes={CARD_SIZES} fit={fit} priority={priority} />

      {pop && (
        <span
          key={pop.key}
          aria-hidden
          className="pointer-events-none absolute inset-0 grid place-items-center"
        >
          <Heart
            className={cn(
              'size-24 fill-current text-white drop-shadow-lg',
              pop.leaving
                ? 'animate-out fade-out-0 zoom-out-90 fill-mode-forwards duration-250'
                : 'animate-in fade-in-0 zoom-in-50 duration-300',
              // Still shown, so the like is still seen, but nothing moves.
              'motion-reduce:animate-none',
            )}
          />
        </span>
      )}

      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          onDoubleClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          aria-label={`${alt}. View it larger.`}
          className="absolute bottom-3 right-3 grid size-9 place-items-center rounded-full bg-black/55 text-white transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Maximize2 className="size-4" />
        </button>
      )}
    </div>
  );
}

/**
 * The caption, after the maker's name, cut to two lines with "more" at the
 * end of the second. Measured rather than guessed from its length: two lines
 * is a different number of characters on a phone and on a laptop.
 */
function Caption({ name, text, open: startOpen }: { name: string; text: string; open: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(startOpen);
  const [cut, setCut] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || open || typeof ResizeObserver === 'undefined') return;
    // The first callback comes as soon as it is observed.
    const observer = new ResizeObserver(() => setCut(el.scrollHeight > el.clientHeight + 1));
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, text]);

  return (
    <div className="relative text-sm leading-5">
      <p ref={ref} className={cn('whitespace-pre-line break-words', !open && 'line-clamp-2')}>
        <span className="font-bold">{name}</span> {text}
      </p>
      {!open && cut && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="absolute bottom-0 right-0 bg-gradient-to-r from-card/0 via-card to-card pl-8 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Show the whole caption"
        >
          … more
        </button>
      )}
    </div>
  );
}

/**
 * The note the feed exists for, folded under its heading so a long one does
 * not push the next post a screen away. Open from the start on the post's
 * own page, which is where somebody went to read it.
 */
function HowItWasMade({
  note,
  tags,
  open: startOpen,
}: {
  note: string | null;
  tags: string[];
  open: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const id = useId();

  return (
    <div className="mt-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded text-[11px] font-bold uppercase tracking-wide text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        How it was made
        <ChevronDown
          className={cn('size-3.5 transition-transform motion-reduce:transition-none', open && 'rotate-180')}
        />
      </button>
      <div id={id} hidden={!open} className="pt-1.5">
        {note && <p className="whitespace-pre-line break-words text-sm leading-6">{note}</p>}
        {tags.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Tags">
            {tags.map((tag) => (
              <li
                key={tag}
                className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
              >
                {tag}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
          Written by the photographer. Virgo never reads this from the file.
        </p>
      </div>
    </div>
  );
}
