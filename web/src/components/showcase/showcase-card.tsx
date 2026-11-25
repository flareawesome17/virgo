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
import {
  Bookmark,
  ChevronDown,
  Heart,
  Lock,
  Maximize,
  MessageCircle,
  Share,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CARD } from '@/components/kit';
import { ShowcaseFilm } from '@/components/media/showcase-film';
import { useLike } from '@/hooks/useShowcases';
import { makerOf, showcaseStatus, type FeedItem, type ShowcasePiece } from '@/api';
import { shareShowcase, shareability } from '@/lib/share-showcase';
import { cn } from '@/lib/utils';
import { postedAgo, shortCount } from './posted-time';
import { useShowcaseHost } from './showcase-host';
import { ShowcaseMenu } from './showcase-menu';
import { PieceCarousel, PieceImage, cardFrame, pieceFit } from './showcase-media';

/**
 * How wide a card's picture is drawn, for the srcset: the feed's 540 px
 * column, or the screen less its 16 px gutters below that. A dialog draws it
 * a little narrower.
 */
const CARD_SIZES = '(max-width: 572px) calc(100vw - 32px), 540px';
/**
 * The same on a post's own page, where the picture has the wider of two
 * columns on a wide window and the whole page once they stack.
 */
const PAGE_SIZES =
  '(min-width: 1160px) 680px, (min-width: 1024px) calc(100vw - 288px), calc(100vw - 32px)';
