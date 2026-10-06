'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BriefcaseBusiness,
  ChevronRight,
  Loader2,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Search,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useDeleteFriend,
  useFriendPresence,
  useFriends,
  usePeopleSearch,
  useRespondToFriendRequest,
  useSendFriendRequest,
} from '@/hooks/useFriends';
import { useOpenDirectChat } from '@/hooks/useChat';
import { useHireEnquiries } from '@/hooks/useHire';
import { EnquiryCard } from '@/components/enquiries';
import { PersonSafetyMenu, usePersonSafety } from '@/components/people/person-safety';
import { lastSeenLabel, usePresence } from '@/lib/presence-store';
import { ApiError, type Friend } from '@/api';

function PersonAvatar({ name, url }: { name: string; url?: string | null }) {
  return (
    <Avatar className="size-10 shrink-0">
      {url && <AvatarImage src={url} alt="" />}
      <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
        {name.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

function SectionTitle({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
        {count ? <span className="ml-1.5 font-normal tracking-normal">{count}</span> : null}
      </h2>
      {action}
    </div>
  );
}

/** Whether the tab is the one being looked at. */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  );
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}

/** What went wrong, in words, for an action on a person. */
function failure(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return "You're offline. Try again when you're connected.";
    if (err.status === 429) return "You've done this a lot in a short time. Try again later.";
    if (err.status === 400) return err.message;
    if (err.status === 404) return "We couldn't find that person. They may have left Virgo.";
  }
  return 'Something went wrong. Please try again.';
}

