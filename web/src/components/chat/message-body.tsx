'use client';

/* eslint-disable @next/next/no-img-element -- signed thumbnails, already the size they are drawn at, as in the album grid */

import Link from 'next/link';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { BriefcaseBusiness, CalendarDays, ImageDown, Images, ReceiptText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useLinkPreview } from '@/hooks/useChat';
import { useMediaAutoLoad } from '@/components/chat/connection';
import { describeAlbumCount, isVirgoLink, splitLinks, type LinkPreview } from '@/api';

/** The hosts whose pages this app draws itself. client.virgo.ph is a client's page. */
const APP_HOSTS = new Set(['virgo.ph', 'www.virgo.ph', 'web.virgo.ph']);

/**
 * Where a Virgo link goes inside the app, or null when it opens outside.
 *
 * Only the pages this app has: a profile, a job, a shared post. An album's
 * client link is the client's view, not yours, so it opens as a page of its
 * own like any other address.
 */
export function appPath(href: string): string | null {
  if (!isVirgoLink(href)) return null;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (!APP_HOSTS.has(url.hostname.toLowerCase())) return null;
  const path = url.pathname.replace(/\/+$/, '');
  const handle = /^\/u\/([^/]+)$/.exec(path) ?? /^\/@([A-Za-z0-9_]{3,30})$/.exec(path);
  if (handle) return `/u/${handle[1]}`;
  const job = /^\/jobs\/([^/]+)$/.exec(path);
  if (job) return `/jobs/${job[1]}`;
  const post = /^\/p\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(path);
  if (post) return `/p/${post[1]}`;
  return null;
}

/**
 * A link: the app's own page through the router, anything else in a new tab.
 *
 * A new tab in the desktop app is the system browser — the shell hands every
 * new-window request there rather than opening a bare second window.
 */
function ChatLink({
  href,
  className,
  children,
  label,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  label?: string;
}) {
  const internal = appPath(href);
  if (internal) {
    return (
      <Link href={internal} className={className} aria-label={label}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} aria-label={label}>
      {children}
    </a>
  );
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A message's words, with its links and its @mentions drawn.
 *
 * Mentions are matched by participant name, not by stored offsets, as they
 * always were; links come first, so an address is never cut by a name.
 */
export function MessageBody({
  body,
  names,
  mine,
}: {
  body: string;
  /** Everyone in the chat, for highlighting @mentions. */
  names: string[];
  mine: boolean;
}) {
  const parts = useMemo(() => splitLinks(body), [body]);
  const mention = useMemo(() => {
    const sorted = names.filter(Boolean).sort((a, b) => b.length - a.length);
    if (sorted.length === 0) return null;
    return {
      pattern: new RegExp(`(@(?:${sorted.map(escapeForRegex).join('|')}))`, 'g'),
      known: new Set(sorted.map((n) => `@${n}`)),
    };
  }, [names]);

  const words = (text: string, at: number) => {
    if (!mention || !text.includes('@')) return text;
    return text.split(mention.pattern).map((piece, i) =>
      mention.known.has(piece) ? (
        <strong key={`${at}-${i}`} className="font-bold">
          {piece}
        </strong>
      ) : (
        <Fragment key={`${at}-${i}`}>{piece}</Fragment>
      ),
    );
  };

  return (
    <>
      {parts.map((part, i) =>
        part.kind === 'link' ? (
          <ChatLink
            key={i}
            href={part.href}
            className={cn(
              'underline underline-offset-2 hover:decoration-2',
              mine ? 'decoration-current/70' : 'text-primary',
            )}
          >
            {part.text}
          </ChatLink>
        ) : (
          <Fragment key={i}>{words(part.text, i)}</Fragment>
        ),
      )}
    </>
  );
}

/** "Sat, Dec 20, 2026", from the job's plain date. */
function jobDate(date: string | null): string | null {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}

/** The words under a card's picture, or beside its icon. */
function CardText({ title, lines }: { title: string; lines: (string | null | undefined)[] }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-sm font-semibold leading-5">{title}</span>
      {lines
        .filter((line): line is string => !!line)
        .map((line) => (
          <span key={line} className="truncate text-xs leading-[18px] text-muted-foreground">
            {line}
          </span>
        ))}
    </span>
  );
}

function IconTile({ children }: { children: ReactNode }) {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
      {children}
    </span>
  );
}

/** The picture a card would draw, if it has one. */
function previewImage(preview: LinkPreview): string | null {
  if (preview.kind === 'album') return preview.thumbs[0] ?? null;
  if (preview.kind === 'post' || preview.kind === 'profile') return preview.imageUrl;
  return null;
}

