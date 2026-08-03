'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, useCallback } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  AtSign,
  Check,
  CheckCheck,
  Clock,
  Copy,
  Info,
  Reply,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CenteredSpinner, EmptyState } from '@/components/states';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useDeleteMessage,
  useMarkThreadRead,
  useParticipants,
  useSendMessage,
  useThread,
  setOpenConversation,
} from '@/hooks/useChat';
import { useAuth } from '@/hooks/useAuth';
import { PresenceDot, PresenceLine, TypingIndicator } from '@/components/presence';
import { sendTyping } from '@/lib/presence-store';
import { buzzForMessage } from '@/lib/alerts';
import type { ConversationMessage, Participant } from '@/api';

type Delivery = 'sending' | 'failed' | 'sent' | 'delivered' | 'read';

interface Outgoing {
  tempId: string;
  body: string;
  replyToId?: string;
  replyToBody?: string | null;
  replyToSender?: string | null;
  mentionIds: string[];
  status: 'sending' | 'failed';
}

type Row =
  | { kind: 'message'; message: ConversationMessage }
  | { kind: 'outgoing'; outgoing: Outgoing }
  | { kind: 'divider' };

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The tick, clock or warning next to your own message. */
function DeliveryMark({ state }: { state: Delivery }) {
  if (state === 'failed') return <AlertCircle className="size-3 text-destructive" />;
  if (state === 'sending') return <Clock className="size-3 opacity-60" />;
  if (state === 'sent') return <Check className="size-3 opacity-60" />;
  // Delivered and read differ by weight, not shape — the convention people
  // already read without a legend.
  return <CheckCheck className={cn('size-3', state === 'read' ? 'opacity-100' : 'opacity-60')} />;
}

