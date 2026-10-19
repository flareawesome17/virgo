'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Clock, Loader2, MessageCircle, UserCheck, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
  useDeleteFriend,
  useRespondToFriendRequest,
  useSendFriendRequest,
} from '@/hooks/useFriends';
import { useOpenDirectChat } from '@/hooks/useChat';
import {
  ApiError,
  friendsApi,
  queryKeys,
  type ProfileView,
  type PublicProfile,
  type ViewerConnection,
} from '@/api';

/** What went wrong, in words, for an action on a person. */
function failure(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return "You're offline. Try again when you're connected.";
    if (err.status === 429) return "You've done this a lot in a short time. Try again later.";
    if (err.status === 400) return err.message;
    if (err.status === 404) return "We couldn't find that person. They may have left Virgo.";
  }
  return err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.';
}

/**
 * Where you stand with the person whose profile this is, as the thing to do
 * next: Connect, Requested (which takes it back), Ignore or Accept, or
 * Message once connected.
 *
 * Hire was the only button on every profile, whether or not the person was
 * taking bookings, and connecting meant going to People and searching for
 * them.
 */
export function ConnectionActions({
  person,
  cacheHandle,
  connection,
  friendId,
  onStale,
}: {
  person: ProfileView;
  /** The handle the profile is cached under, exactly as the route gave it. */
  cacheHandle: string;
  connection: ViewerConnection;
  friendId: string | null;
  /** Refetches the profile, for when it turns out to be out of date. */
  onStale: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const send = useSendFriendRequest();
  const respond = useRespondToFriendRequest();
  const remove = useDeleteFriend();
  const openDirect = useOpenDirectChat();
  const [opening, setOpening] = useState(false);
  const [askWithdraw, setAskWithdraw] = useState(false);
  const first = person.displayName.split(' ')[0] || person.displayName;

  // Written to the cached profile, so the button changes now rather than on
  // the refetch the mutation also starts.
  const writeViewer = (next: { connection: ViewerConnection; friendId: string | null }) =>
    queryClient.setQueryData<PublicProfile>(queryKeys.publicProfiles.detail(cacheHandle), (raw) =>
      raw ? { ...raw, viewer: { isSelf: false, ...raw.viewer, ...next } } : raw,
    );

  const connect = () =>
    send.mutate(
      { handle: person.handle },
      {
        onSuccess: (res) => writeViewer({ connection: 'pending_out', friendId: res.friend.id }),
        onError: (err) => {
          // A 400 means it changed elsewhere — already connected, or already
          // asked — so the page is simply out of date. Refreshing it says so
          // better than an error would.
          if (err instanceof ApiError && err.status === 400) {
            onStale();
            return;
          }
          if (err instanceof ApiError && err.status === 404) onStale();
          toast.error("Couldn't send the request", { description: failure(err) });
        },
      },
    );

  const answer = (accept: boolean) => {
    if (!friendId) return;
    respond.mutate(
      { id: friendId, accept },
      {
        onSuccess: () =>
          writeViewer(
            accept ? { connection: 'accepted', friendId } : { connection: 'none', friendId: null },
          ),
        onError: (err) => {
          onStale();
          toast.error(accept ? "Couldn't accept the request" : "Couldn't decline the request", {
            description: failure(err),
          });
        },
      },
    );
  };

  const withdraw = () => {
    if (!friendId) return;
    remove.mutate(friendId, {
      onSuccess: () => {
        writeViewer({ connection: 'none', friendId: null });
        setAskWithdraw(false);
      },
      onError: (err) => {
        onStale();
        setAskWithdraw(false);
        toast.error("Couldn't withdraw it", { description: failure(err) });
      },
    });
  };

  // The profile carries no account id, by design. The viewer's own friends
  // row does, and they are entitled to it — so the chat is opened from that.
  const message = async () => {
    if (!friendId || opening) return;
    setOpening(true);
    try {
      const row = await queryClient.fetchQuery({
        queryKey: queryKeys.friends.detail(friendId),
        queryFn: () => friendsApi.get(friendId),
      });
      if (!row.friend_user_id) throw new Error('This connection has no account to message.');
      const chat = await openDirect.mutateAsync(row.friend_user_id);
      router.push(`/chat/${chat.id}`);
    } catch (err) {
      // Most likely the connection went (removed, or a block) while this page
      // sat open. Refetching turns the button back into Connect, or the page
      // into not-found, instead of offering the same failing Message again.
      onStale();
      toast.error("Couldn't open the chat", { description: failure(err) });
    } finally {
      setOpening(false);
    }
  };

  if (connection === 'none') {
    return (
      <Button onClick={connect} disabled={send.isPending}>
        {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
        Connect
      </Button>
    );
  }

  if (connection === 'pending_out') {
    return (
      <>
        {/* "Requested" could not be clicked, so taking a request back meant
            finding it somewhere else. */}
        <Button
          variant="secondary"
          onClick={() => setAskWithdraw(true)}
          disabled={!friendId}
          title="Withdraw your request"
        >
          <Clock className="size-4" />
          Requested
        </Button>
        <AlertDialog open={askWithdraw} onOpenChange={setAskWithdraw}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Withdraw your request?</AlertDialogTitle>
              <AlertDialogDescription>
                {person.displayName} will no longer see it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={remove.isPending}
                onClick={(event) => {
                  event.preventDefault();
                  withdraw();
                }}
              >
                Withdraw
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  if (connection === 'pending_in') {
    // Accept had no Decline beside it, so the only way to say no was to find
    // the request on People.
    return (
      <>
        <Button
          variant="outline"
          onClick={() => answer(false)}
          disabled={respond.isPending || !friendId}
          aria-label={`Ignore ${first}'s connection request`}
        >
          Ignore
        </Button>
        <Button
          onClick={() => answer(true)}
          disabled={respond.isPending || !friendId}
          aria-label={`Accept ${first}'s connection request`}
        >
          {respond.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <UserCheck className="size-4" />
          )}
          Accept
        </Button>
      </>
    );
  }

  return (
    <>
      <Button onClick={() => void message()} disabled={opening || !friendId}>
        {opening ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}
        Message
      </Button>
      <span
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-success/15 px-3 text-sm font-semibold text-success"
        aria-label={`Connected with ${first}`}
      >
        <Check className="size-4" />
        Connected
      </span>
    </>
  );
}
