'use client';

/* eslint-disable @next/next/no-img-element -- this computer's own copies, as object URLs */

import Link from 'next/link';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Database, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useUsage } from '@/hooks/useUsage';
import { useConnectionQuality } from '@/components/chat/connection';
import {
  MAX_CHAT_CAPTION,
  MAX_CHAT_PHOTOS,
  chatFileSize,
  fileDetailLine,
  formatBytes,
  type ConnectionQuality,
} from '@/api';
import {
  preparePdf,
  releasePreview,
  shrinkPhoto,
  sortPicked,
  type PickedKind,
  type PreparedFile,
} from '@/components/chat/files/prepare';
import { STORAGE_FULL_TEXT, startFilesSend, type FilesSend } from '@/components/chat/files/send-queue';

/** What the + menu, a drop or a paste hands over. */
export interface FilesPick {
  files: File[];
  /** A new pick each time, even of the same files. */
  at: number;
}

interface Item {
  id: string;
  /** Null while it is being made smaller. */
  prepared: PreparedFile | null;
}

let itemCounter = 0;
const nextItemId = () => `pick-${++itemCounter}`;

async function prepare(file: File, kind: PickedKind, quality: ConnectionQuality): Promise<PreparedFile> {
  return kind === 'photo' ? shrinkPhoto(file, quality) : preparePdf(file);
}

/**
 * Check, then send (board ChatFromPhone, as a dialog): the photos as they
 * will go, one large with a round X to take it out and a strip to choose
 * between them, a dashed + for more up to ten, a caption, what it costs of
 * your storage, and Send. A PDF shows as its file card instead.
 *
 * Every photo is made smaller here, before Send can be pressed, so the
 * storage line is what will actually be used.
 */