/** One connection: who they are, whether they are around, and a way to talk. */
function ConnectionRow({ friend, onRemove }: { friend: Friend; onRemove: () => void }) {
  const router = useRouter();
  const { online, lastSeenAt } = usePresence(friend.friend_user_id);
  const openDirect = useOpenDirectChat();
  // A friend added by name, with no account behind them, can never be online
  // or messaged — no dot and no button rather than ones that do nothing.
  const hasAccount = !!friend.friend_user_id;
  const handle = friend.friend_handle ?? null;

  const message = () => {
    if (!friend.friend_user_id || openDirect.isPending) return;
    openDirect.mutate(friend.friend_user_id, {
      onSuccess: ({ id }) => router.push(`/chat/${id}`),
      onError: (err) => toast.error("Couldn't open the chat", { description: failure(err) }),
    });
  };

  const who = (
    <>
      <span className="relative shrink-0">
        <PersonAvatar name={friend.friend_name} url={friend.friend_avatar_url} />
        {hasAccount && (
          <span
            aria-hidden
            className={
              online
                ? 'absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-success ring-2 ring-card'
                : 'absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-muted-foreground/40 ring-2 ring-card'
            }
          />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{friend.friend_name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {/* When they were last around, falling back to the address for
              somebody with no account to be around in. */}
          {hasAccount ? (online ? 'Active now' : lastSeenLabel(lastSeenAt)) : (friend.friend_email ?? '')}
        </span>
      </span>
    </>
  );

  return (
    <li className="flex items-center gap-2 border-b py-2.5 pl-4 pr-2 last:border-0">
      {handle ? (
        <Link
          href={`/u/${handle}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg hover:opacity-80"
        >
          {who}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{who}</div>
      )}
      {hasAccount && (
        <Button
          size="sm"
          variant="secondary"
          onClick={message}
          disabled={openDirect.isPending}
          aria-label={`Message ${friend.friend_name}`}
        >
          {openDirect.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <MessageCircle className="size-3.5" />
          )}
          Message
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" aria-label={`More options for ${friend.friend_name}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onSelect={onRemove}>
            <UserMinus className="size-4" />
            Remove connection
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/**
 * People: who is waiting on you, who you are waiting on, and who you know.
 *
 * It was a Friends tab, a Collaborators tab grouping people by workspace — who
 * can do what is managed inside each workspace now, beside its albums — and
 * hire enquiries behind a third tab with nothing pointing at them. Enquiries
 * and requests are paid work and people waiting on an answer, so they lead.
 */
export function PeopleTab() {
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const people = usePeopleSearch(term);
  const sendRequest = useSendFriendRequest();
  const respond = useRespondToFriendRequest();
  const removeFriend = useDeleteFriend();
  const hire = useHireEnquiries();
  // One for the requests and the enquiries both; each says which it came from.
  const safety = usePersonSafety('requests');

  // Requests addressed to me. `requested_by: 'them'` is the recipient's side
  // of the pair the server writes.
  const incoming = useFriends({ status: 'pending', requested_by: 'them', limit: 100 });
  // Requests I sent, so they can be taken back. They could not be before.
  const outgoing = useFriends({ status: 'pending', requested_by: 'me', limit: 100 });
  // Every connection, by name, with the presence store seeded for the dots.
  const connections = useFriendPresence();

  const [withdrawing, setWithdrawing] = useState<Friend | null>(null);
  const [removing, setRemoving] = useState<Friend | null>(null);

  const answer = (row: Friend, accept: boolean) =>
    respond.mutate(
      { id: row.id, accept },
      {
        onError: (err) =>
          toast.error(accept ? "Couldn't accept the request" : "Couldn't decline the request", {
            description: failure(err),
          }),
      },
    );

  const acceptFromSearch = (userId: string) => {
    const match = incoming.friends.find((f) => f.friend_user_id === userId);
    if (match) answer(match, true);
  };

  /*
   * No toast for a request that went: the button turning to "Requested" is
   * the answer. "They will see it in their network" named a screen the apps
   * no longer have.
   */
  const connect = (userId: string) =>
    sendRequest.mutate(
      { userId },
      {
        onError: (err) => {
          // A 400 is the relationship having moved on somewhere else —
          // already connected, already asked, or they asked first — so the
          // row is out of date rather than wrong. Refreshing it shows the
          // right button.
          if (err instanceof ApiError && err.status === 400) {
            void people.refetch();
            void incoming.refetch();
            return;
          }
          toast.error("Couldn't send the request", { description: failure(err) });
        },
      },
    );

  const confirmWithdraw = () => {
    if (!withdrawing) return;
    removeFriend.mutate(withdrawing.id, {
      onSuccess: () => setWithdrawing(null),
      onError: (err) => toast.error("Couldn't withdraw it", { description: failure(err) }),
    });
  };

  const confirmRemove = () => {
    if (!removing) return;
    removeFriend.mutate(removing.id, {
      onSuccess: () => setRemoving(null),
      onError: (err) => toast.error("Couldn't remove them", { description: failure(err) }),
    });
  };

  const showingSearch = term.length >= 2;
  // Nothing is said about a search that has not been run yet: "Nobody found"
  // flashed while the debounce settled.
  const settling = search.trim() !== term;
  const resultsPending = settling || people.isLoading;

  const pendingEnquiries = hire.pending;
  const otherEnquiries = hire.enquiries.length - pendingEnquiries.length;
  const connectionCount = connections.friends.length;


  return (
    <>
      <div>
        <div className="relative mb-6">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people by name, or type a full email address"
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

        {showingSearch ? (
          <section className="mb-8">
            <SectionTitle title="People on Virgo" />
            <Card>
              <CardContent className="p-0">
                {resultsPending && people.people.length === 0 ? (
                  <div className="py-8 text-center">
                    <Loader2 className="mx-auto size-5 animate-spin text-primary" />
                  </div>
                ) : people.loadFailed && people.people.length === 0 ? (
                  <div className="p-4">
                    <ErrorState message="Couldn't search right now." onRetry={() => people.refetch()} />
                  </div>
                ) : people.people.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Nobody found. Search a name, or type their full email address.
                  </p>
                ) : (
                  <ul>
                    {people.people.map((person) => {
                      const asked = sendRequest.variables;
                      const sending =
                        sendRequest.isPending &&
                        !!asked &&
                        'userId' in asked &&
                        asked.userId === person.id;
                      const outgoingRow = outgoing.friends.find(
                        (f) => f.friend_user_id === person.id,
                      );
                      return (
                        <li
                          key={person.id}
                          className="flex items-center gap-3 border-b px-4 py-3 last:border-0"
                        >
                          <PersonAvatar name={person.name} url={person.avatarUrl} />
                          <div className="min-w-0 flex-1">
                            {person.handle ? (
                              <Link
                                href={`/u/${person.handle}`}
                                className="block truncate text-sm font-semibold hover:underline"
                              >
                                {person.name}
                              </Link>
                            ) : (
                              <p className="truncate text-sm font-semibold">{person.name}</p>
                            )}
                            {/* The address only comes back when it was what you
                                searched for, so most rows show the handle, and
                                an unpublished account shows neither. */}
                            {(person.email || person.handle) && (
                              <p className="truncate text-xs text-muted-foreground">
                                {person.email || `@${person.handle}`}
                              </p>
                            )}
                          </div>
                          {person.relationship === 'accepted' ? (
                            <Badge className="bg-success/15 text-success">Connected</Badge>
                          ) : person.relationship === 'pending_out' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!outgoingRow}
                              onClick={() => outgoingRow && setWithdrawing(outgoingRow)}
                              aria-label={`Requested. Withdraw your request to ${person.name}`}
                            >
                              Requested
                            </Button>
                          ) : person.relationship === 'pending_in' ? (
                            <Button
                              size="sm"
                              onClick={() => acceptFromSearch(person.id)}
                              disabled={respond.isPending}
                            >
                              Accept
                            </Button>
                          ) : (
                            <Button size="sm" disabled={sending} onClick={() => connect(person.id)}>
                              {sending ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <UserPlus className="size-3.5" />
                              )}
                              Connect
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>
        ) : (
          <div className="flex flex-col gap-8">
            {/* Paid work waiting on you. It sat behind a tab with no count. */}
            {pendingEnquiries.length > 0 ? (
              <section>
                <SectionTitle
                  title="Hire enquiries"
                  count={pendingEnquiries.length}
                  action={
                    <Button asChild size="sm" variant="ghost">
                      <Link href="/people?tab=enquiries">See all</Link>
                    </Button>
                  }
                />
                <div className="flex flex-col gap-3">
                  {pendingEnquiries.map((enquiry) => (
                    <EnquiryCard key={enquiry.id} enquiry={enquiry} safety={safety} />
                  ))}
                </div>
              </section>
            ) : otherEnquiries > 0 ? (
              // Answered and sent ones still need a way in.
              <Link
                href="/people?tab=enquiries"
                className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm font-semibold hover:bg-accent/50"
              >
                <BriefcaseBusiness className="size-4 text-primary" />
                <span className="flex-1">Hire enquiries</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            ) : null}

            {incoming.friends.length > 0 && (
              <section>
                <SectionTitle title="Connection requests" count={incoming.friends.length} />
                <Card>
                  <CardContent className="p-0">
                    <ul>
                      {incoming.friends.map((request) => {
                        const busy = respond.isPending && respond.variables?.id === request.id;
                        return (
                          <li
                            key={request.id}
                            className="flex items-center gap-3 border-b px-4 py-3 last:border-0"
                          >
                            <PersonAvatar
                              name={request.friend_name}
                              url={request.friend_avatar_url}
                            />
                            <div className="min-w-0 flex-1">
                              {request.friend_handle ? (
                                <Link
                                  href={`/u/${request.friend_handle}`}
                                  className="block truncate text-sm font-semibold hover:underline"
                                >
                                  {request.friend_name}
                                </Link>
                              ) : (
                                <p className="truncate text-sm font-semibold">
                                  {request.friend_name}
                                </p>
                              )}
                              <p className="truncate text-xs text-muted-foreground">
                                Wants to connect
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => answer(request, false)}
                            >
                              Ignore
                            </Button>
                            <Button size="sm" disabled={busy} onClick={() => answer(request, true)}>
                              {busy && <Loader2 className="size-3.5 animate-spin" />}
                              Accept
                            </Button>
                            {/* Often the only trace of a stranger. A row with
                                no account id gets no menu. A block deletes the
                                request on both sides. */}
                            {request.friend_user_id && (
                              <PersonSafetyMenu
                                safety={safety}
                                className="-mr-2"
                                subject={{
                                  name: request.friend_name,
                                  target: { userId: request.friend_user_id },
                                }}
                              />
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                </Card>
              </section>
            )}

            {outgoing.friends.length > 0 && (
              <section>
                <SectionTitle title="Sent requests" count={outgoing.friends.length} />
                <Card>
                  <CardContent className="p-0">
                    <ul>
                      {outgoing.friends.map((row) => (
                        <li
                          key={row.id}
                          className="flex items-center gap-3 border-b px-4 py-3 last:border-0"
                        >
                          <PersonAvatar name={row.friend_name} url={row.friend_avatar_url} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{row.friend_name}</p>
                            <p className="text-xs text-muted-foreground">Waiting for them</p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setWithdrawing(row)}
                            aria-label={`Withdraw your request to ${row.friend_name}`}
                          >
                            Withdraw
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </section>
            )}

            <section>
              <SectionTitle title="Connections" count={connectionCount} />
              {connections.loading ? (
                <ListSkeleton rows={3} />
              ) : connections.loadFailed && connectionCount === 0 ? (
                <ErrorState
                  message="Could not load your connections."
                  onRetry={() => connections.refetch()}
                />
              ) : connectionCount === 0 ? (
                <Card>
                  <EmptyState
                    icon={UserPlus}
                    title="No connections yet"
                    description="Search for someone above, or see who works near you. You can chat and work with the people you're connected to."
                    action={
                      <Button asChild size="sm" variant="outline">
                        <Link href="/people?tab=nearby">
                          <MapPin className="size-4" />
                          Nearby
                        </Link>
                      </Button>
                    }
                  />
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <ul>
                      {connections.friends.map((friend) => (
                        <ConnectionRow
                          key={friend.id}
                          friend={friend}
                          onRemove={() => setRemoving(friend)}
                        />
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </section>
          </div>
        )}
      </div>

      <AlertDialog open={!!withdrawing} onOpenChange={(open) => !open && setWithdrawing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw your request?</AlertDialogTitle>
            <AlertDialogDescription>
              {withdrawing?.friend_name} will no longer see it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirmWithdraw();
              }}
              disabled={removeFriend.isPending}
              variant="destructive"
            >
              Withdraw
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.friend_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will no longer be one of your connections. They stay on any workspace you
              already added them to — remove them there separately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirmRemove();
              }}
              disabled={removeFriend.isPending}
              variant="destructive"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {safety.dialogs}
    </>
  );
}
