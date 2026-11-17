'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2, Quote, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useConversations, useForwardMessage } from '@/hooks/useChat';
import { MAX_FORWARD_TARGETS, type ConversationMessage } from '@/api';
import { chatProblem } from '@/components/chat/chat-errors';

/**
 * Forward, from a message's ⋯ (board 128): what is going, quoted; your
 * recent chats to tick, up to five; and a button that says how many.
 *
 * The chats are the list's own query, already loaded beside the thread, so
 * opening this asks the server for nothing. This chat is left out.
 */
export function ForwardDialog({
  conversationId,
  message,
  onOpenChange,
}: {
  conversationId: string;
  /** The message going; the dialog is open while there is one. */
  message: ConversationMessage | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const { conversations, loadingFirst, loadFailed, refetch } = useConversations();
  const forward = useForwardMessage(conversationId);

  const choices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter(
      (c) => c.id !== conversationId && (!q || c.title.toLowerCase().includes(q)),
    );
  }, [conversations, conversationId, search]);

  const close = () => {
    onOpenChange(false);
    setSearch('');
    setPicked([]);
  };

  const toggle = (id: string) =>
    setPicked((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : current.length >= MAX_FORWARD_TARGETS
          ? current
          : [...current, id],
    );

  const send = () => {
    if (!message || picked.length === 0) return;
    forward.mutate(
      { messageId: message.id, targets: picked },
      {
        onSuccess: ({ sent, skipped }) => {
          close();
          toast.success(`Forwarded to ${sent} chat${sent === 1 ? '' : 's'}`, {
            description:
              skipped > 0
                ? `${skipped} of them can't take new messages, so it didn't go there.`
                : undefined,
          });
        },
        onError: (err) => toast.error('Could not forward it', { description: chatProblem(err) }),
      },
    );
  };

  const full = picked.length >= MAX_FORWARD_TARGETS;

  return (
    <Dialog open={message !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="gap-3 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Forward to</DialogTitle>
          <DialogDescription className="sr-only">
            Pick up to {MAX_FORWARD_TARGETS} chats to send this message to.
          </DialogDescription>
        </DialogHeader>

        {message && (
          <div className="flex gap-2.5 rounded-xl bg-muted px-3 py-2.5">
            <Quote className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p className="line-clamp-3 whitespace-pre-wrap text-sm wrap-anywhere">{message.body}</p>
          </div>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="pl-9"
          />
        </div>

        <div className="flex items-baseline justify-between px-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {search.trim() ? 'Chats' : 'Recent'}
          </p>
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {picked.length}/{MAX_FORWARD_TARGETS}
          </p>
        </div>

        <ul className="-mx-1 flex max-h-72 flex-col gap-0.5 overflow-y-auto">
          {loadingFirst && choices.length === 0 ? (
            <li className="grid place-items-center py-6">
              <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />
            </li>
          ) : loadFailed && choices.length === 0 ? (
            <li className="py-6 text-center text-sm text-muted-foreground">
              Couldn&apos;t load your chats.{' '}
              <button type="button" className="underline" onClick={() => void refetch()}>
                Try again
              </button>
            </li>
          ) : choices.length === 0 ? (
            <li className="py-6 text-center text-sm text-muted-foreground">
              {search.trim() ? `No chats match “${search.trim()}”.` : 'No other chats yet.'}
            </li>
          ) : (
            choices.map((c) => {
              const on = picked.includes(c.id);
              const blocked = !on && full;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-disabled={blocked}
                    onClick={() => !blocked && toggle(c.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      on ? 'bg-accent' : 'hover:bg-accent/60',
                      blocked && 'cursor-not-allowed opacity-50 hover:bg-transparent',
                    )}
                  >
                    {c.isGroup ? (
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-info/15">
                        <Users className="size-4 text-info" />
                      </span>
                    ) : (
                      <Avatar className="size-9">
                        {c.avatarUrl && <AvatarImage src={c.avatarUrl} alt="" />}
                        <AvatarFallback className="bg-primary/15 text-[11px] font-bold text-primary">
                          {c.title.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold">{c.title}</span>
                      {c.isGroup && (
                        <span className="text-xs text-muted-foreground">
                          {c.participantCount} people
                        </span>
                      )}
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        'grid size-5 shrink-0 place-items-center rounded-full border',
                        on ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                      )}
                    >
                      {on && <Check className="size-3" />}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <DialogFooter className="items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">Sent as your own message, marked Forwarded</p>
          <Button onClick={send} disabled={picked.length === 0 || forward.isPending}>
            {forward.isPending && <Loader2 className="size-4 animate-spin" />}
            {picked.length === 0
              ? 'Send'
              : `Send to ${picked.length} chat${picked.length === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
