'use client';

import { useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  Check,
  Mail,
  MailOpen,
  MoreHorizontal,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import {
  useDeleteConversation,
  useMarkThreadRead,
  useMuteConversation,
  useSetListState,
} from '@/hooks/useChat';
import { MAX_PINNED_CHATS, type Conversation } from '@/api';
import { MUTE_OPTIONS, deleteChatDescription } from '@/components/chat/conversation-info';
import { chatProblem, pinProblem } from '@/components/chat/chat-errors';

/**
 * A chat's ⋯ in the list, on hover, on focus and on right-click (boards 126
 * and 148): pin, read state, mute, archive, delete. Everything here changes
 * your own list only; the other people in the chat see none of it.
 */
export function ChatRowMenu({
  conversation,
  open,
  onOpenChange,
  pinnedCount,
  onDeleted,
  className,
}: {
  conversation: Conversation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How many are pinned, when the whole list is known; otherwise the server says. */
  pinnedCount?: number;
  /** After the chat is gone from your account. */
  onDeleted: () => void;
  className?: string;
}) {
  const listState = useSetListState();
  const mute = useMuteConversation(conversation.id);
  const markRead = useMarkThreadRead();
  const remove = useDeleteConversation();
  const [confirming, setConfirming] = useState(false);

  const id = conversation.id;
  const pinned = !!conversation.pinned;
  const archived = !!conversation.archived;
  const unread = conversation.unread > 0 || !!conversation.markedUnread;

  const togglePin = () => {
    if (!pinned && pinnedCount !== undefined && pinnedCount >= MAX_PINNED_CHATS) {
      toast.error('Could not pin it', {
        description: `You can pin up to ${MAX_PINNED_CHATS} chats. Unpin one to make room.`,
      });
      return;
    }
    listState
      .mutateAsync({ conversationId: id, patch: { pinned: !pinned } })
      .catch((err: unknown) =>
        toast.error(pinned ? 'Could not unpin it' : 'Could not pin it', {
          description: pinned ? chatProblem(err) : pinProblem(err),
        }),
      );
  };

  const toggleRead = () => {
    if (unread) {
      // Reading it is what clears both the count and the mark.
      markRead.mutate(id, {
        onError: (err) => toast.error('Could not mark it read', { description: chatProblem(err) }),
      });
      return;
    }
    listState
      .mutateAsync({ conversationId: id, patch: { markedUnread: true } })
      .catch((err: unknown) =>
        toast.error('Could not mark it unread', { description: chatProblem(err) }),
      );
  };

  /*
   * Through the promise, not mutate's callbacks: the row leaves the list the
   * moment it is archived, and callbacks given to mutate are dropped once the
   * component that called it is gone — the toast, and its Undo, with them.
   */
  const setArchived = (next: boolean) => {
    listState
      .mutateAsync({ conversationId: id, patch: { archived: next } })
      .then(() => {
        if (!next) return;
        toast('Chat archived', {
          description: 'It comes back when someone writes.',
          action: { label: 'Undo', onClick: () => setArchived(false) },
        });
      })
      .catch((err: unknown) =>
        toast.error(next ? 'Could not archive it' : 'Could not unarchive it', {
          description: chatProblem(err),
        }),
      );
  };

  const setMute = (minutes: number) =>
    mute.mutate(minutes, {
      onError: (err) =>
        toast.error(minutes ? 'Could not mute' : 'Could not unmute', {
          description: chatProblem(err),
        }),
    });

  return (
    <>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`More for ${conversation.title}`}
            title="More"
            className={cn(
              'grid size-7 place-items-center rounded-full border bg-popover text-muted-foreground shadow-sm transition-opacity hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              className,
            )}
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {/* From Archived too: pinning brings a chat back to the top. */}
          <DropdownMenuItem onSelect={togglePin}>
            {pinned ? <PinOff /> : <Pin />}
            {pinned ? 'Unpin' : 'Pin to top'}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={toggleRead}>
            {unread ? <MailOpen /> : <Mail />}
            {unread ? 'Mark as read' : 'Mark as unread'}
          </DropdownMenuItem>
          {conversation.muted ? (
            <DropdownMenuItem onSelect={() => setMute(0)}>
              <Bell />
              Unmute
            </DropdownMenuItem>
          ) : (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <BellOff />
                Mute
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                {MUTE_OPTIONS.map((option) => (
                  <DropdownMenuItem key={option.minutes} onSelect={() => setMute(option.minutes)}>
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuItem onSelect={() => setArchived(!archived)}>
            {archived ? <ArchiveRestore /> : <Archive />}
            {archived ? 'Unarchive' : 'Archive'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
            <Trash2 />
            Delete chat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteChatDescription(conversation.isGroup)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                remove
                  .mutateAsync(id)
                  .then(() => {
                    setConfirming(false);
                    onDeleted();
                  })
                  .catch((err: unknown) =>
                    toast.error('Could not complete that', { description: chatProblem(err) }),
                  );
              }}
            >
              <Check className="size-4" />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