export function Thread({
  conversationId,
  onBack,
  onOpenInfo,
}: {
  conversationId: string;
  /** Only shown on narrow windows, where the list and thread are separate views. */
  onBack?: () => void;
  onOpenInfo: () => void;
}) {
  const { user } = useAuth();
  const { messages, lastReadAt, isLoading } = useThread(conversationId);
  const { participants } = useParticipants(conversationId);
  const send = useSendMessage(conversationId);
  const remove = useDeleteMessage(conversationId);
  const markRead = useMarkThreadRead();

  const [draft, setDraft] = useState('');
  const [outbox, setOutbox] = useState<Outgoing[]>([]);
  const [replyTo, setReplyTo] = useState<ConversationMessage | null>(null);
  const [mentioned, setMentioned] = useState<Participant[]>([]);
  const nextTempId = useRef(0);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const meId = user?.id;

  /**
   * Whether we have already told the server this user is typing.
   *
   * A keystroke must not become a socket frame — a fast typist would send
   * dozens a second. One frame on the first character, one when they stop,
   * and a repeat only after the flag has been cleared.
   */
  const typingSent = useRef(false);
  const typingIdle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const stopTyping = useCallback(() => {
    clearTimeout(typingIdle.current);
    if (!typingSent.current) return;
    typingSent.current = false;
    sendTyping(conversationId, false);
  }, [conversationId]);

  const noteTyping = useCallback(
    (value: string) => {
      // An emptied box is not typing. Without this, clearing a draft would
      // leave the indicator running on the other side until it timed out.
      if (!value.trim()) {
        stopTyping();
        return;
      }
      if (!typingSent.current) {
        typingSent.current = true;
        sendTyping(conversationId, true);
      }
      // Falls quiet on its own if they stop without sending or blurring —
      // shorter than the receiver's 6s expiry, so the stop arrives first.
      clearTimeout(typingIdle.current);
      typingIdle.current = setTimeout(stopTyping, 3000);
    },
    [conversationId, stopTyping],
  );

  // Leaving the thread must not strand the indicator on everyone else's screen.
  useEffect(() => stopTyping, [stopTyping]);

  // Tells the app-wide alert watcher not to fire for this thread — it is on
  // screen, and this component alerts for itself on a shorter poll.
  useEffect(() => {
    setOpenConversation(conversationId);
    return () => setOpenConversation(null);
  }, [conversationId]);

  useEffect(() => {
    if (messages.length > 0) markRead.mutate(conversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, messages.length]);

  // Buzz on someone else's new message. Keyed on the newest id rather than the
  // count, so a refetch returning the same messages does not re-fire.
  const lastSeenId = useRef<string | null>(null);
  useEffect(() => {
    const newest = messages[0];
    if (!newest) return;
    const previous = lastSeenId.current;
    lastSeenId.current = newest.id;
    if (previous === null || newest.id === previous) return;
    if (newest.sender_id === user?.id) return;
    buzzForMessage();
  }, [messages, user?.id]);

  const others = useMemo(
    () => participants.filter((p) => p.id !== user?.id),
    [participants, user?.id],
  );
  const isGroup = participants.length > 2;
  const title = isGroup ? `${participants.length} people` : (others[0]?.name ?? 'Conversation');

  /**
   * Read beats delivered beats sent, each a comparison against one timestamp
   * per person. In a group the weakest link decides: only *delivered* once it
   * has reached everyone.
   */
  const deliveryOf = (sentAt: string): Delivery => {
    if (others.length === 0) return 'sent';
    const sent = new Date(sentAt).getTime();
    const at = (value: string | null) => (value ? new Date(value).getTime() : -1);
    if (others.every((p) => at(p.last_read_at) >= sent)) return 'read';
    if (others.every((p) => at(p.last_delivered_at) >= sent)) return 'delivered';
    return 'sent';
  };

  const readCount = (sentAt: string): number => {
    const sent = new Date(sentAt).getTime();
    return others.filter(
      (p) => p.last_read_at != null && new Date(p.last_read_at).getTime() >= sent,
    ).length;
  };

  // The partial @word at the end of the draft, if any.
  const mentionQuery = useMemo(() => {
    const match = /(?:^|\s)@([^\s@]*)$/.exec(draft);
    return match ? match[1] : null;
  }, [draft]);

  const mentionOptions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return others.filter((p) => p.name.toLowerCase().startsWith(q)).slice(0, 6);
  }, [mentionQuery, others]);

  const pickMention = (person: Participant) => {
    setDraft((current) => current.replace(/@[^\s@]*$/, `@${person.name} `));
    setMentioned((prev) => (prev.some((p) => p.id === person.id) ? prev : [...prev, person]));
    composerRef.current?.focus();
  };

  /** Highlights mentions by matching participant names, not stored offsets. */
  const renderBody = (body: string) => {
    const names = participants
      .map((p) => p.name)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    if (names.length === 0 || !body.includes('@')) return body;

    const pattern = new RegExp(`(@(?:${names.map(escapeForRegex).join('|')}))`, 'g');
    const isMention = new Set(names.map((n) => `@${n}`));
    return body.split(pattern).map((part, i) =>
      isMention.has(part) ? (
        <strong key={i} className="font-bold">
          {part}
        </strong>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  };

  const rows = useMemo<Row[]>(() => {
    const pending: Row[] = outbox
      .slice()
      .reverse()
      .map((outgoing) => ({ kind: 'outgoing', outgoing }));
    const base: Row[] = messages.map((message) => ({ kind: 'message', message }));
    if (!lastReadAt) return [...pending, ...base];

    const boundary = new Date(lastReadAt).getTime();
    let firstUnread = -1;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.sender_id !== user?.id && new Date(m.created_at).getTime() > boundary) {
        firstUnread = i;
      }
    }
    if (firstUnread === -1) return [...pending, ...base];

    return [
      ...pending,
      ...base.slice(0, firstUnread + 1),
      { kind: 'divider' },
      ...base.slice(firstUnread + 1),
    ];
  }, [messages, outbox, lastReadAt, user?.id]);

  const dispatch = (item: Outgoing) => {
    setOutbox((prev) =>
      prev.map((o) => (o.tempId === item.tempId ? { ...o, status: 'sending' } : o)),
    );
    send.mutate(
      { body: item.body, replyToId: item.replyToId, mentionIds: item.mentionIds },
      {
        onSuccess: () => setOutbox((prev) => prev.filter((o) => o.tempId !== item.tempId)),
        // Kept, not discarded: a failed send with the text thrown away is how
        // people lose messages they thought they had sent.
        onError: () =>
          setOutbox((prev) =>
            prev.map((o) => (o.tempId === item.tempId ? { ...o, status: 'failed' } : o)),
          ),
      },
    );
  };

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    const item: Outgoing = {
      tempId: `local-${(nextTempId.current += 1)}`,
      body,
      replyToId: replyTo?.id,
      replyToBody: replyTo?.body ?? null,
      replyToSender: replyTo?.sender_name ?? null,
      mentionIds: mentioned.filter((p) => body.includes(`@${p.name}`)).map((p) => p.id),
      status: 'sending',
    };
    setDraft('');
    setReplyTo(null);
    setMentioned([]);
    // Sending is the clearest possible "stopped typing".
    stopTyping();
    setOutbox((prev) => [...prev, item]);
    dispatch(item);
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOptions.length > 0 && event.key === 'Tab') {
      event.preventDefault();
      pickMention(mentionOptions[0]);
      return;
    }
    // Enter sends, Shift+Enter breaks the line — the convention every chat
    // client on a keyboard uses.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const deleteMessage = (message: ConversationMessage, scope: 'me' | 'everyone') => {
    remove.mutate(
      { messageId: message.id, scope },
      { onError: (err: Error) => toast.error('Could not delete', { description: err.message }) },
    );
  };

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        {onBack && (
          <Button size="icon" variant="ghost" onClick={onBack} aria-label="Back">
            <ArrowLeft className="size-4" />
          </Button>
        )}
        <button
          onClick={onOpenInfo}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 text-left hover:bg-accent/50"
        >
          {isGroup ? (
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-info/15">
              <Users className="size-4 text-info" />
            </div>
          ) : (
            <div className="relative shrink-0">
              <Avatar className="size-8">
                {others[0]?.avatar_url && <AvatarImage src={others[0].avatar_url} alt="" />}
                <AvatarFallback className="bg-primary/15 text-[11px] font-bold text-primary">
                  {(others[0]?.name ?? '?').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <PresenceDot userId={others[0]?.id} className="size-2.5" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{title}</p>
            <p className="truncate">
              {isGroup ? (
                <span className="text-xs text-muted-foreground">
                  {participants.map((p) => p.name).join(', ')}
                </span>
              ) : (
                // Online / last seen, kept current by the socket.
                <PresenceLine userId={others[0]?.id} />
              )}
            </p>
          </div>
        </button>
        <Button size="icon" variant="ghost" onClick={onOpenInfo} aria-label="Conversation info">
          <Info className="size-4" />
        </Button>
      </div>

      {/* Messages. Column-reverse keeps the newest pinned as items arrive,
          without a scroll call that fights someone reading history. */}
      {isLoading && messages.length === 0 ? (
        <CenteredSpinner className="flex-1" />
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col-reverse gap-2 p-4">
            {/* First child of a column-reverse list, so it sits visually at
                the bottom — below the newest message, where a typing bubble
                belongs. */}
            <TypingIndicator conversationId={conversationId} meId={meId} />

            {rows.length === 0 && (
              <EmptyState
                icon={Users}
                title="No messages yet"
                description="Say hello."
              />
            )}

            {rows.map((row, index) => {
              if (row.kind === 'divider') {
                return (
                  <div key={`divider-${index}`} className="flex items-center gap-3 py-1">
                    <span className="h-px flex-1 bg-primary/40" />
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
                      New messages
                    </span>
                    <span className="h-px flex-1 bg-primary/40" />
                  </div>
                );
              }

              if (row.kind === 'outgoing') {
                const o = row.outgoing;
                const failed = o.status === 'failed';
                return (
                  <div key={o.tempId} className="flex justify-end">
                    <div
                      className={cn(
                        'max-w-[75%] rounded-2xl bg-primary px-3.5 py-2.5 text-primary-foreground',
                        failed ? 'opacity-75' : 'opacity-85',
                      )}
                    >
                      {o.replyToBody != null && (
                        <div className="mb-1.5 rounded-lg border-l-2 border-white/60 bg-black/15 px-2 py-1.5">
                          <p className="text-[10px] font-bold opacity-80">{o.replyToSender}</p>
                          <p className="truncate text-[11px] opacity-70">{o.replyToBody}</p>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap text-sm">{o.body}</p>
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] opacity-70">
                        <span>{failed ? 'Not sent' : 'Sending…'}</span>
                        <DeliveryMark state={failed ? 'failed' : 'sending'} />
                        {failed && (
                          <>
                            <button
                              onClick={() => dispatch(o)}
                              className="font-bold underline underline-offset-2"
                            >
                              Retry
                            </button>
                            <button
                              onClick={() =>
                                setOutbox((prev) => prev.filter((x) => x.tempId !== o.tempId))
                              }
                              className="underline underline-offset-2"
                            >
                              Discard
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              const message = row.message;
              const mine = message.sender_id === user?.id;
              const deleted = !!message.deleted_at;

              if (deleted) {
                return (
                  <div key={message.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                    <div className="max-w-[75%] rounded-2xl bg-muted px-3.5 py-2.5">
                      <p className="text-sm italic text-muted-foreground">
                        {mine ? 'You deleted this message' : 'This message was deleted'}
                      </p>
                    </div>
                  </div>
                );
              }

              const state = mine ? deliveryOf(message.created_at) : 'sent';
              const seenBy = mine ? readCount(message.created_at) : 0;

              return (
                <div
                  key={message.id}
                  className={cn('group flex items-end gap-1.5', mine ? 'justify-end' : 'justify-start')}
                >
                  {/* Actions live on hover, which is what a pointer affords —
                      no long-press needed. */}
                  {mine && (
                    <MessageActions
                      message={message}
                      mine={mine}
                      onReply={() => setReplyTo(message)}
                      onDelete={deleteMessage}
                    />
                  )}

                  <div className="max-w-[75%]">
                    {isGroup && !mine && (
                      <p className="mb-0.5 ml-1 text-[11px] text-muted-foreground">
                        {message.sender_name}
                      </p>
                    )}
                    <div
                      className={cn(
                        'rounded-2xl px-3.5 py-2.5',
                        mine ? 'bg-primary text-primary-foreground' : 'bg-card border',
                      )}
                    >
                      {message.reply_to_id && (
                        <div
                          className={cn(
                            'mb-1.5 rounded-lg border-l-2 px-2 py-1.5',
                            mine ? 'border-white/60 bg-black/15' : 'border-primary bg-muted',
                          )}
                        >
                          <p
                            className={cn(
                              'text-[10px] font-bold',
                              mine ? 'opacity-80' : 'text-primary',
                            )}
                          >
                            {message.reply_to_sender ?? 'Message'}
                          </p>
                          <p className={cn('truncate text-[11px]', mine ? 'opacity-70' : 'text-muted-foreground')}>
                            {message.reply_to_deleted
                              ? 'Message deleted'
                              : (message.reply_to_body ?? 'Message unavailable')}
                          </p>
                        </div>
                      )}

                      <p className="whitespace-pre-wrap text-sm">{renderBody(message.body)}</p>

                      <div
                        className={cn(
                          'mt-1 flex items-center gap-1 text-[10px]',
                          mine ? 'opacity-70' : 'text-muted-foreground',
                        )}
                      >
                        <span>{timeLabel(message.created_at)}</span>
                        {mine && <DeliveryMark state={state} />}
                        {mine && isGroup && seenBy > 0 && others.length > 1 && <span>{seenBy}</span>}
                      </div>
                    </div>
                  </div>

                  {!mine && (
                    <MessageActions
                      message={message}
                      mine={mine}
                      onReply={() => setReplyTo(message)}
                      onDelete={deleteMessage}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {/* Mention picker */}
      {mentionOptions.length > 0 && (
        <div className="mx-4 mb-2 overflow-hidden rounded-xl border bg-popover shadow-lg">
          <p className="flex items-center gap-2 border-b px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            <AtSign className="size-3 text-primary" />
            Mention <span className="ml-auto font-normal normal-case tracking-normal">Tab to pick</span>
          </p>
          <ul className="max-h-48 overflow-y-auto">
            {mentionOptions.map((person, i) => (
              <li key={person.id}>
                <button
                  onClick={() => pickMention(person)}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-accent',
                    i === 0 && 'bg-accent/50',
                  )}
                >
                  <Avatar className="size-6">
                    <AvatarFallback className="bg-primary/15 text-[10px] font-bold text-primary">
                      {person.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {person.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Reply banner */}
      {replyTo && (
        <div className="mx-4 mb-2 flex items-center gap-3 rounded-xl border border-l-4 border-l-primary bg-card px-3 py-2">
          <Reply className="size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold text-primary">
              Replying to {replyTo.sender_name}
            </p>
            <p className="truncate text-xs text-muted-foreground">{replyTo.body}</p>
          </div>
          <Button size="icon" variant="ghost" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      {/* Composer */}
      <div className="flex shrink-0 items-end gap-2 border-t p-3">
        <Textarea
          ref={composerRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            noteTyping(e.target.value);
          }}
          // Leaving the box stops the indicator immediately, rather than
          // letting it time out on the other side.
          onBlur={stopTyping}
          onKeyDown={onComposerKeyDown}
          placeholder={isGroup ? 'Message — @ to mention, Enter to send' : 'Message — Enter to send'}
          rows={1}
          className="max-h-40 min-h-10 resize-none"
        />
        <Button onClick={submit} disabled={!draft.trim()} size="icon" aria-label="Send">
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/** Per-message actions, revealed on hover. */
function MessageActions({
  message,
  mine,
  onReply,
  onDelete,
}: {
  message: ConversationMessage;
  mine: boolean;
  onReply: () => void;
  onDelete: (message: ConversationMessage, scope: 'me' | 'everyone') => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Message actions"
          className="mb-1 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden>
            <circle cx="8" cy="3" r="1.4" />
            <circle cx="8" cy="8" r="1.4" />
            <circle cx="8" cy="13" r="1.4" />
          </svg>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={mine ? 'end' : 'start'}>
        <DropdownMenuItem onSelect={onReply}>
          <Reply className="size-4" />
          Reply
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            void navigator.clipboard.writeText(message.body);
            toast.success('Copied');
          }}
        >
          <Copy className="size-4" />
          Copy
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onDelete(message, 'me')}>
          <Trash2 className="size-4" />
          Delete for me
        </DropdownMenuItem>
        {mine && (
          <DropdownMenuItem variant="destructive" onSelect={() => onDelete(message, 'everyone')}>
            <Trash2 className="size-4" />
            Delete for everyone
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