/** The tallest a piece is drawn on a post's own page. */
const PAGE_MAX_HEIGHT = 720;

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
 * Laid out as the phone lays one out: who made it and when, the work at its
 * own shape, what you can do about it with how many already have beside each
 * button, and then the words. How it was made is what this feed has that a
 * photo app does not, so its tags are on the card and the note is one click
 * under them.
 *
 * The card does not link to the post's page. The comments open over the
 * feed, and every action the page had is on the card; the page stays for
 * notifications and shared links, where the same parts sit in two columns:
 * the work on the left, the words and whatever the page hands in as
 * `children` (the thread) on the right.
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
  children,
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
  /** On the post's own page: what follows the words in their column. */
  children?: ReactNode;
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
  const posted = postedAgo(when);
  // Who can see it, when that is not everyone. Only ever "Private" for the
  // owner: nobody else is sent a post that is not out. One Virgo took down
  // says so on the photograph instead.
  const audience =
    mine && (status === 'draft' || status === 'down')
      ? 'Private'
      : item.visibility === 'connections'
        ? 'Connections only'
        : null;
  // Who they are, then when. Your own post says "You", which needs no title.
  const byline = [audience, mine ? null : maker.title].filter(Boolean).join(' · ');
  // What kind of work it is and where, under the title.
  const about = [item.category, item.location].filter(Boolean).join(' · ');

  const setLiked = (liked: boolean) => like.mutate({ showcaseId: item.id, liked });
  // A double tap only ever likes, as everywhere else it is the gesture: a
  // second one on something already liked must not take the like away.
  const likeFromPhoto = () => {
    if (!item.likedByMe) setLiked(true);
  };
  // The one way into the thread now that its count sits beside the icon. The
  // cursor goes to the box only when there is nothing to read first.
  const comment = () => {
    if (onComment) onComment();
    else host.openComments(item, { write: item.commentCount === 0 });
  };
  const shareNow = () =>
    void shareShowcase({ id: item.id, title: item.title, makerName: maker.displayName });

  const avatar = (
    <Avatar className="size-10">
      {maker.avatarUrl && <AvatarImage src={maker.avatarUrl} alt="" />}
      <AvatarFallback className="bg-primary/15 text-sm font-bold text-primary">
        {maker.displayName.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
  const name = mine ? 'You' : maker.displayName;

  const head = (
    <header className="flex min-h-14 items-center gap-3">
      {profileHref ? (
        <Link
          href={profileHref}
          aria-label={mine ? 'Your profile' : `${maker.displayName}'s profile`}
          className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {avatar}
        </Link>
      ) : (
        avatar
      )}
      <div className="flex min-w-0 flex-1 flex-col items-start">
        {profileHref ? (
          <Link
            href={profileHref}
            className="max-w-full truncate text-[15px] font-semibold leading-5 hover:underline"
          >
            {name}
          </Link>
        ) : (
          <p className="max-w-full truncate text-[15px] font-semibold leading-5">{name}</p>
        )}
        {(byline || posted.short) && (
          <p className="flex max-w-full items-center gap-[5px] text-[13px] leading-[18px] text-muted-foreground">
            {audience && <Lock aria-hidden className="size-3 shrink-0" />}
            <span className="min-w-0 truncate">
              {byline}
              {byline && posted.short ? ' · ' : null}
              {posted.short && (
                <time dateTime={when} suppressHydrationWarning>
                  <span aria-hidden>{posted.short}</span>
                  <span className="sr-only">{posted.label}</span>
                </time>
              )}
            </span>
          </p>
        )}
      </div>
      {item.showHire && maker.handle && !mine && (
        <Button asChild className="h-[34px] rounded-[10px] px-3.5 text-sm font-semibold">
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
        <Button
          variant="ghost"
          size="icon-lg"
          className="rounded-[10px]"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="size-5" />
        </Button>
      )}
    </header>
  );

  const media = item.pieces.length > 0 && (
    <PieceCarousel
      pieces={item.pieces}
      aspect={frame.aspect}
      label={label}
      maxHeight={page ? PAGE_MAX_HEIGHT : undefined}
      thumbnails={page}
      overlay={mine && status !== 'live' ? <StatusBadge removed={status === 'removed'} /> : null}
      renderPage={(piece, i) => {
        const alt =
          item.pieces.length > 1 ? `${label}, ${i + 1} of ${item.pieces.length}` : label;
        if (piece.kind === 'video') {
          // A film is its own control: a click plays it, so it is not also
          // the picture a double click likes.
          const film = (
            <ShowcaseFilm piece={piece} alt={alt} aspect={frame.aspect} fit={pieceFit(frame, i)} />
          );
          // The film draws its own frame from its width. Where the page
          // stops the frame growing, the film is held to the width that
          // gives it that height, so nothing of it is cut.
          return page ? (
            <div className="mx-auto w-full" style={{ maxWidth: PAGE_MAX_HEIGHT * frame.aspect }}>
              {film}
            </div>
          ) : (
            film
          );
        }
        return (
          <PhotoPage
            piece={piece}
            alt={alt}
            sizes={page ? PAGE_SIZES : CARD_SIZES}
            // Whole inside the page's frame, which may have stopped growing
            // before it reached the photograph's shape.
            fit={page ? 'contain' : pieceFit(frame, i)}
            priority={priority && i === 0}
            onDoubleTap={likeFromPhoto}
            onOpen={onOpenPhoto ? () => onOpenPhoto(piece) : undefined}
          />
        );
      }}
    />
  );

  const actions = (
    <div className="-mx-2 flex items-center">
      <CountButton
        label={
          item.likeCount > 0
            ? `Like. ${item.likeCount} ${item.likeCount === 1 ? 'like' : 'likes'}.`
            : 'Like'
        }
        pressed={item.likedByMe}
        count={item.likeCount}
        onClick={() => setLiked(!item.likedByMe)}
      >
        <Heart
          className={cn(
            'size-[22px] transition-transform motion-safe:active:scale-90',
            item.likedByMe && 'fill-current text-destructive',
          )}
        />
      </CountButton>
      {commentable && (
        <CountButton
          label={item.commentCount > 0 ? `Comments, ${item.commentCount}` : 'Comment'}
          count={item.commentCount}
          onClick={comment}
        >
          <MessageCircle className="size-[22px]" />
        </CountButton>
      )}
      {share.ok ? (
        <CountButton label="Share" onClick={shareNow}>
          <Share className="size-[22px]" />
        </CountButton>
      ) : (
        share.offer && (
          <CountButton label="Share" blocked={share.reason} onClick={() => toast(share.reason)}>
            <Share className="size-[22px] opacity-40" />
          </CountButton>
        )
      )}

      <span className="flex-1" />
      <span className="pr-2">
        {!mine ? (
          <button
            type="button"
            onClick={() => host.keep(item)}
            aria-pressed={item.keptByMe}
            aria-label={item.keptByMe ? 'Kept. Change where.' : 'Keep'}
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-xl pl-3 pr-3.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
              // Dark once it is yours, and it says so: an outline that means
              // "kept" and an outline that means "keep" are the same picture.
              item.keptByMe
                ? 'bg-foreground text-background'
                : 'bg-muted text-foreground hover:bg-muted/70',
            )}
          >
            <Bookmark className={cn('size-4', item.keptByMe && 'fill-current')} />
            {item.keptByMe ? 'Kept' : 'Keep'}
          </button>
        ) : (
          // The page says how many under the row, in a line of its own.
          !page &&
          item.keptCount > 0 && (
            <span className="text-[13px] font-semibold text-muted-foreground">
              {item.keptCount.toLocaleString()} kept
            </span>
          )
        )}
      </span>
    </div>
  );

  const title = item.title && (
    <TitleTag
      className={cn(
        'break-words font-bold',
        page ? 'text-[22px] leading-7 tracking-[-0.02em]' : 'text-[17px] leading-6 tracking-[-0.01em]',
      )}
    >
      {item.title}
    </TitleTag>
  );
  const aboutLine = about && (
    <p className="text-[13px] leading-[18px] text-muted-foreground">{about}</p>
  );
  const caption = item.caption && (
    <Caption text={item.caption} open={page} ground={variant === 'dialog' ? 'popover' : 'page'} />
  );
  const craft = (item.craftNote || item.craftTags.length > 0) && (
    <HowItWasMade note={item.craftNote} tags={item.craftTags} open={page} />
  );
  const aria = `${label}, by ${maker.displayName}`;

  if (page) {
    return (
      <article aria-label={aria} className={cn('flex w-full flex-wrap items-start gap-7', className)}>
        {media && <div className="min-w-0 flex-[3_1_480px]">{media}</div>}
        <div className="flex min-w-0 flex-[2_1_360px] flex-col gap-4">
          {head}
          {(title || aboutLine || caption) && (
            <div className="flex flex-col gap-1">
              {title}
              {aboutLine}
              {caption}
            </div>
          )}
          {craft}
          {actions}
          {item.keptCount > 0 && (
            <p className="-mt-2 text-[13px] leading-[18px] text-muted-foreground">
              Kept by {item.keptCount.toLocaleString()} {item.keptCount === 1 ? 'person' : 'people'}
            </p>
          )}
          {children}
        </div>
      </article>
    );
  }

  return (
    <article
      aria-label={aria}
      className={cn(
        'flex w-full flex-col gap-2',
        // A dialog has no gutters of its own; the feed's column does.
        variant === 'dialog' && 'px-3 pb-3 pt-1',
        className,
      )}
    >
      {head}
      {media}
      {actions}
      {(title || aboutLine || caption || craft) && (
        <div className="flex flex-col gap-1">
          {title}
          {aboutLine}
          {caption}
          {craft}
        </div>
      )}
    </article>
  );
}

