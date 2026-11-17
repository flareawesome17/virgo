'use client';

import { useRef, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { useDeleteSavedReply, useSaveReply, useSavedReplies } from '@/hooks/useChat';
import { MAX_SAVED_REPLIES, type SavedReply } from '@/api';
import { chatProblem } from '@/components/chat/chat-errors';

/** The API's limits, so a field never takes more than will be kept. */
const MAX_TITLE = 60;
const MAX_BODY = 2000;

type Draft = { id?: string; title: string; body: string };

/**
 * The round + at the left of the composer, opening your saved replies
 * (board 127). A reply goes into the message box at the caret, never
 * straight to the chat, so it can be changed before it is sent.
 *
 * Phase 2 turns this button into the share menu, with Saved replies one of
 * its tiles; the popover below is what that tile will open.
 */
export function SavedRepliesButton({ onInsert }: { onInsert: (body: string) => void }) {
  const [open, setOpen] = useState(false);
  const [managing, setManaging] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<SavedReply | null>(null);
  /** Set as a reply goes in, so closing hands focus to the box, not the button. */
  const inserted = useRef(false);

  const { replies, isLoading, loadFailed, refetch } = useSavedReplies(open || draft !== null);
  const save = useSaveReply();
  const remove = useDeleteSavedReply();
  const full = replies.length >= MAX_SAVED_REPLIES;

  const startDraft = (next: Draft) => {
    setOpen(false);
    setDraft(next);
  };

  const submitDraft = () => {
    if (!draft) return;
    const title = draft.title.trim();
    const body = draft.body.trim();
    if (!title || !body) return;
    save.mutate(
      { id: draft.id, title, body },
      {
        onSuccess: () => {
          setDraft(null);
          toast.success(draft.id ? 'Saved reply changed' : 'Saved reply added');
        },
        onError: (err) => toast.error('Could not save it', { description: chatProblem(err) }),
      },
    );
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    remove.mutate(target.id, {
      onError: (err) => toast.error('Could not delete it', { description: chatProblem(err) }),
    });
  };

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setManaging(false);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            aria-label="Saved replies"
            title="Saved replies"
            className="shrink-0 rounded-full"
          >
            {open ? <X className="size-4" /> : <Plus className="size-4" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-[min(24rem,calc(100vw-2rem))] gap-3 rounded-2xl p-3"
          // Once a reply is in, the box has focus and its caret; the button
          // taking focus back would pull it away.
          onCloseAutoFocus={(event) => {
            if (!inserted.current) return;
            inserted.current = false;
            event.preventDefault();
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold">Saved replies</p>
            {replies.length > 0 && (
              <Button size="xs" variant="ghost" onClick={() => setManaging((m) => !m)}>
                {managing ? 'Done' : 'Manage'}
              </Button>
            )}
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            {managing
              ? 'Rename, change or delete them.'
              : 'Click one to put it in your message. Change anything before you send.'}
          </p>

          {isLoading && replies.length === 0 ? (
            <div className="grid place-items-center py-6">
              <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />
            </div>
          ) : loadFailed && replies.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Couldn&apos;t load your saved replies.{' '}
              <button type="button" className="underline" onClick={() => void refetch()}>
                Try again
              </button>
            </p>
          ) : replies.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nothing saved yet. Keep the answers you give most — your rates, what&apos;s
              included — and drop them into any chat.
            </p>
          ) : (
            <ul className="-mx-1 flex max-h-72 flex-col gap-0.5 overflow-y-auto">
              {replies.map((reply) => (
                <li key={reply.id} className="flex items-start gap-1">
                  <button
                    type="button"
                    disabled={managing}
                    onClick={() => {
                      inserted.current = true;
                      setOpen(false);
                      onInsert(reply.body);
                    }}
                    className={cn(
                      'flex min-w-0 flex-1 flex-col rounded-xl px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      !managing && 'hover:bg-accent',
                    )}
                  >
                    <span className="truncate text-sm font-semibold">{reply.title}</span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">{reply.body}</span>
                  </button>
                  {managing && (
                    <div className="flex shrink-0 items-center gap-0.5 pt-1.5">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Edit ${reply.title}`}
                        onClick={() => startDraft({ id: reply.id, title: reply.title, body: reply.body })}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Delete ${reply.title}`}
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          setOpen(false);
                          setDeleting(reply);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-1.5 border-t pt-3">
            <Button
              variant="outline"
              className="w-full"
              disabled={full}
              onClick={() => startDraft({ title: '', body: '' })}
            >
              <Plus className="size-4" />
              New saved reply
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Up to {MAX_SAVED_REPLIES}. They follow you to the phone too.
            </p>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={draft !== null} onOpenChange={(next) => !next && setDraft(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Edit saved reply' : 'New saved reply'}</DialogTitle>
            <DialogDescription>
              It goes into your message, never straight to the chat, so you can change it first.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              submitDraft();
            }}
          >
            <div className="grid gap-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="saved-reply-title">Name</Label>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {draft?.title.length ?? 0}/{MAX_TITLE}
                </span>
              </div>
              <Input
                id="saved-reply-title"
                value={draft?.title ?? ''}
                maxLength={MAX_TITLE}
                autoFocus
                placeholder="e.g. Wedding rates 2027"
                onChange={(e) => setDraft((d) => (d ? { ...d, title: e.target.value } : d))}
              />
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="saved-reply-body">Words</Label>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {draft?.body.length ?? 0}/{MAX_BODY}
                </span>
              </div>
              <Textarea
                id="saved-reply-body"
                value={draft?.body ?? ''}
                maxLength={MAX_BODY}
                rows={6}
                placeholder="What you'd type every time"
                className="max-h-72 min-h-32 resize-none"
                onChange={(e) => setDraft((d) => (d ? { ...d, body: e.target.value } : d))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!draft?.title.trim() || !draft?.body.trim() || save.isPending}
              >
                {save.isPending && <Loader2 className="size-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(next) => !next && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It goes from your phone too. Messages you already sent with it stay as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
