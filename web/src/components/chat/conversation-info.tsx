'use client';

import { useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  Check,
  Loader2,
  LogOut,
  Pencil,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  useAddConversationMember,
  useConversation,
  useDeleteConversation,
  useLeaveConversation,
  useMuteConversation,
  useParticipants,
  useRenameConversation,
} from '@/hooks/useChat';
import { useFriends } from '@/hooks/useFriends';
import { useAuth } from '@/hooks/useAuth';

/** Minutes. A year stands in for "until I turn it back on". */
const MUTE_OPTIONS = [
  { label: '1 hour', minutes: 60 },
  { label: '8 hours', minutes: 480 },
  { label: '1 week', minutes: 60 * 24 * 7 },
  { label: 'Until I turn it back on', minutes: 525_600 },
];

function mutedUntilLabel(iso: string | null): string {
  if (!iso) return '';
  const until = new Date(iso);
  const days = (until.getTime() - Date.now()) / 86_400_000;
  if (days > 300) return 'Muted';
  if (until.toDateString() === new Date().toDateString()) {
    return `Muted until ${until.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  }
  return `Muted until ${until.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`;
}

/**
 * Conversation info, as a side sheet.
 *
 * A sheet rather than a route: on a wide screen the thread stays visible
 * behind it, so muting or adding someone does not mean leaving the
 * conversation you are in the middle of.
 */
export function ConversationInfo({
  conversationId,
  open,
  onOpenChange,
  onLeft,
}: {
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the conversation is gone for this account. */
  onLeft: () => void;
}) {
  const { user } = useAuth();
  const { participants } = useParticipants(conversationId);
  const { conversation } = useConversation(conversationId);
  const { friends } = useFriends({ status: 'accepted', limit: 100 });

  const mute = useMuteConversation(conversationId);
  const rename = useRenameConversation(conversationId);
  const addMember = useAddConversationMember(conversationId);
  const leave = useLeaveConversation();
  const remove = useDeleteConversation();

  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [confirming, setConfirming] = useState<'leave' | 'delete' | null>(null);

  const isGroup = participants.length > 2 || !!conversation?.isGroup;
  const others = participants.filter((p) => p.id !== user?.id);
  const title = conversation?.title ?? (isGroup ? 'Group' : (others[0]?.name ?? 'Conversation'));
  const muted = !!conversation?.muted;

  const addable = useMemo(() => {
    const inside = new Set(participants.map((p) => p.id));
    return friends.filter((f) => f.friend_user_id && !inside.has(f.friend_user_id));
  }, [friends, participants]);

  const fail = (label: string) => (err: Error) =>
    toast.error(label, { description: err.message });

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full gap-0 sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>{isGroup ? 'Group info' : 'Contact info'}</SheetTitle>
            <SheetDescription className="sr-only">
              Members, notifications and how to leave this conversation.
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="min-h-0 flex-1">
            <div className="px-4 pb-6">
              {/* Identity */}
              <div className="flex flex-col items-center py-4 text-center">
                {isGroup ? (
                  <div className="grid size-20 place-items-center rounded-full bg-info/15">
                    <Users className="size-8 text-info" />
                  </div>
                ) : (
                  <Avatar className="size-20">
                    {others[0]?.avatar_url && <AvatarImage src={others[0].avatar_url} alt="" />}
                    <AvatarFallback className="bg-primary/15 text-2xl font-bold text-primary">
                      {title.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                )}

                {renaming ? (
                  <div className="mt-4 w-full">
                    <Input
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      placeholder="Group name"
                      autoFocus
                      className="text-center"
                    />
                    <div className="mt-3 flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => setRenaming(false)}>
                        Cancel
                      </Button>
                      <Button
                        className="flex-1"
                        disabled={!titleDraft.trim() || rename.isPending}
                        onClick={() =>
                          rename.mutate(titleDraft.trim(), {
                            onSuccess: () => setRenaming(false),
                            onError: fail('Could not rename'),
                          })
                        }
                      >
                        {rename.isPending && <Loader2 className="size-4 animate-spin" />}
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h3 className="mt-3 text-lg font-bold">{title}</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {isGroup
                        ? `${participants.length} member${participants.length === 1 ? '' : 's'}`
                        : (others[0]?.name ?? '')}
                    </p>
                    {isGroup && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        onClick={() => {
                          setTitleDraft(conversation?.title ?? '');
                          setRenaming(true);
                        }}
                      >
                        <Pencil className="size-3.5" />
                        Rename group
                      </Button>
                    )}
                  </>
                )}
              </div>

              <Separator className="my-4" />

              {/* Notifications */}
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Notifications
              </p>
              {muted ? (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  disabled={mute.isPending}
                  onClick={() =>
                    mute.mutate(0, { onError: fail('Could not unmute') })
                  }
                >
                  <BellOff className="size-4" />
                  <span className="flex-1 text-left">Unmute</span>
                  <span className="text-xs text-muted-foreground">
                    {mutedUntilLabel(conversation?.mutedUntil ?? null)}
                  </span>
                </Button>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-start" disabled={mute.isPending}>
                      <Bell className="size-4" />
                      Mute notifications
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    {MUTE_OPTIONS.map((option) => (
                      <DropdownMenuItem
                        key={option.minutes}
                        onSelect={() =>
                          mute.mutate(option.minutes, { onError: fail('Could not mute') })
                        }
                      >
                        {option.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <p className="mt-1.5 text-xs text-muted-foreground">
                Messages still arrive and still count as unread. They just will
                not interrupt.
              </p>

              <Separator className="my-4" />

              {/* Members */}
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {isGroup ? 'Members' : 'Contact'}
                </p>
                {isGroup && addable.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <UserPlus className="size-3.5" />
                        Add
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {addable.map((friend) => (
                        <DropdownMenuItem
                          key={friend.id}
                          onSelect={() =>
                            addMember.mutate(friend.friend_user_id!, {
                              onError: fail('Could not add'),
                            })
                          }
                        >
                          <Avatar className="size-5">
                            <AvatarFallback className="bg-primary/15 text-[9px] font-bold text-primary">
                              {friend.friend_name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          {friend.friend_name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              <ul className="flex flex-col gap-1">
                {participants.map((person) => (
                  <li key={person.id} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                    <Avatar className="size-8">
                      {person.avatar_url && <AvatarImage src={person.avatar_url} alt="" />}
                      <AvatarFallback className="bg-primary/15 text-[11px] font-bold text-primary">
                        {person.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex-1 truncate text-sm font-semibold">{person.name}</span>
                    {person.id === user?.id && (
                      <Badge variant="secondary" className="text-[10px]">
                        YOU
                      </Badge>
                    )}
                    {addMember.isPending && <Loader2 className="size-3.5 animate-spin" />}
                  </li>
                ))}
              </ul>

              <Separator className="my-4" />

              <div className="flex flex-col gap-2">
                {isGroup && (
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => setConfirming('leave')}
                  >
                    <LogOut className="size-4" />
                    Leave group
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="justify-start text-destructive hover:text-destructive"
                  onClick={() => setConfirming('delete')}
                >
                  <Trash2 className="size-4" />
                  Delete conversation
                </Button>
              </div>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirming !== null} onOpenChange={(o) => !o && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming === 'leave' ? 'Leave group' : 'Delete conversation'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === 'leave'
                ? 'You will stop receiving messages here. The conversation continues for everyone else.'
                : isGroup
                  ? 'This removes the conversation and its history from your account, and leaves the group.'
                  : 'This clears the conversation from your account. The other person keeps their copy, and a new message from them will start the thread again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const mutation = confirming === 'leave' ? leave : remove;
                mutation.mutate(conversationId, {
                  onSuccess: () => {
                    setConfirming(null);
                    onOpenChange(false);
                    onLeft();
                  },
                  onError: fail('Could not complete that'),
                });
              }}
            >
              <Check className="size-4" />
              {confirming === 'leave' ? 'Leave' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