/**
 * Your own post, said to be out of sight, on the photograph: nobody else
 * ever sees one. Still while the set moves under it.
 */
function StatusBadge({ removed }: { removed: boolean }) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute left-3 top-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
        removed ? 'bg-destructive text-destructive-foreground' : 'bg-black/55 text-white',
      )}
    >
      <Lock aria-hidden className="size-3" />
      {removed ? 'Removed by Virgo' : 'Private'}
    </span>
  );
}

/**
 * One of the row's buttons: an icon, and beside it how many times it has
 * been done, which used to be a line of its own under the row. The icon
 * carries its name for a screen reader. A control that cannot be used here
 * (Share on a private post) says why on hover and on a click, rather than
 * sitting there greyed out with no reason given.
 */
function CountButton({
  label,
  pressed,
  blocked,
  count = 0,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  /** Why it cannot be used, when it cannot. */
  blocked?: string;
  count?: number;
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
      className="flex h-10 items-center gap-1.5 rounded-xl px-2 text-foreground outline-none transition-opacity hover:opacity-60 focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
      {count > 0 && (
        <span className="text-sm font-semibold tabular-nums">{shortCount(count)}</span>
      )}
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
  sizes,
  fit,
  priority,
  onDoubleTap,
  onOpen,
}: {
  piece: ShowcasePiece;
  alt: string;
  sizes: string;
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
      <PieceImage piece={piece} alt={alt} sizes={sizes} fit={fit} priority={priority} />

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
        // On the photograph a click is half of a double click, which likes
        // it, so looking closely is a button of its own.
        <button
          type="button"
          onClick={onOpen}
          onDoubleClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          className="absolute bottom-3 left-3 flex h-9 items-center gap-1.5 rounded-[10px] bg-background/90 pl-2.5 pr-3 text-[13px] font-semibold text-foreground outline-none transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Maximize aria-hidden className="size-[15px]" />
          View full screen
        </button>
      )}
    </div>
  );
}