/**
 * What the card shows, kind by kind (board 124).
 *
 * Without `showImage` it is the words alone, and no picture is asked for:
 * on a slow or metered line the request is the cost, not the drawing.
 */
function PreviewContent({ preview, showImage }: { preview: LinkPreview; showImage: boolean }) {
  switch (preview.kind) {
    case 'album':
      return (
        <>
          {showImage && (
            <span className="relative block h-28 bg-muted">
              {preview.thumbs[0] ? (
                <img
                  src={preview.thumbs[0]}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  className="size-full object-cover"
                />
              ) : (
                <span className="grid size-full place-items-center text-muted-foreground">
                  <Images className="size-6" />
                </span>
              )}
            </span>
          )}
          <span className="flex px-3 pb-3 pt-2.5">
            <CardText
              title={preview.title}
              lines={[`${describeAlbumCount(preview.counts)} · Client link`]}
            />
          </span>
        </>
      );
    case 'post':
      return (
        <>
          {showImage && preview.imageUrl && (
            <span className="block h-28 bg-muted">
              <img
                src={preview.imageUrl}
                alt=""
                loading="lazy"
                draggable={false}
                className="size-full object-cover"
              />
            </span>
          )}
          <span className="flex px-3 pb-3 pt-2.5">
            <CardText title={preview.title} lines={[preview.subtitle]} />
          </span>
        </>
      );
    case 'profile':
      return (
        <span className="flex items-center gap-2.5 p-2.5">
          <Avatar className="size-10">
            {showImage && preview.imageUrl && <AvatarImage src={preview.imageUrl} alt="" />}
            <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
              {initials(preview.title)}
            </AvatarFallback>
          </Avatar>
          <CardText title={preview.title} lines={[preview.subtitle]} />
        </span>
      );
    case 'job':
      return (
        <span className="flex items-center gap-2.5 p-2.5">
          <IconTile>
            <BriefcaseBusiness className="size-4" />
          </IconTile>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold leading-5">{preview.title}</span>
            {jobDate(preview.date) && (
              <span className="flex items-center gap-1 text-xs leading-[18px] text-muted-foreground">
                <CalendarDays className="size-3 shrink-0" />
                {jobDate(preview.date)}
              </span>
            )}
            {preview.subtitle && (
              <span className="truncate text-xs leading-[18px] text-muted-foreground">
                {preview.subtitle}
              </span>
            )}
          </span>
        </span>
      );
    case 'statement':
      return (
        <span className="flex items-center gap-2.5 p-2.5">
          <IconTile>
            <ReceiptText className="size-4" />
          </IconTile>
          <CardText title="Package statement" lines={[]} />
        </span>
      );
  }
}

/**
 * The card under a message's first Virgo link: the album with its cover and
 * how many, who a profile is, a post, a job, a statement.
 *
 * Nothing until it has loaded, and nothing at all when the link has no
 * preview — the link is already on screen, and a placeholder that may come
 * to nothing would only move the thread about. Any other address gets no
 * card, and nothing is fetched for it.
 */
export function LinkPreviewCard({ href, mine }: { href: string; mine: boolean }) {
  const { data: preview } = useLinkPreview(href);
  // Pictures follow "Load photos, films and voice notes automatically". A
  // card held back shows its words, and loads its own picture on a click.
  const { autoLoad } = useMediaAutoLoad();
  const [revealed, setRevealed] = useState(false);
  if (!preview) return null;
  const label =
    preview.kind === 'statement' ? 'Package statement' : `${preview.title}, ${preview.kind}`;
  const showImage = autoLoad || revealed;
  const heldBack = !showImage && previewImage(preview) !== null;
  return (
    <div
      className={cn(
        'mt-2 w-64 max-w-full overflow-hidden rounded-xl text-left',
        // On your own bubble the card is the page's surface, as on the board;
        // on theirs, a shade off the bubble so it reads as an attachment.
        mine ? 'bg-card text-card-foreground' : 'bg-muted/70 text-foreground',
      )}
    >
      <ChatLink
        href={href}
        label={label}
        className="block no-underline transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <PreviewContent preview={preview} showImage={showImage} />
      </ChatLink>
      {/* Outside the link: a button cannot sit inside one. */}
      {heldBack && (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="-mt-1.5 mb-2.5 ml-3 inline-flex items-center gap-1 rounded text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ImageDown className="size-3.5" aria-hidden />
          Load picture
        </button>
      )}
    </div>
  );
}
