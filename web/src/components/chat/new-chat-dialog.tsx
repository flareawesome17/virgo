'use client';

import { useState } from 'react';
import { Check, Loader2, User, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCreateGroupChat, useOpenDirectChat } from '@/hooks/useChat';
import { useFriends } from '@/hooks/useFriends';

/**
 * Starts a chat.
 *
 * Direct and group share one dialog: the choice is only "one person or
 * several", and the friend list is identical. Only friends are listed — the
 * API rejects anyone else, so offering them would just produce an error.
 */
export function NewChatDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (conversationId: string) => void;
}) {
  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');

  const { friends, loadFailed, refetch } = useFriends({ status: 'accepted', limit: 100 });
  const openDirect = useOpenDirectChat();
  const createGroup = useCreateGroupChat();

  // Contacts predating real friendships have no account to chat with.
  const chattable = friends.filter((f) => f.friend_user_id);
  const busy = openDirect.isPending || createGroup.isPending;

  const reset = () => {
    setSelected([]);
    setTitle('');
    setMode('direct');
  };

  const toggle = (userId: string) => {
    if (mode === 'direct') {
      setSelected([userId]);
      return;
    }
    setSelected((prev) =>
      prev.includes(userId) ? prev.filter((x) => x !== userId) : [...prev, userId],
    );
  };

  const switchMode = (next: 'direct' | 'group') => {
    setMode(next);
    // A direct chat takes exactly one person, so a multi-selection cannot
    // carry over.
    setSelected((prev) => (next === 'direct' ? prev.slice(0, 1) : prev));
  };

  const start = () => {
    if (selected.length === 0) return;

    const done = ({ id }: { id: string }) => {
      onOpenChange(false);
      reset();
      onCreated(id);
    };
    const fail = (err: Error) =>
      toast.error('Could not start the chat', { description: err.message });

    if (mode === 'direct') {
      openDirect.mutate(selected[0], { onSuccess: done, onError: fail });
      return;
    }
    if (!title.trim()) {
      toast.error('Name the group', {
        description: 'Give it a name so people recognise it.',
      });
      return;
    }
    createGroup.mutate(
      { title: title.trim(), memberIds: selected },
      { onSuccess: done, onError: fail },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New chat</DialogTitle>
          <DialogDescription>
            You can only chat with people you are friends with.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => switchMode(v as 'direct' | 'group')}>
          <TabsList className="w-full">
            <TabsTrigger value="direct" className="flex-1">
              <User className="size-3.5" />
              One person
            </TabsTrigger>
            <TabsTrigger value="group" className="flex-1">
              <Users className="size-3.5" />
              Group
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === 'group' && (
          <div className="grid gap-2">
            <Label htmlFor="group-name">Group name</Label>
            <Input
              id="group-name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Reyes Wedding Team"
            />
          </div>
        )}

        {loadFailed && chattable.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Could not load your friends.{' '}
            <button type="button" className="underline" onClick={() => refetch()}>
              Try again
            </button>
          </p>
        ) : chattable.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No friends yet. Find people on the Network page first.
          </p>
        ) : (
          <ScrollArea className="max-h-64">
            <ul className="flex flex-col gap-1 pr-3">
              {chattable.map((friend) => {
                const on = selected.includes(friend.friend_user_id!);
                return (
                  <li key={friend.id}>
                    <button
                      onClick={() => toggle(friend.friend_user_id!)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors',
                        on ? 'bg-accent' : 'hover:bg-accent/60',
                      )}
                    >
                      <Avatar className="size-8">
                        <AvatarFallback className="bg-primary/15 text-[11px] font-bold text-primary">
                          {friend.friend_name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{friend.friend_name}</p>
                        {friend.friend_email && (
                          <p className="truncate text-xs text-muted-foreground">
                            {friend.friend_email}
                          </p>
                        )}
                      </div>
                      {on && (
                        <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                          <Check className="size-3" />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={start} disabled={selected.length === 0 || busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {mode === 'direct'
              ? 'Start chat'
              : `Create group${selected.length > 0 ? ` (${selected.length})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