/**
 * The caption, cut to two lines with "more" at the end of the second.
 * Measured rather than guessed from its length: two lines is a different
 * number of characters on a phone and on a laptop.
 *
 * It began with the maker's name in bold, as photo apps do. The name is in
 * the byline directly above.
 */
function Caption({
  text,
  open: startOpen,
  ground,
}: {
  text: string;
  open: boolean;
  /** What the card sits on, which "more" fades the end of the line into. */
  ground: 'page' | 'popover';
}) {
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
    <div
      className={cn(
        'relative text-[15px] leading-[22px] text-secondary-foreground',
        startOpen ? 'mt-1' : 'mt-0.5',
      )}
    >
      <p ref={ref} className={cn('whitespace-pre-line break-words', !open && 'line-clamp-2')}>
        {text}
      </p>
      {!open && cut && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            'absolute bottom-0 right-0 bg-gradient-to-r pl-8 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
            ground === 'popover'
              ? 'from-popover/0 via-popover to-popover'
              : 'from-background/0 via-background to-background',
          )}
          aria-label="Show the whole caption"
        >
          <span aria-hidden className="text-secondary-foreground">
            …{' '}
          </span>
          more
        </button>
      )}
    </div>
  );
}

/**
 * The note the feed exists for, as a small card of its own.
 *
 * In the feed its tags show and the note is folded under them, so a long one
 * does not push the next post a screen away. With no tags there is nothing
 * to show closed, so the note is. On the post's own page, which is where
 * somebody went to read it, all of it is there from the start.
 */
function HowItWasMade({
  note,
  tags,
  open: alwaysOpen,
}: {
  note: string | null;
  tags: string[];
  open: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const folds = !alwaysOpen && Boolean(note) && tags.length > 0;
  const Heading = alwaysOpen ? 'h2' : 'h3';
  const heading = 'text-[13px] font-semibold leading-[18px] text-muted-foreground';

  return (
    <section
      aria-label="How it was made"
      className={cn(CARD, 'flex flex-col gap-2.5 px-3.5 py-3', !alwaysOpen && 'mt-1.5')}
    >
      <Heading className={heading}>
        {folds ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            How it was made
            <ChevronDown
              aria-hidden
              className={cn(
                'size-4 transition-transform motion-reduce:transition-none',
                open && 'rotate-180',
              )}
            />
          </button>
        ) : (
          'How it was made'
        )}
      </Heading>
      {note && (
        <p
          id={id}
          hidden={folds && !open}
          className="whitespace-pre-line break-words text-sm leading-5 text-secondary-foreground"
        >
          {note}
        </p>
      )}
      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
          {tags.map((tag) => (
            <li
              key={tag}
              className="rounded-full bg-muted px-2.5 py-1 text-[13px] font-medium leading-[18px] text-secondary-foreground"
            >
              {tag}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
