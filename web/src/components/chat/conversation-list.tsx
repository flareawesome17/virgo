'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BellOff, CheckCheck, MessageCircle, Plus, Search, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { PresenceDot } from '@/components/presence';
import { useConversations } from '@/hooks/useChat';
import { useAuth } from '@/hooks/useAuth';
import { typingLabel, useTypingIn } from '@/lib/presence-store';
import type { Conversation } from '@/api';

/**
 * The row's second line: who is typing, or the last message.
 *
 * One or the other, never both — showing typing *and* the preview would make
 * the row taller the moment somebody touched a key, and every row in the list
 * would jump as people came and went.
 *
 * Its own component so only this line re-renders when a keystroke arrives,
 * rather than the whole list.
 */
function TypingOrPreview({ conversation }: { conversation: Conversation }) {
  const { user } = useAuth();
  const names = useTypingIn(conversation.id, user?.id);

  if (names.length > 0) {
    return (
      <span className="truncate text-xs font-medium text-primary">
        {conversation.isGroup ? typingLabel(names) : 'typing…'}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'truncate text-xs',
        conversation.unread > 0 ? 'font-medium text-foreground' : 'text-muted-foreground',
      )}
    >
      {conversation.lastMessage
        ? conversation.isGroup && conversation.lastSender
          ? `${conversation.lastSender}: ${conversation.lastMessage}`
          : conversation.lastMessage
        : 'No messages yet'}
    </span>
  );
}

/** "now" / "14:05" / "Mon" / "3 Aug" — how recent decides the format. */
function whenLabel(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso);
  const mins = (Date.now() - then.getTime()) / 60000;
  if (mins < 1) return 'now';
  if (then.toDateString() === new Date().toDateString()) {
    return then.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  if (mins < 60 * 24 * 7) return then.toLocaleDateString('en-US', { weekday: 'short' });
  return then.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

export function ConversationList({
  activeId,
  onNewChat,
}: {
  activeId?: string;
  onNewChat: () => void;
}) {
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');

  // Debounced: the search runs on the server and scans message bodies, so it
  // should not fire once per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const { conversations, isLoading, loadFailed, refetch } = useConversations(term);
  const searching = term.length > 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
        <h2 className="text-sm font-bold">Chat</h2>
        <Button size="icon" variant="ghost" onClick={onNewChat} aria-label="New chat">
          <Plus className="size-4" />
        </Button>
      </div>

      <div className="shrink-0 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search names and messages"
            className="pl-9 pr-9"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {isLoading && conversations.length === 0 ? (
          <div className="p-3">
            <ListSkeleton rows={5} />
          </div>
        ) : loadFailed && conversations.length === 0 ? (
          <ErrorState message="Could not load your chats." onRetry={() => refetch()} />
        ) : conversations.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title={searching ? 'No matches' : 'No conversations'}
            description={
              searching
                ? `Nothing found for “${term}”.`
                : 'Start a chat with a friend, or create a group for a shoot.'
            }
            action={
              searching ? undefined : (
                <Button size="sm" onClick={onNewChat}>
                  New chat
                </Button>
              )
            }
          />
        ) : (
          <ul className="px-2 pb-3">
            {conversations.map((conversation) => {
              const active = conversation.id === activeId;
              return (
                <li key={conversation.id}>
                  <Link
                    href={`/chat/${conversation.id}`}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors',
                      active ? 'bg-accent' : 'hover:bg-accent/60',
                    )}
                  >
                    {conversation.isGroup ? (
                      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-info/15">
                        <Users className="size-4 text-info" />
                      </div>
                    ) : (
                      // `relative` so the presence dot can anchor to the avatar.
                      <div className="relative shrink-0">
                        <Avatar className="size-10">
                          {conversation.avatarUrl && (
                            <AvatarImage src={conversation.avatarUrl} alt="" />
                          )}
                          <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
                            {conversation.title.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <PresenceDot
                          userId={conversation.otherUserId}
                          // The row is tinted when active, so the ring has to
                          // match that surface or it looks like a hole.
                          ringClass={active ? 'ring-accent' : 'ring-background'}
                        />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            'truncate text-sm',
                            conversation.unread > 0 ? 'font-bold' : 'font-semibold',
                          )}
                        >
                          {conversation.title}
                        </span>
                        {conversation.muted && (
                          <BellOff className="size-3 shrink-0 text-muted-foreground" />
                        )}
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                          {whenLabel(conversation.lastAt)}
                        </span>
                      </div>

                      <div className="mt-0.5 flex items-center gap-2">
                        {/* Typing replaces the preview while it lasts — showing
                            both would push the row's width around every time
                            somebody started and stopped. */}
                        <TypingOrPreview conversation={conversation} />
                        <span className="sr-only">
                          {conversation.lastMessage ?? 'No messages yet'}
                        </span>
                        {conversation.unread > 0 ? (
                          <Badge className="ml-auto h-5 min-w-5 shrink-0 justify-center px-1.5 text-[10px] tabular-nums">
                            {conversation.unread}
                          </Badge>
                        ) : conversation.lastMessage ? (
                          <CheckCheck className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                        ) : null}
                      </div>

                      {conversation.matchSnippet && (
                        <p className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-primary">
                          <Search className="size-2.5 shrink-0" />
                          {conversation.matchSnippet}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
