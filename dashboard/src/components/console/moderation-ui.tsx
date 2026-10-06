'use client';

import { useState } from 'react';
import { Lock, MessagesSquare, ShieldAlert } from 'lucide-react';
import { useReportEvidence, useRemoveComment } from '@/hooks/useConsole';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { WARNING_STARTERS } from './moderation';
import { when } from './primitives';

/** A starting text for a warning, dropped into the box to be edited. */
export function StarterPicker({ onPick }: { onPick: (text: string) => void }) {
  return (
    <select
      aria-label="Start from"
      defaultValue=""
      onChange={(e) => {
        const starter = WARNING_STARTERS.find((s) => s.key === e.target.value);
        if (starter) onPick(starter.text);
        e.target.value = '';
      }}
      className="h-7 rounded-md border bg-background px-2 text-xs text-muted-foreground"
    >
      <option value="">Start from…</option>
      {WARNING_STARTERS.map((s) => (
        <option key={s.key} value={s.key}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

/** Asks before removing a comment, with an optional warning to its author. */
export function RemoveCommentDialog({
  comment,
  onClose,
}: {
  comment: { id: string; body: string; author_name: string } | null;
  onClose: () => void;
}) {
  const remove = useRemoveComment();
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const close = () => {
    setMessage('');
    setNote('');
    onClose();
  };

  return (
    <Dialog
      open={!!comment}
      onOpenChange={(open) => {
        if (!open && !remove.isPending) close();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Remove this comment?</DialogTitle>
          <DialogDescription>
            It disappears from the post for everyone. Its words stay in {comment?.author_name}&apos;s record.
          </DialogDescription>
        </DialogHeader>
        {comment && (
          <blockquote className="rounded-md border-l-2 bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap wrap-anywhere">
            {comment.body}
          </blockquote>
        )}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="comment-warning">Tell them why (optional)</Label>
            <StarterPicker onPick={setMessage} />
          </div>
          <Textarea
            id="comment-warning"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
            placeholder="Left empty, they are not told. Written, it reaches their support inbox and their email."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="comment-note">Note for staff (optional)</Label>
          <Textarea id="comment-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() =>
              comment &&
              remove.mutate(
                { id: comment.id, message: message.trim() || undefined, note: note.trim() || undefined },
                { onSuccess: close },
              )
            }
          >
            <ShieldAlert className="size-4" />
            {message.trim() ? 'Remove and warn' : 'Remove'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The messages a chat report brought, behind a button.
 *
 * Not loaded with the page: each look is a look at private messages, and the
 * API writes it to the audit log. Without content.evidence the button is not
 * offered at all, only the count.
 */
export function Evidence({
  reportId,
  count,
  allowed,
}: {
  reportId: string;
  count: number;
  allowed: boolean;
}) {
  const [shown, setShown] = useState(false);
  const { data, isLoading, isError, refetch } = useReportEvidence(reportId, shown);

  if (!allowed) {
    return (
      <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3.5" />
        {count} reported message{count === 1 ? '' : 's'}. Reading them needs “Read reported messages”.
      </p>
    );
  }
  if (!shown) {
    return (
      <Button size="sm" variant="outline" className="mt-2" onClick={() => setShown(true)}>
        <MessagesSquare className="size-3.5" />
        Show the {count} reported message{count === 1 ? '' : 's'}
      </Button>
    );
  }
  return (
    <div className="mt-3 rounded-md border bg-muted/30 p-3">
      <p className="caption mb-2 flex items-center gap-1.5">
        <Lock className="size-3" />
        Copied when it was reported. This look is in the audit log.
      </p>
      {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {isError && (
        <button type="button" onClick={() => void refetch()} className="text-xs text-destructive hover:underline">
          Could not load them. Try again.
        </button>
      )}
      <ol className="space-y-2">
        {data?.messages.map((m) => (
          <li
            key={m.message_id}
            className={cn('flex', m.sender_role === 'reporter' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                m.sender_role === 'reporter' ? 'bg-primary/10' : 'border bg-card',
              )}
            >
              <p className="mb-0.5 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">{m.sender_name}</span>
                {m.sender_role === 'reporter' ? ' (who reported)' : ' (reported)'} ·{' '}
                <span title={new Date(m.sent_at).toLocaleString()}>{when(m.sent_at)}</span>
              </p>
              <p className="whitespace-pre-wrap wrap-anywhere">{m.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
