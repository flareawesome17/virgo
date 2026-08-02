'use client';

import { useState } from 'react';
import { Check, Loader2, UserPlus, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFriends } from '@/hooks/useFriends';
import {
  useEventAttendees,
  useInviteToEvent,
  useUninviteFromEvent,
} from '@/hooks/useScheduleEvents';
import type { AttendeeStatus } from '@/api';

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

const STATUS_LABEL: Record<AttendeeStatus, string> = {
  pending: 'Awaiting reply',
  accepted: 'Going',
  declined: 'Not going',
};

/**
 * Picks people to invite to an event.
 *
 * Only accepted friends are offered. That is the server's rule too — this list
 * exists so the constraint is visible rather than arriving as a rejection after
 * the user has already chosen somebody.
 */
export function InvitePeople({
  selected,
  onChange,
  /** Already invited; shown as such rather than offered again. */
  disabledIds = [],
  emptyHint = 'Add friends from the Network screen to invite them to events.',
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  disabledIds?: string[];
  emptyHint?: string;
}) {
  const { friends, isLoading } = useFriends({ status: 'accepted', limit: 100 });
  const invitable = friends.filter((f) => f.friend_user_id);

  if (isLoading) {
    return (
      <p className="text-xs text-muted-foreground">Loading your collaborators…</p>
    );
  }

  if (invitable.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyHint}</p>;
  }

  const toggle = (id: string) =>
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );

  return (
    <ScrollArea className="max-h-52">
      <div className="flex flex-col gap-1 pr-3">
        {invitable.map((friend) => {
          const id = friend.friend_user_id!;
          const already = disabledIds.includes(id);
          const isSelected = selected.includes(id);

          return (
            <button
              key={friend.id}
              type="button"
              disabled={already}
              onClick={() => toggle(id)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors',
                already
                  ? 'cursor-default opacity-50'
                  : isSelected
                    ? 'bg-primary/10'
                    : 'hover:bg-accent',
              )}
            >
              <Avatar className="size-8">
                <AvatarImage src={friend.friend_avatar_url ?? undefined} />
                <AvatarFallback className="text-[11px]">
                  {initials(friend.friend_name)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {friend.friend_name}
              </span>
              {already ? (
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  Invited
                </span>
              ) : (
                <span
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded-full border',
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border',
                  )}
                >
                  {isSelected && <Check className="size-3" />}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}

/**
 * The guest list for one event, with a way to add to it.
 *
 * Opened from an event the signed-in user organises. Someone attending sees
 * the same roster but has nothing to change, so the dialog is only reachable
 * from an event you own.
 */
export function ManageAttendeesDialog({
  eventId,
  eventTitle,
  open,
  onOpenChange,
}: {
  eventId: string;
  eventTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { attendees, isLoading } = useEventAttendees(open ? eventId : undefined);
  const invite = useInviteToEvent();
  const uninvite = useUninviteFromEvent();
  const [picked, setPicked] = useState<string[]>([]);

  const send = () => {
    if (picked.length === 0) return;
    invite.mutate(
      { eventId, userIds: picked },
      {
        onSuccess: ({ invited }) => {
          setPicked([]);
          toast.success(
            `Invited ${invited} ${invited === 1 ? 'person' : 'people'}`,
          );
        },
        onError: (err: Error) =>
          toast.error('Could not send the invitations', {
            description: err.message,
          }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Who is coming</DialogTitle>
          <DialogDescription className="truncate">{eventTitle}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : attendees.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nobody invited yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {attendees.map((person) => (
                <li
                  key={person.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5"
                >
                  <Avatar className="size-8">
                    <AvatarImage src={person.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[11px]">
                      {initials(person.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {person.name}
                  </span>
                  <Badge
                    variant={
                      person.status === 'accepted'
                        ? 'default'
                        : person.status === 'declined'
                          ? 'outline'
                          : 'secondary'
                    }
                    className="shrink-0"
                  >
                    {STATUS_LABEL[person.status]}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${person.name}`}
                    disabled={uninvite.isPending}
                    onClick={() =>
                      uninvite.mutate({ eventId, userId: person.user_id })
                    }
                  >
                    <X className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Invite more
            </p>
            <InvitePeople
              selected={picked}
              onChange={setPicked}
              disabledIds={attendees.map((a) => a.user_id)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
          <Button onClick={send} disabled={picked.length === 0 || invite.isPending}>
            {invite.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UserPlus className="size-4" />
            )}
            Send {picked.length > 0 ? `(${picked.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A compact "3 going" summary for an event card. */
export function AttendeeSummary({ eventId }: { eventId: string }) {
  const { attendees } = useEventAttendees(eventId);
  if (attendees.length === 0) return null;

  const going = attendees.filter((a) => a.status === 'accepted').length;
  const waiting = attendees.filter((a) => a.status === 'pending').length;

  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <Users className="size-3" />
      {going} going
      {waiting > 0 && ` · ${waiting} pending`}
    </span>
  );
}
