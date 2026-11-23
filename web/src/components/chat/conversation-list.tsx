'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  BellOff,
  CheckCheck,
  MessageCircle,
  Pin,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { PresenceDot } from '@/components/presence';
import { ChatRowMenu } from '@/components/chat/chat-row-menu';
import { useConversations } from '@/hooks/useChat';
import { useAuth } from '@/hooks/useAuth';
import { typingLabel, useTypingIn } from '@/lib/presence-store';
import type { Conversation } from '@/api';

/** Unread by count, or marked unread by hand: either way it reads as unread. */
function looksUnread(conversation: Conversation): boolean {
  return conversation.unread > 0 || !!conversation.markedUnread;
}

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
        looksUnread(conversation) ? 'font-medium text-foreground' : 'text-muted-foreground',
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

/** A small heading over a run of rows: Pinned, All (board 148). */
function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * One chat in the list, with its ⋯.
 *
 * The menu shows on hover and on focus, and a right-click anywhere on the
 * row opens it too — the browser's own menu has nothing for a chat.
 */
function ConversationRow({
  conversation,
  active,
  showPin,
  pinnedCount,
  onDeleted,
}: {
  conversation: Conversation;
  active: boolean;
  /** A pin on the row itself, where there is no Pinned heading to say so. */
  showPin: boolean;
  pinnedCount?: number;
  onDeleted: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const unread = looksUnread(conversation);
  // A count says how many; a hand-made mark is a dot (board 126).
  const marked = !!conversation.markedUnread && conversation.unread === 0;

  return (
    <li
      className="group/row relative"
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen(true);
      }}
    >
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
              {conversation.avatarUrl && <AvatarImage src={conversation.avatarUrl} alt="" />}
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
            <span className={cn('truncate text-sm', unread ? 'font-bold' : 'font-semibold')}>
              {conversation.title}
            </span>
            {showPin && conversation.pinned && (
              <Pin className="size-3 shrink-0 text-muted-foreground" aria-label="Pinned" />
            )}
            {conversation.muted && <BellOff className="size-3 shrink-0 text-muted-foreground" />}
            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
              {whenLabel(conversation.lastAt)}
            </span>
          </div>

          <div className="mt-0.5 flex items-center gap-2">
            {/* Typing replaces the preview while it lasts — showing
                both would push the row's width around every time
                somebody started and stopped. */}
            <TypingOrPreview conversation={conversation} />
            <span className="sr-only">{conversation.lastMessage ?? 'No messages yet'}</span>
            {conversation.unread > 0 ? (
              <Badge className="ml-auto h-5 min-w-5 shrink-0 justify-center px-1.5 text-[10px] tabular-nums">
                {conversation.unread}
              </Badge>
            ) : marked ? (
              <span
                role="img"
                aria-label="Marked unread"
                className="ml-auto size-2.5 shrink-0 rounded-full bg-primary"
              />
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

      <ChatRowMenu
        conversation={conversation}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        pinnedCount={pinnedCount}
        onDeleted={onDeleted}
        className={cn(
          'absolute right-2 top-1/2 -translate-y-1/2',
          'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 data-[state=open]:opacity-100',
        )}
      />
    </li>
  );
}

export function ConversationList({
  activeId,
  onNewChat,
}: {
  activeId?: string;
  onNewChat: () => void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  /** The list, or the chats waiting in Archived. */
  const [showArchived, setShowArchived] = useState(false);

  // Debounced: the search runs on the server and scans message bodies, so it
  // should not fire once per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const {
    conversations,
    archivedCount,
    loadingFirst,
    loadFailed,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useConversations(showArchived ? undefined : term, { archived: showArchived });
  const searching = !showArchived && term.length > 0;

  // Pinned chats come first from the server, so they are all on the first
  // page and the count is whole — but only for the list itself.
  const whole = !searching && !showArchived;
  const pinned = whole ? conversations.filter((c) => c.pinned) : [];
  const rest = whole ? conversations.filter((c) => !c.pinned) : conversations;
  const sectioned = pinned.length > 0;

  const openArchived = () => {
    setSearch('');
    setTerm('');
    setShowArchived(true);
  };

  const row = (conversation: Conversation) => (
    <ConversationRow
      key={conversation.id}
      conversation={conversation}
      active={conversation.id === activeId}
      showPin={!sectioned}
      pinnedCount={whole ? pinned.length : undefined}
      onDeleted={() => {
        if (conversation.id === activeId) router.push('/chat');
      }}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
        {showArchived ? (
          <div className="-ml-2 flex min-w-0 items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowArchived(false)}
              aria-label="Back to chats"
            >
              <ArrowLeft className="size-4" />
            </Button>
            <h2 className="text-sm font-bold">Archived</h2>
          </div>
        ) : (
          <>
            <h2 className="text-sm font-bold">Chat</h2>
            <Button size="icon" variant="ghost" onClick={onNewChat} aria-label="New chat">
              <Plus className="size-4" />
            </Button>
          </>
        )}
      </div>

      {/* A search looks through archived chats too, so Archived has none of
          its own. */}
      {!showArchived && (
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
      )}

      {/* Radix wraps the content in a `display: table` box, which grows to a
          long preview's full width and pushed the time, the unread count and
          the ⋯ off the side of the column. A plain block keeps every row to
          the column's width so `truncate` can do its job. */}
      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
        {loadingFirst && conversations.length === 0 ? (
          <div className="p-3">
            <ListSkeleton rows={5} />
          </div>
        ) : loadFailed && conversations.length === 0 ? (
          <ErrorState message="Could not load your chats." onRetry={() => refetch()} />
        ) : conversations.length === 0 ? (
          showArchived ? (
            <EmptyState
              icon={Archive}
              title="Nothing archived"
              description="Archived chats wait here, and come back to the list when someone writes."
            />
          ) : (
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
          )
        ) : (
          <div className="px-2 pb-3">
            {sectioned && (
              <>
                <SectionLabel>Pinned</SectionLabel>
                <ul>{pinned.map(row)}</ul>
                {rest.length > 0 && <SectionLabel>All</SectionLabel>}
              </>
            )}
            <ul>
              {rest.map(row)}
              {/* The list was the newest hundred and stopped there: an older
                  chat could only be found by searching for it. */}
              {hasNextPage && (
                <li className="px-2 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground"
                    onClick={() => void fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage
                      ? 'Loading…'
                      : isFetchNextPageError
                        ? "Couldn't load more. Try again"
                        : 'Show older chats'}
                  </Button>
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Archived chats wait here, and come back when someone writes. */}
        {whole && archivedCount > 0 && (
          <div className="px-2 pb-3">
            <button
              type="button"
              onClick={openArchived}
              className="flex h-11 w-full items-center gap-2.5 rounded-lg px-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Archive className="size-4" />
              Archived · {archivedCount}
            </button>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
