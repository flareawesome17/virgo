'use client';

import { useState } from 'react';
import { ArrowLeft, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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

/** A saved reply being written or changed; no id is a new one. */
export type SavedReplyDraft = { id?: string; title: string; body: string };

/**
 * Your saved replies (board 127), as the Saved replies tile of the composer's
 * + menu shows them. A reply goes into the message box at the caret, never
 * straight to the chat, so it can be changed before it is sent.
 *
 * Writing, changing and deleting one happen in dialogs the menu keeps open
 * after it closes (SavedReplyDialogs), so this only asks for them.
 */
export function SavedRepliesPanel({
  onInsert,
  onBack,
  onStartDraft,
  onAskDelete,
}: {
  onInsert: (body: string) => void;
  /** Back to the rest of the menu. */
  onBack: () => void;
  onStartDraft: (draft: SavedReplyDraft) => void;
  onAskDelete: (reply: SavedReply) => void;
}) {
  const [managing, setManaging] = useState(false);
  const { replies, isLoading, loadFailed, refetch } = useSavedReplies(true);
  const full = replies.length >= MAX_SAVED_REPLIES;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={onBack}
          aria-label="Back to Share in this chat"
          className="-ml-1"
          // The tile that opened this has gone; focus lands here instead of
          // falling out of the menu.
          autoFocus
        >
          <ArrowLeft className="size-4" />
        </Button>
        <p className="flex-1 text-sm font-bold">Saved replies</p>
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
                onClick={() => onInsert(reply.body)}
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
                    onClick={() => onStartDraft({ id: reply.id, title: reply.title, body: reply.body })}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Delete ${reply.title}`}
                    className="text-destructive hover:text-destructive"
                    onClick={() => onAskDelete(reply)}
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
          onClick={() => onStartDraft({ title: '', body: '' })}
        >
          <Plus className="size-4" />
          New saved reply
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Up to {MAX_SAVED_REPLIES}. They follow you to the phone too.
        </p>
      </div>
    </div>
  );
}

/**
 * Writing or changing a saved reply, and deleting one. Outside the menu, so
 * they stay open once it has closed.
 */
export function SavedReplyDialogs({
  draft,
  onDraftChange,
  deleting,
  onDeletingChange,
}: {
  draft: SavedReplyDraft | null;
  onDraftChange: (draft: SavedReplyDraft | null) => void;
  deleting: SavedReply | null;
  onDeletingChange: (reply: SavedReply | null) => void;
}) {
  const save = useSaveReply();
  const remove = useDeleteSavedReply();

  const submitDraft = () => {
    if (!draft) return;
    const title = draft.title.trim();
    const body = draft.body.trim();
    if (!title || !body) return;
    save.mutate(
      { id: draft.id, title, body },
      {
        onSuccess: () => {
          onDraftChange(null);
          toast.success(draft.id ? 'Saved reply changed' : 'Saved reply added');
        },
        onError: (err) => toast.error('Could not save it', { description: chatProblem(err) }),
      },
    );
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const target = deleting;
    onDeletingChange(null);
    remove.mutate(target.id, {
      onError: (err) => toast.error('Could not delete it', { description: chatProblem(err) }),
    });
  };

  return (
    <>
      <Dialog open={draft !== null} onOpenChange={(next) => !next && onDraftChange(null)}>
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
                onChange={(e) => draft && onDraftChange({ ...draft, title: e.target.value })}
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
                onChange={(e) => draft && onDraftChange({ ...draft, body: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onDraftChange(null)}>
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

      <AlertDialog open={deleting !== null} onOpenChange={(next) => !next && onDeletingChange(null)}>
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
