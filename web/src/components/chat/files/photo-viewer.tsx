'use client';

/* eslint-disable @next/next/no-img-element -- a signed chat photo, or this computer's own copy of it */

import { useEffect, useRef, useState } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { ArrowLeft, ArrowRight, Download, Forward, ImagePlus, Reply, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { filesCaption, type ChatAttachment, type ConversationMessage } from '@/api';
import { useLocalUpload } from '@/components/chat/files/send-queue';
import { saveAttachment, stableLink } from '@/components/chat/files/files-message';

/** "Today, 1:40 PM", "Yesterday, 9:05 AM", "Nov 12, 1:40 PM". */
export function dayAndTime(iso: string): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(at, today)) return `Today, ${time}`;
  if (same(at, yesterday)) return `Yesterday, ${time}`;
  return `${at.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(at.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
  })}, ${time}`;
}

/** The photo on the stage: this computer's copy, else the full photo over its small copy. */
function Stage({ photo }: { photo: ChatAttachment }) {
  const local = useLocalUpload(photo.id);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [room, setRoom] = useState<{ width: number; height: number } | null>(null);
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const full = local?.file.previewUrl ?? stableLink(photo.id, 'full', photo.url);
  const small = stableLink(photo.id, 'thumb', photo.thumbUrl);
  const w = local?.file.width ?? photo.width ?? 4;
  const h = local?.file.height ?? photo.height ?? 3;

  // The photo's box, fitted to the stage at its own shape and never past its
  // own pixels, so the blurred stand-in sits exactly where the photo lands.
  useEffect(() => {
    if (!frame) return undefined;
    const measure = () => setRoom({ width: frame.clientWidth, height: frame.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [frame]);
  const scale = room ? Math.min(room.width / w, room.height / h, w > 4 ? 1 : Infinity) : 0;
  const box = room ? { width: Math.floor(w * scale), height: Math.floor(h * scale) } : null;

  if (photo.status !== 'ready' && !local) {
    return (
      <div className="absolute inset-0 grid place-items-center">
        <p className="px-6 text-center text-sm text-white/70">
          {photo.status === 'failed' ? "This photo didn't arrive." : 'This photo is still on its way.'}
        </p>
      </div>
    );
  }

  return (
    <div ref={setFrame} className="absolute inset-0 flex items-center justify-center">
    <div className="relative overflow-hidden" style={box ?? { width: 0, height: 0 }}>
      {photo.blur && (
        <span
          aria-hidden
          className="absolute inset-0 scale-110 bg-cover bg-center blur-md"
          style={{ backgroundImage: `url("${photo.blur}")` }}
        />
      )}
      {small && loaded !== full && (
        <img src={small} alt="" draggable={false} className="absolute inset-0 size-full object-contain" />
      )}
      {full && (
        <img
          key={full}
          src={full}
          alt={photo.name}
          draggable={false}
          onLoad={() => setLoaded(full)}
          className={cn(
            'absolute inset-0 size-full object-contain transition-opacity duration-200',
            loaded === full ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}
    </div>
    </div>
  );
}

/**
 * A chat photo, full screen (board ChatPhotoViewer, as a lightbox): who sent
 * it and when, "2 of 4", the arrows and the Left and Right keys between the
 * message's photos, Escape to close, the caption under the photo, and Reply,
 * Forward, Save and Add to album along the bottom.
 */
export function PhotoViewer({
  conversationId,
  chatTitle,
  message,
  index,
  meId,
  canSend,
  onIndexChange,
  onClose,
  onReply,
  onForward,
  onAddToAlbum,
}: {
  conversationId: string;
  /** "in Ana Lim", "in Santos Wedding crew". */
  chatTitle: string;
  /** Open while there is one. */
  message: ConversationMessage | null;
  index: number;
  meId: string | undefined;
  /** Reply and Forward only where the chat takes new messages. */
  canSend: boolean;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onReply: (message: ConversationMessage) => void;
  onForward: (message: ConversationMessage) => void;
  onAddToAlbum: (message: ConversationMessage, photo: ChatAttachment) => void;
}) {
  const photos = (message?.attachments ?? []).filter((a) => a.kind === 'photo');
  const at = Math.min(Math.max(index, 0), Math.max(photos.length - 1, 0));
  const photo = photos[at];
  const caption = message ? filesCaption(message) : null;
  const many = photos.length > 1;

  const step = (by: number) => {
    if (!many) return;
    onIndexChange((at + by + photos.length) % photos.length);
  };

  // Left and Right between the photos; Escape is the dialog's own.
  useEffect(() => {
    if (!message || !many) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onIndexChange((at + 1) % photos.length);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onIndexChange((at - 1 + photos.length) % photos.length);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [message, many, at, photos.length, onIndexChange]);

  /**
   * Reply and Forward close the viewer and then act, once it has finished
   * closing: run while it closes, the viewer's focus trap took focus back
   * from the message box or the forward dialog.
   */
  const leaving = useRef<(() => void) | null>(null);
  const leaveThen = (run: () => void) => {
    leaving.current = run;
    onClose();
  };

  const ready = photo?.status === 'ready';
  const sender = message && message.sender_id === meId ? 'You' : (message?.sender_name ?? 'Someone');
  const action =
    'flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-40 disabled:hover:bg-transparent';

  return (
    <DialogPrimitive.Root open={message !== null && !!photo} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#0d0c0b]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col bg-[#0d0c0b] text-white outline-none"
          onCloseAutoFocus={(event) => {
            const run = leaving.current;
            if (!run) return;
            leaving.current = null;
            event.preventDefault();
            run();
          }}
        >
          {message && photo && (
            <>
              <div className="flex h-16 shrink-0 items-center gap-3 px-4">
                <DialogPrimitive.Close
                  aria-label="Close"
                  className="grid size-10 place-items-center rounded-full text-white/85 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  <X className="size-5" />
                </DialogPrimitive.Close>
                <div className="min-w-0 flex-1">
                  <DialogPrimitive.Title className="truncate text-sm font-bold">{sender}</DialogPrimitive.Title>
                  <p className="truncate text-xs text-white/65">
                    {dayAndTime(message.created_at)} · in {chatTitle}
                  </p>
                </div>
                {many && (
                  <p className="shrink-0 text-sm font-semibold tabular-nums text-white/75" aria-live="polite">
                    {at + 1} of {photos.length}
                  </p>
                )}
              </div>

              <div className="relative min-h-0 flex-1">
                <div className="absolute inset-y-0 left-2 right-2 sm:left-16 sm:right-16">
                  <Stage key={photo.id} photo={photo} />
                </div>
                {many && (
                  <>
                    <button
                      type="button"
                      onClick={() => step(-1)}
                      aria-label="Previous photo"
                      className="absolute left-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white/85 backdrop-blur-md hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                    >
                      <ArrowLeft className="size-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => step(1)}
                      aria-label="Next photo"
                      className="absolute right-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white/85 backdrop-blur-md hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                    >
                      <ArrowRight className="size-5" />
                    </button>
                  </>
                )}
              </div>

              {caption && (
                <p className="mx-auto w-full max-w-2xl shrink-0 whitespace-pre-wrap px-4 pt-3 text-sm wrap-anywhere text-white/90">
                  {caption}
                </p>
              )}

              <div className="mx-auto flex w-full max-w-xl shrink-0 items-stretch gap-1 px-3 pb-4 pt-3">
                {canSend && (
                  <button type="button" className={action} onClick={() => leaveThen(() => onReply(message))}>
                    <Reply className="size-5" aria-hidden />
                    Reply
                  </button>
                )}
                {canSend && (
                  <button type="button" className={action} disabled={!ready} onClick={() => leaveThen(() => onForward(message))}>
                    <Forward className="size-5" aria-hidden />
                    Forward
                  </button>
                )}
                <button
                  type="button"
                  className={action}
                  disabled={!ready}
                  onClick={() => void saveAttachment(conversationId, message.id, photo)}
                >
                  <Download className="size-5" aria-hidden />
                  Save
                </button>
                <button
                  type="button"
                  className={action}
                  disabled={!ready}
                  onClick={() => onAddToAlbum(message, photo)}
                >
                  <ImagePlus className="size-5" aria-hidden />
                  Add to album
                </button>
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
