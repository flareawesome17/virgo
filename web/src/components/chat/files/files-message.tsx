'use client';

/* eslint-disable @next/next/no-img-element -- signed chat thumbnails and this computer's own copies, drawn at the size they come in */

import { useState, type ReactNode } from 'react';
import { CircleAlert, Clock, Download, Loader2, RotateCcw, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { downloadHref } from '@/lib/desktop';
import { useMediaAutoLoad } from '@/components/chat/connection';
import { BlurredStandIn, ClickToLoad } from '@/components/chat/cards/card-parts';
import { chatProblem } from '@/components/chat/chat-errors';
import { attachmentLink } from '@/hooks/useChatFiles';
import { fileDetailLine, chatFileSize, type ChatAttachment } from '@/api';
import { retryUpload, useLocalCopies, useLocalUpload, type LocalUpload } from '@/components/chat/files/send-queue';

/*
 * Photos and a PDF in the thread (board ChatPhotosSent, adapted for a
 * keyboard and a mouse).
 *
 * Every photo's box is drawn at its own shape before anything loads, with its
 * blurred stand-in behind it, so the thread never jumps as pictures arrive.
 * On a weak line, or with "Only when I tap", the stand-ins stay until a
 * click loads the small copies; the full photo and a PDF only ever load when
 * opened.
 */

/** One attachment as the thread draws it: the server's, or one still only on this computer. */
export type TileModel = Pick<
  ChatAttachment,
  'id' | 'kind' | 'status' | 'name' | 'sizeBytes' | 'width' | 'height' | 'pages' | 'blur' | 'thumbUrl' | 'url'
>;

/** How long a signed link is reused for the same photo before a fresher one is taken. */
const REUSE_LINK_MS = 5 * 60 * 60 * 1000;
const firstLinks = new Map<string, { url: string; at: number }>();

/**
 * The link a photo was first drawn from, for as long as it still works.
 *
 * Links are signed afresh every six hours and last twelve, so a thread
 * fetched again hands back new addresses for the same pictures. The browser
 * caches by address, and would download each one again; keyed on the
 * attachment instead, it draws what it already has.
 */
export function stableLink(id: string, which: 'thumb' | 'full', url: string | null): string | null {
  if (!url) return null;
  const key = `${which}:${id}`;
  const seen = firstLinks.get(key);
  const now = Date.now();
  if (seen && now - seen.at < REUSE_LINK_MS) return seen.url;
  firstLinks.set(key, { url, at: now });
  return url;
}

/**
 * Hands a signed download to the browser's own download manager, or in the
 * desktop app to the shell, which takes only a link marked as a download.
 */
export function startDownload(url: string): void {
  const link = document.createElement('a');
  link.href = downloadHref(url);
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** Saves a photo or PDF under its own name, from an hour's link asked for now. */
export async function saveAttachment(conversationId: string, messageId: string, attachment: TileModel) {
  try {
    const { url } = await attachmentLink(conversationId, messageId, attachment.id);
    startDownload(url);
  } catch (err) {
    toast.error(`Could not save ${attachment.kind === 'photo' ? 'the photo' : attachment.name}`, {
      description: chatProblem(err),
    });
  }
}

/** "Sending… 40%", "Waiting for a connection", "Didn't send": how this computer's copy is doing. */
function localLine(local: LocalUpload | undefined, status: TileModel['status']): string | null {
  if (status === 'ready') return null;
  if (status === 'failed') return local ? "Didn't send" : "Didn't arrive";
  if (!local) return 'Sending…';
  if (local.status === 'waiting') return 'Waiting for a connection';
  if (local.status === 'failed') return "Didn't send";
  if (local.status === 'queued') return 'Sending…';
  return `Sending… ${Math.round(local.progress * 100)}%`;
}

/** The small chip over a photo that is not here yet. */
function TileState({ local, status }: { local: LocalUpload | undefined; status: TileModel['status'] }) {
  if (status === 'ready') return null;
  const stuck = status === 'failed' || local?.status === 'failed';
  const waiting = local?.status === 'waiting';
  const sending = !stuck && !waiting;
  return (
    <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/20">
      <span
        className={cn(
          'inline-flex max-w-[90%] items-center gap-1 rounded-2xl px-2 py-1 text-center text-[11px] font-semibold leading-tight text-white',
          stuck ? 'bg-destructive/90' : 'bg-black/60',
        )}
      >
        {stuck ? (
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
        ) : waiting ? (
          <WifiOff className="size-3.5 shrink-0" aria-hidden />
        ) : local ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
        ) : (
          <Clock className="size-3.5 shrink-0" aria-hidden />
        )}
        <span>
          {stuck && local ? "Didn't send · Click to retry" : localLine(local, status)}
        </span>
      </span>
      {sending && local && (
        <span className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-white/35">
          <span
            className="block h-full rounded-full bg-white transition-[width] duration-300"
            style={{ width: `${Math.max(4, Math.round(local.progress * 100))}%` }}
          />
        </span>
      )}
    </span>
  );
}

/** One photo in the grid. */
function PhotoTile({
  attachment,
  show,
  more,
  className,
  style,
  onOpen,
}: {
  attachment: TileModel;
  /** Whether the small copy may load: the setting, or a click. */
  show: boolean;
  /** "+3" over the last tile, for the photos past it. */
  more: number;
  className?: string;
  style?: React.CSSProperties;
  onOpen: () => void;
}) {
  const local = useLocalUpload(attachment.id);
  const [broken, setBroken] = useState(false);
  // This computer's own copy while it is here: nothing to download.
  const src =
    local?.file.previewUrl ??
    (attachment.status === 'ready' && show && !broken
      ? stableLink(attachment.id, 'thumb', attachment.thumbUrl)
      : null);
  const retryable = !!local && (attachment.status === 'failed' || local.status === 'failed');
  const line = localLine(local, attachment.status);

  return (
    <button
      type="button"
      onClick={() => {
        if (retryable) retryUpload(attachment.id);
        else onOpen();
      }}
      aria-label={line ? `Photo, ${line}${retryable ? ', click to retry' : ''}` : 'Open photo'}
      className={cn(
        'relative block overflow-hidden bg-muted focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        className,
      )}
      style={style}
    >
      <BlurredStandIn src={attachment.blur} />
      {src && (
        <img
          src={src}
          alt=""
          draggable={false}
          decoding="async"
          onError={() => setBroken(true)}
          className={cn(
            'absolute inset-0 size-full object-cover',
            attachment.status !== 'ready' && 'opacity-80',
          )}
        />
      )}
      {/* Under "+3" the count is what matters; the progress shows on the others. */}
      {more === 0 && <TileState local={local} status={attachment.status} />}
      {more > 0 && (
        <span className="absolute inset-0 grid place-items-center bg-black/45 text-xl font-bold tabular-nums text-white">
          +{more}
        </span>
      )}
    </button>
  );
}

/** A single photo's box: its own shape, within reason, before it has loaded. */
function singleBox(attachment: TileModel, local: LocalUpload | undefined): { width: number; height: number } {
  const width = 280;
  const w = local?.file.width ?? attachment.width;
  const h = local?.file.height ?? attachment.height;
  if (!w || !h) return { width, height: 210 };
  return { width, height: Math.round(Math.min(360, Math.max(150, (width * h) / w))) };
}

/**
 * The photos of one message (board 142): one at its own shape, two side by
 * side, three as one wide over two, four as a square, and past four the
 * fourth says how many more.
 */
export function PhotoGrid({
  photos,
  onOpen,
  className,
}: {
  photos: TileModel[];
  /** Opens the viewer at a photo. */
  onOpen: (index: number) => void;
  className?: string;
}) {
  const { autoLoad } = useMediaAutoLoad();
  const [revealed, setRevealed] = useState(false);
  const firstLocal = useLocalUpload(photos[0]?.id);
  const show = autoLoad || revealed;
  // Held back only where a click would load something: ready photos with
  // no copy on this computer.
  const local = useLocalCopies(photos.map((p) => p.id));
  const held = !show && photos.some((p) => p.status === 'ready' && p.thumbUrl && !local.has(p.id));
  const shown = photos.slice(0, 4);
  const more = photos.length > 4 ? photos.length - 4 : 0;
  const open = (index: number) => {
    if (held) setRevealed(true);
    else onOpen(index);
  };

  if (photos.length === 1) {
    const box = singleBox(photos[0], firstLocal);
    return (
      <div className={cn('relative max-w-full overflow-hidden', className)} style={{ width: box.width }}>
        <PhotoTile
          attachment={photos[0]}
          show={show}
          more={0}
          className="w-full"
          style={{ height: box.height }}
          onOpen={() => open(0)}
        />
        {held && <ClickToLoad />}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative grid w-[280px] max-w-full grid-cols-2 gap-0.5 overflow-hidden',
        photos.length === 2 ? 'auto-rows-[150px]' : 'auto-rows-[136px]',
        className,
      )}
    >
      {shown.map((photo, i) => (
        <PhotoTile
          key={photo.id}
          attachment={photo}
          show={show}
          more={i === 3 ? more : 0}
          // Three: the first across the top.
          className={cn(photos.length === 3 && i === 0 && 'col-span-2')}
          onOpen={() => open(i)}
        />
      ))}
      {held && <ClickToLoad />}
    </div>
  );
}