export function SendFilesDialog({
  conversationId,
  chatTitle,
  pick,
  replyTo,
  onClose,
  onSent,
}: {
  conversationId: string;
  /** "Send to Ana Lim", "Send to Santos Wedding crew". */
  chatTitle: string;
  /** Open while there is one. */
  pick: FilesPick | null;
  /** The message being answered, if the composer has one. */
  replyTo: FilesSend['replyTo'];
  onClose: () => void;
  /** It went into the thread: clear the reply, show the newest end. */
  onSent: () => void;
}) {
  const queryClient = useQueryClient();
  const quality = useConnectionQuality();
  const { usage, storageUsedBytes, storageLimitBytes } = useUsage({ enabled: pick !== null });
  const [mode, setMode] = useState<PickedKind | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const moreRef = useRef<HTMLInputElement>(null);
  /** Bumped on each new pick and on close, so work for an old one is let go. */
  const session = useRef(0);
  /** Items handed to the queue: theirs to let go of now. */
  const sent = useRef(false);

  /** Makes each picked file ready in turn, one at a time so ten big photos don't all decode at once. */
  const load = async (files: File[], kind: PickedKind, run: number) => {
    const fresh: Item[] = files.map(() => ({ id: nextItemId(), prepared: null }));
    const made: PreparedFile[] = [];
    setItems((current) => [...current, ...fresh]);
    setSelected((current) => current ?? fresh[0]?.id ?? null);
    for (const [i, file] of files.entries()) {
      if (session.current !== run) break;
      const id = fresh[i].id;
      try {
        const prepared = await prepare(file, kind, quality);
        made.push(prepared);
        if (session.current !== run) break;
        setItems((current) => current.map((item) => (item.id === id ? { ...item, prepared } : item)));
      } catch (err) {
        if (session.current !== run) break;
        setItems((current) => current.filter((item) => item.id !== id));
        setSelected((current) => (current === id ? null : current));
        setProblems((current) => [
          ...current,
          err instanceof Error ? err.message : `${file.name}: That couldn't be opened.`,
        ]);
      }
    }
    // A pick that was closed or replaced meanwhile: none of it stays.
    if (session.current !== run) {
      made.forEach(releasePreview);
      const ids = new Set(fresh.map((item) => item.id));
      setItems((current) => current.filter((item) => !ids.has(item.id)));
    }
  };

  // A new pick: start again with it.
  const [seenPick, setSeenPick] = useState<FilesPick | null>(null);
  if (pick !== seenPick) {
    setSeenPick(pick);
    setItems([]);
    setSelected(null);
    setCaption('');
    setProblems([]);
    setMode(null);
  }
  useEffect(() => {
    if (!pick) return;
    const run = ++session.current;
    sent.current = false;
    const sorted = sortPicked(pick.files);
    if (!sorted.mode) {
      // Nothing in it can go: said in a line, with no dialog to close.
      toast.error("That can't be sent here", {
        id: 'files-refused',
        description: sorted.problems.join(' ') || 'Only photos and PDFs can be sent.',
      });
      onClose();
      return;
    }
    setMode(sorted.mode);
    setProblems(sorted.problems);
    void load(sorted.take, sorted.mode, run);
    // Only on a new pick; `load` reads the line as it is then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick]);

  // Closing or a new pick lets go of copies that never went.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });
  useEffect(
    () => () => {
      if (!sent.current) itemsRef.current.forEach((item) => item.prepared && releasePreview(item.prepared));
    },
    [pick],
  );

  const close = () => {
    session.current += 1;
    onClose();
  };

  const addMore = (files: File[]) => {
    const room = MAX_CHAT_PHOTOS - items.length;
    const sorted = sortPicked(files, room);
    if (sorted.mode !== 'photo') {
      setProblems((current) => [
        ...current,
        ...sorted.problems,
        ...(sorted.mode === 'file' ? ['A PDF goes on its own. Send it in a message of its own.'] : []),
      ]);
      return;
    }
    setProblems((current) => [...current, ...sorted.problems]);
    if (sorted.take.length > 0) void load(sorted.take, 'photo', session.current);
  };

  const remove = (id: string) => {
    const at = items.findIndex((item) => item.id === id);
    const item = items[at];
    if (item?.prepared) releasePreview(item.prepared);
    const rest = items.filter((x) => x.id !== id);
    if (rest.length === 0) {
      close();
      return;
    }
    setItems(rest);
    setSelected(rest[Math.min(at, rest.length - 1)]?.id ?? null);
  };

  const ready = items.filter((item): item is Item & { prepared: PreparedFile } => !!item.prepared);
  const preparing = ready.length < items.length;
  const total = ready.reduce((sum, item) => sum + item.prepared.sizeBytes, 0);
  const left = storageLimitBytes != null ? Math.max(0, storageLimitBytes - storageUsedBytes) : null;
  const noRoom = !!usage && left != null && total > left;
  const current = items.find((item) => item.id === selected) ?? items[0];
  const count = items.length;
  /** Something left to send: not a pick that was all refused. */
  const sendable = !!mode && count > 0;
  const trimmed = caption.trim();

  const send = () => {
    if (!mode || preparing || ready.length === 0 || noRoom) return;
    sent.current = true;
    startFilesSend(queryClient, {
      conversationId,
      kind: mode === 'photo' ? 'photos' : 'file',
      files: ready.map((item) => item.prepared),
      caption: trimmed ? trimmed.slice(0, MAX_CHAT_CAPTION) : null,
      replyTo,
    });
    close();
    onSent();
  };

  const onCaptionKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // As in the message box: Enter sends, Shift+Enter breaks the line.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  const what =
    mode === 'file'
      ? 'A file from this computer'
      : `${count === 1 ? '1 photo' : `${count} photos`} from this computer`;
  const sendLabel = mode === 'file' ? 'Send file' : count === 1 ? 'Send photo' : `Send ${count} photos`;
  const file = mode === 'file' ? current?.prepared : null;

  return (
    <Dialog open={pick !== null && mode !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[min(48rem,calc(100dvh-2rem))] flex-col gap-3 sm:max-w-md"
      >
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={close} aria-label="Close" className="-ml-1 shrink-0">
            <X className="size-5" />
          </Button>
          <div className="min-w-0">
            <DialogTitle className="truncate text-base font-bold leading-tight">Send to {chatTitle}</DialogTitle>
            <DialogDescription className="truncate text-xs">{sendable ? what : 'Nothing to send'}</DialogDescription>
          </div>
        </div>

        {mode === 'photo' && current && (
          <>
            {/* The one chosen, large, with the round X that takes it out. */}
            <div className="relative grid h-[min(42vh,320px)] shrink-0 place-items-center overflow-hidden rounded-2xl bg-muted">
              {current.prepared?.previewUrl ? (
                <img
                  src={current.prepared.previewUrl}
                  alt={current.prepared.name}
                  className="size-full object-contain"
                  draggable={false}
                />
              ) : (
                <span className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" aria-hidden />
                  Making it smaller…
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(current.id)}
                aria-label="Take this photo out"
                title="Take this photo out"
                className="absolute right-2.5 top-2.5 grid size-8 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* The strip: the chosen one ringed, then + for more. */}
            <ul className="flex shrink-0 gap-2 overflow-x-auto pb-1" aria-label="Photos to send">
              {items.map((item, i) => (
                <li key={item.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelected(item.id)}
                    aria-label={`Photo ${i + 1}`}
                    aria-current={item.id === current.id || undefined}
                    className={cn(
                      'relative grid size-14 place-items-center overflow-hidden rounded-xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      item.id === current.id && 'ring-2 ring-primary ring-offset-2 ring-offset-popover',
                    )}
                  >
                    {item.prepared?.previewUrl ? (
                      <img src={item.prepared.previewUrl} alt="" className="size-full object-cover" draggable={false} />
                    ) : (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                    )}
                  </button>
                </li>
              ))}
              {count < MAX_CHAT_PHOTOS && (
                <li className="shrink-0">
                  <button
                    type="button"
                    onClick={() => moreRef.current?.click()}
                    aria-label="Add more photos"
                    title={`Add more, up to ${MAX_CHAT_PHOTOS}`}
                    className="grid size-14 place-items-center rounded-xl border border-dashed border-input text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Plus className="size-5" />
                  </button>
                </li>
              )}
            </ul>
            <input
              ref={moreRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              data-files-input="more"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = '';
                if (files.length > 0) addMore(files);
              }}
            />
          </>
        )}

        {mode === 'file' && (
          <div className="flex items-center gap-3 rounded-2xl border bg-card px-3 py-3">
            <span className="grid size-11 shrink-0 place-items-end justify-center rounded-lg bg-destructive/10 pb-1.5 text-[10px] font-extrabold tracking-wide text-destructive">
              PDF
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold">{file?.name ?? 'Reading the file…'}</span>
              <span className="text-xs text-muted-foreground">
                {file ? fileDetailLine({ pages: file.pages, sizeBytes: file.sizeBytes }) : ' '}
              </span>
            </span>
          </div>
        )}

        {sendable && (
          <Textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, MAX_CHAT_CAPTION))}
            onKeyDown={onCaptionKey}
            placeholder="Add a caption…"
            aria-label="Caption"
            rows={1}
            maxLength={MAX_CHAT_CAPTION}
            className="max-h-32 min-h-11 shrink-0 resize-none"
          />
        )}

        {problems.length > 0 && (
          <ul className="flex shrink-0 flex-col gap-1 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
            {problems.map((problem, i) => (
              <li key={i} className="flex gap-1.5">
                <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                <span>{problem}</span>
              </li>
            ))}
          </ul>
        )}

        {sendable &&
          (noRoom ? (
            <div className="flex shrink-0 gap-2.5 rounded-xl bg-destructive/10 px-3 py-2.5 text-xs leading-relaxed text-destructive" role="alert">
              <Database className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                {STORAGE_FULL_TEXT}{' '}
                <Link href="/settings/storage" className="font-semibold underline underline-offset-2">
                  Open storage
                </Link>
              </p>
            </div>
          ) : (
            <div className="flex shrink-0 gap-2.5 rounded-xl bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              <Database className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                <span className="font-semibold text-foreground">
                  {preparing && total === 0 ? 'Working out the size…' : `${chatFileSize(total)} of your storage`}
                </span>
                {left != null ? ` · ${formatBytes(left)} left.` : '.'}
                {mode === 'photo' && ' Sent as smaller copies. For full-size files, send them from an album.'}
              </p>
            </div>
          ))}

        {sendable && (
          <Button
            onClick={send}
            disabled={preparing || ready.length === 0 || noRoom}
            className="h-11 w-full shrink-0 rounded-xl text-sm font-bold"
          >
            {preparing && <Loader2 className="size-4 animate-spin" />}
            {sendLabel}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
