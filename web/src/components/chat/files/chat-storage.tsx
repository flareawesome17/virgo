'use client';

/* eslint-disable @next/next/no-img-element -- your own chat photos' small copies, signed */

import { useMemo, useState } from 'react';
import { Check, ChevronRight, Info, Loader2, MessageCircle, Mic, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CenteredSpinner, ErrorState } from '@/components/states';
import { useMediaAutoLoad } from '@/components/chat/connection';
import { chatProblem } from '@/components/chat/chat-errors';
import { useChatFilesUsage, useSentFiles, useUnsendFiles } from '@/hooks/useChatFiles';
import {
  chatFileSize,
  fileDetailLine,
  filesCaption,
  formatBytes,
  voiceAttachment,
  voiceLength,
  type ChatFilesUsage,
  type ConversationMessage,
} from '@/api';

type ChatRow = ChatFilesUsage['chats'][number];

/** How many of the chats using the most show before "See all". */
const TOP_CHATS = 3;

/** What one photo or file message takes up. */
function messageBytes(message: ConversationMessage): number {
  return (message.attachments ?? []).reduce((sum, a) => sum + a.sizeBytes, 0);
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * "What you sent in <chat>": your photos as a grid, and your files and voice
 * notes as rows, each with its size. Pick some, then Delete for everyone,
 * which takes them back from everyone in that chat and gives the room back.
 */
function SentFilesDialog({ chat, onOpenChange }: { chat: ChatRow | null; onOpenChange: (open: boolean) => void }) {
  const { messages, data, isLoading, loadFailed, refetch } = useSentFiles(chat?.conversationId);
  const unsend = useUnsendFiles();
  const { autoLoad } = useMediaAutoLoad();
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const show = autoLoad || revealed;

  const photos = useMemo(() => messages.filter((m) => m.kind === 'photos'), [messages]);
  const files = useMemo(() => messages.filter((m) => m.kind === 'file'), [messages]);
  const voices = useMemo(() => messages.filter((m) => m.kind === 'voice'), [messages]);
  const freed = messages.filter((m) => picked.includes(m.id)).reduce((sum, m) => sum + messageBytes(m), 0);
  const total = data?.total ?? messages.length;

  const toggle = (id: string) =>
    setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  const close = () => {
    onOpenChange(false);
    setPicked([]);
    setConfirming(false);
    setRevealed(false);
  };

  const deleteNow = () => {
    const ids = picked;
    unsend.mutate(ids, {
      onSuccess: ({ unsent }) => {
        setConfirming(false);
        setPicked([]);
        toast.success(`Deleted for everyone · ${chatFileSize(freed)} freed`, {
          description:
            unsent < ids.length
              ? `${ids.length - unsent} of them were already gone.`
              : undefined,
        });
      },
      onError: (err) => toast.error('Could not delete them', { description: chatProblem(err) }),
    });
  };

  return (
    <>
      <Dialog open={chat !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className="flex max-h-[min(46rem,calc(100dvh-2rem))] flex-col gap-3 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>What you sent in {chat?.title}</DialogTitle>
            <DialogDescription>
              {chat && !chat.member
                ? "You've left this chat. What you sent still counts until you delete it."
                : `${chatFileSize(chat?.bytes ?? 0)} of your storage. Pick what to take back.`}
            </DialogDescription>
          </DialogHeader>

          <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
            {isLoading && messages.length === 0 ? (
              <CenteredSpinner />
            ) : loadFailed && messages.length === 0 ? (
              <ErrorState message="Couldn't load what you sent." onRetry={() => void refetch()} />
            ) : messages.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nothing of yours is left in this chat.
              </p>
            ) : (
              <div className="flex flex-col gap-4 pb-1">
                {photos.length > 0 && (
                  <section className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between">
                      <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        Photos
                      </h3>
                      {!show && (
                        <button
                          type="button"
                          onClick={() => setRevealed(true)}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          Load the pictures
                        </button>
                      )}
                    </div>
                    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {photos.map((m) => {
                        const first = m.attachments?.find((a) => a.status === 'ready') ?? m.attachments?.[0];
                        const count = m.attachments?.length ?? 0;
                        const on = picked.includes(m.id);
                        const caption = filesCaption(m);
                        return (
                          <li key={m.id}>
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={on}
                              aria-label={`${count === 1 ? 'A photo' : `${count} photos`}, ${chatFileSize(messageBytes(m))}, ${shortDate(m.created_at)}${caption ? `: ${caption}` : ''}`}
                              onClick={() => toggle(m.id)}
                              className="flex w-full flex-col gap-1 text-left focus-visible:outline-none"
                            >
                              <span
                                className={cn(
                                  'relative block aspect-square w-full overflow-hidden rounded-xl bg-muted',
                                  on && 'ring-2 ring-primary ring-offset-2 ring-offset-popover',
                                )}
                              >
                                {first?.blur && (
                                  <span
                                    aria-hidden
                                    className="absolute inset-0 scale-110 bg-cover bg-center blur-md"
                                    style={{ backgroundImage: `url("${first.blur}")` }}
                                  />
                                )}
                                {show && first?.thumbUrl && (
                                  <img
                                    src={first.thumbUrl}
                                    alt=""
                                    loading="lazy"
                                    draggable={false}
                                    className="absolute inset-0 size-full object-cover"
                                  />
                                )}
                                {first && first.status !== 'ready' && (
                                  <span className="absolute inset-0 grid place-items-center px-2 text-center text-[11px] font-semibold text-muted-foreground">
                                    {first.status === 'failed' ? "Didn't arrive" : 'Still sending'}
                                  </span>
                                )}
                                {count > 1 && (
                                  <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white">
                                    {count}
                                  </span>
                                )}
                                <span
                                  aria-hidden
                                  className={cn(
                                    'absolute left-1.5 top-1.5 grid size-5 place-items-center rounded-full border-2 border-white shadow',
                                    on ? 'bg-primary text-primary-foreground' : 'bg-black/25',
                                  )}
                                >
                                  {on && <Check className="size-3" />}
                                </span>
                              </span>
                              <span className="px-0.5 text-xs font-semibold tabular-nums">
                                {chatFileSize(messageBytes(m))}
                              </span>
                              <span className="-mt-1 px-0.5 text-[11px] text-muted-foreground">
                                {shortDate(m.created_at)}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}

                {files.length > 0 && (
                  <section className="flex flex-col gap-1">
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Files
                    </h3>
                    <ul className="flex flex-col">
                      {files.map((m) => {
                        const file = m.attachments?.[0];
                        const on = picked.includes(m.id);
                        return (
                          <li key={m.id}>
                            <label className="flex cursor-pointer items-center gap-3 rounded-xl px-1 py-2 hover:bg-accent/50">
                              <Checkbox checked={on} onCheckedChange={() => toggle(m.id)} />
                              <span className="grid size-10 shrink-0 place-items-end justify-center rounded-lg bg-destructive/10 pb-1 text-[10px] font-extrabold text-destructive">
                                PDF
                              </span>
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate text-sm font-semibold">{file?.name ?? 'File'}</span>
                                <span className="text-xs text-muted-foreground">
                                  {file ? fileDetailLine(file) : chatFileSize(messageBytes(m))} ·{' '}
                                  {shortDate(m.created_at)}
                                </span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}

                {voices.length > 0 && (
                  <section className="flex flex-col gap-1">
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Voice notes
                    </h3>
                    <ul className="flex flex-col">
                      {voices.map((m) => {
                        const note = voiceAttachment(m) ?? m.attachments?.[0];
                        const on = picked.includes(m.id);
                        return (
                          <li key={m.id}>
                            <label className="flex cursor-pointer items-center gap-3 rounded-xl px-1 py-2 hover:bg-accent/50">
                              <Checkbox checked={on} onCheckedChange={() => toggle(m.id)} />
                              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                                <Mic className="size-5" aria-hidden />
                              </span>
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate text-sm font-semibold">
                                  Voice note{note?.durationMs ? ` · ${voiceLength(note.durationMs)}` : ''}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {chatFileSize(messageBytes(m))} · {shortDate(m.created_at)}
                                  {note && note.status !== 'ready'
                                    ? ` · ${note.status === 'failed' ? "Didn't arrive" : 'Still sending'}`
                                    : ''}
                                </span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}

                {total > messages.length && (
                  <p className="text-xs text-muted-foreground">
                    Showing the newest {messages.length} of {total}. Delete some to see the rest.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="items-center sm:justify-between">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setPicked(picked.length === messages.length ? [] : messages.map((m) => m.id))
                  }
                  className="font-semibold text-primary hover:underline"
                >
                  {picked.length === messages.length ? 'Select none' : 'Select all'}
                </button>
              )}
              <span className="tabular-nums">
                {picked.length > 0 ? `${picked.length} selected · ${chatFileSize(freed)}` : 'None selected'}
              </span>
            </div>
            <Button
              variant="destructive"
              disabled={picked.length === 0 || unsend.isPending}
              onClick={() => setConfirming(true)}
            >
              <Trash2 className="size-4" />
              Delete for everyone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {picked.length === 1 ? 'it' : `these ${picked.length}`} for everyone?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This takes them back for everyone in {chat?.title} and frees {chatFileSize(freed)}. It
              can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unsend.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={unsend.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                // Open until it has worked, so a failure is seen.
                event.preventDefault();
                deleteNow();
              }}
            >
              {unsend.isPending && <Loader2 className="size-4 animate-spin" />}
              Delete for everyone
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Storage, with chat (board ChatStorage, as a section of the storage page):
 * what you sent in chats, the chats using the most, and what happens when
 * you run out. Photos others send you count toward their storage, not yours.
 */
export function ChatStorageSection() {
  const { usage, isLoading, loadFailed, refetch } = useChatFilesUsage();
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<ChatRow | null>(null);
  const chats = usage?.chats ?? [];
  const shown = all ? chats : chats.slice(0, TOP_CHATS);

  return (
    <>
      <h2 className="mb-2 mt-8 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        Sent in chats
      </h2>
      <Card className="py-0">
        <CardContent className="p-0">
          {isLoading && !usage ? (
            <CenteredSpinner />
          ) : loadFailed && !usage ? (
            <ErrorState message="Could not load what you sent in chats." onRetry={() => void refetch()} />
          ) : (
            <div className="flex items-center gap-3 px-5 py-3">
              <span className="size-2.5 shrink-0 rounded-[3px] bg-primary/45" aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">Sent in chats</span>
                <span className="text-xs text-muted-foreground">
                  Photos, files and voice notes from your phone or computer
                  {usage && usage.files > 0 ? ` · ${usage.files} file${usage.files === 1 ? '' : 's'}` : ''}
                </span>
              </span>
              <span className="text-sm font-semibold tabular-nums">{formatBytes(usage?.bytes ?? 0)}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {chats.length > 0 && (
        <>
          <h3 className="mb-2 mt-5 text-sm font-semibold">Chats using the most</h3>
          <Card className="py-0">
            <CardContent className="p-0">
              <ul>
                {shown.map((chat) => (
                  <li key={chat.conversationId} className="border-b last:border-0">
                    <button
                      type="button"
                      onClick={() => setOpen(chat)}
                      className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                        {chat.isGroup ? <Users className="size-4" aria-hidden /> : <MessageCircle className="size-4" aria-hidden />}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-semibold">{chat.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {chat.files} file{chat.files === 1 ? '' : 's'}
                          {chat.member ? '' : ' · You left this chat'}
                        </span>
                      </span>
                      <span className="text-sm tabular-nums text-muted-foreground">{chatFileSize(chat.bytes)}</span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              {chats.length > TOP_CHATS && (
                <button
                  type="button"
                  onClick={() => setAll((v) => !v)}
                  className="w-full border-t px-5 py-2.5 text-left text-sm font-semibold text-primary hover:bg-accent/40"
                >
                  {all ? 'Show fewer' : `See all ${chats.length}`}
                </button>
              )}
            </CardContent>
          </Card>
          <p className="mt-2 px-1 text-xs leading-relaxed text-muted-foreground">
            Open one to see what you sent and delete it for everyone. Photos others send you count
            toward their storage, not yours.
          </p>
        </>
      )}

      <div className="mt-3 flex gap-2.5 rounded-xl bg-muted px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          If you run out, photos, files and voice notes from your phone or computer won&apos;t send.
          Messages, album photos, cards and dates always will.
        </p>
      </div>

      <SentFilesDialog
        // As it is now: deleting from it changes what it uses.
        chat={
          open
            ? (chats.find((c) => c.conversationId === open.conversationId) ?? { ...open, bytes: 0, files: 0 })
            : null
        }
        onOpenChange={(next) => !next && setOpen(null)}
      />
    </>
  );
}