/** The red PDF square at a file card's start. */
function PdfTile() {
  return (
    <span className="grid size-11 shrink-0 place-items-end justify-center rounded-lg bg-destructive/10 pb-1.5 text-[10px] font-extrabold tracking-wide text-destructive">
      PDF
    </span>
  );
}

/**
 * A PDF (board 142): its name, pages and size, and a round download button.
 * Clicking the card opens it in a new tab — in the desktop app, the system
 * browser — and only then does it load.
 */
export function FileCard({
  conversationId,
  messageId,
  file,
  mine,
  className,
  children,
}: {
  conversationId: string;
  /** Null while it is still only on this computer. */
  messageId: string | null;
  file: TileModel;
  mine: boolean;
  className?: string;
  /** Under the file, inside the card: their caption. */
  children?: ReactNode;
}) {
  const local = useLocalUpload(file.id);
  const ready = file.status === 'ready' && !!messageId;
  const line = localLine(local, file.status);
  const retryable = !!local && (file.status === 'failed' || local.status === 'failed');
  const stuck = file.status === 'failed' || local?.status === 'failed';
  const detail = ready
    ? fileDetailLine(file)
    : `${line}${retryable ? ' · Click to retry' : ''} · ${chatFileSize(file.sizeBytes)}`;

  const body = (
    <>
      <PdfTile />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold leading-5">{file.name}</span>
        <span
          className={cn(
            'truncate text-xs leading-[18px]',
            stuck ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {detail}
        </span>
      </span>
    </>
  );

  return (
    <div
      className={cn(
        'w-[300px] max-w-full overflow-hidden rounded-2xl bg-card text-card-foreground',
        mine ? 'rounded-br-md border-[1.5px] border-primary' : 'rounded-bl-md border',
        className,
      )}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        {ready && file.url ? (
          <a
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${file.name}, ${fileDetailLine(file)}`}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {body}
          </a>
        ) : retryable ? (
          <button
            type="button"
            onClick={() => retryUpload(file.id)}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {body}
          </button>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-3">{body}</span>
        )}
        {ready ? (
          <button
            type="button"
            onClick={() => void saveAttachment(conversationId, messageId!, file)}
            aria-label={`Download ${file.name}`}
            title="Download"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Download className="size-4" />
          </button>
        ) : retryable ? (
          <button
            type="button"
            onClick={() => retryUpload(file.id)}
            aria-label={`Send ${file.name} again`}
            title="Try again"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground hover:bg-accent"
          >
            <RotateCcw className="size-4" />
          </button>
        ) : !stuck && local && local.status !== 'waiting' ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        ) : null}
      </div>
      {local && !ready && local.status === 'uploading' && (
        <span className="mx-3 mb-2.5 block h-1 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${Math.max(4, Math.round(local.progress * 100))}%` }}
          />
        </span>
      )}
      {children}
    </div>
  );
}

/**
 * A photos or file message's content: the photos or the file, and the
 * caption — in your own bubble under them, or inside their card under the
 * photo (board 142).
 */
export function FilesContent({
  conversationId,
  messageId,
  kind,
  attachments,
  caption,
  mine,
  above,
  captionBody,
  onOpenPhoto,
}: {
  conversationId: string;
  messageId: string | null;
  kind: 'photos' | 'file';
  attachments: TileModel[];
  caption: string | null;
  mine: boolean;
  /** Forwarded, and the message it answers: above the photos. */
  above?: ReactNode;
  /** The caption drawn with mentions and links, when the thread has it. */
  captionBody?: ReactNode;
  onOpenPhoto: (index: number) => void;
}) {
  const words = caption ? (captionBody ?? caption) : null;
  const ring = 'group-hover/message:ring-3 group-hover/message:ring-accent group-focus-visible/message:ring-2 group-focus-visible/message:ring-ring';

  if (attachments.length === 0) {
    // Taken back, or from an API that sends no attachments: the words only.
    return (
      <div className={cn('rounded-2xl px-3.5 py-2.5 text-sm', mine ? 'bg-primary text-primary-foreground' : 'border bg-card')}>
        {above}
        <p className="italic opacity-80">{kind === 'file' ? 'File' : 'Photos'} not available</p>
        {words && <p className="mt-1 whitespace-pre-wrap wrap-anywhere">{words}</p>}
      </div>
    );
  }

  if (kind === 'file') {
    const file = attachments[0];
    return (
      <div className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
        {above}
        <FileCard
          conversationId={conversationId}
          messageId={messageId}
          file={file}
          mine={mine}
          className={ring}
        >
          {!mine && words && (
            <p className="whitespace-pre-wrap border-t px-3.5 py-2.5 text-sm wrap-anywhere">{words}</p>
          )}
        </FileCard>
        {mine && words && (
          <p className="mt-1 max-w-[300px] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-primary px-3.5 py-2 text-sm text-primary-foreground wrap-anywhere">
            {words}
          </p>
        )}
      </div>
    );
  }

  if (!mine && words) {
    // Theirs with a caption: one white card, the photos on top.
    return (
      <div className="flex flex-col items-start">
        {above}
        <div className={cn('w-[280px] max-w-full overflow-hidden rounded-2xl rounded-bl-md border bg-card', ring)}>
          <PhotoGrid photos={attachments} onOpen={onOpenPhoto} />
          <p className="whitespace-pre-wrap px-3.5 py-2.5 text-sm wrap-anywhere">{words}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
      {above}
      <PhotoGrid
        photos={attachments}
        onOpen={onOpenPhoto}
        className={cn('rounded-2xl', mine ? 'rounded-br-md' : 'rounded-bl-md', !mine && 'border', ring)}
      />
      {words && (
        <p className="mt-1 max-w-[280px] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-primary px-3.5 py-2 text-sm text-primary-foreground wrap-anywhere">
          {words}
        </p>
      )}
    </div>
  );
}
