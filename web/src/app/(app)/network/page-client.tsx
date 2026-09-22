'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, MapPin, Search, UserPlus, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell, PageHeader } from '@/components/app-shell';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useDeleteFriend,
  useFriends,
  usePeopleSearch,
  useRespondToFriendRequest,
  useSendFriendRequest,
} from '@/hooks/useFriends';
import { useCollaborators } from '@/hooks/useCollaborators';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useHireEnquiries } from '@/hooks/useHire';
import { EnquiriesTab } from '@/components/enquiries';
import type { Collaborator } from '@/api';
import { ROLE_LABEL } from '@/lib/workspaces';

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

function NetworkPageBody() {
  const searchParams = useSearchParams();
  // Notifications and the "sent" toast both link to ?tab=enquiries, so the
  // landing tab comes from the URL rather than always being Friends.
  const [tab, setTab] = useState(
    searchParams.get('tab') === 'enquiries' ? 'enquiries' : 'friends',
  );
  const { pending: pendingEnquiries } = useHireEnquiries();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const { people, isFetching: searching } = usePeopleSearch(term);
  const sendRequest = useSendFriendRequest();
  const respond = useRespondToFriendRequest();
  const removeFriend = useDeleteFriend();

  const { friends: incoming } = useFriends({
    status: 'pending',
    requested_by: 'them',
    limit: 50,
  });
  const {
    friends,
    isLoading: loadingFriends,
    loadFailed: friendsFailed,
    refetch: refetchFriends,
  } = useFriends({
    status: 'accepted',
    limit: 100,
  });
  const { collaborators } = useCollaborators({ limit: 100 });
  // Archived ones too: the people in them are still yours to manage.
  const { workspaces } = useWorkspaces({ limit: 100, archived: 'include' });

  /**
   * Your collaborators under the workspace they are in, by its id. Grouped
   * by name, two workspaces called "Reyes Wedding" would have been merged.
   */
  const byWorkspace = useMemo(() => {
    const names = new Map(workspaces.map((w) => [w.id, w.name]));
    const groups = new Map<string, { name: string; people: Collaborator[] }>();
    for (const c of collaborators) {
      const group = groups.get(c.workspace_id) ?? {
        name: names.get(c.workspace_id) ?? 'Workspace',
        people: [],
      };
      group.people.push(c);
      groups.set(c.workspace_id, group);
    }
    return [...groups.entries()];
  }, [collaborators, workspaces]);
  const collaboratorCount = collaborators.filter((c) => c.status === 'accepted').length;

  const fail = (label: string) => (err: Error) =>
    toast.error(label, { description: err.message });

  const acceptFromSearch = (userId: string) => {
    const match = incoming.find((f) => f.friend_user_id === userId);
    if (!match) return;
    respond.mutate({ id: match.id, accept: true });
  };

  const showingSearch = term.length >= 2;

  return (
    <AppShell title="Network">
      <PageHeader
        title="Network"
        description={`${friends.length} friend${friends.length === 1 ? '' : 's'} · ${collaboratorCount} collaborator${collaboratorCount === 1 ? '' : 's'}`}
        actions={
          <Button asChild variant="outline">
            <Link href="/nearby">
              <MapPin className="size-4" />
              Nearby
            </Link>
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-4xl px-6 py-6">
        <div className="relative mb-5">
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

        {/* People search */}
        {showingSearch && (
          <section className="mb-8">
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              People
            </h2>
            <Card>
              <CardContent className="p-0">
                {searching ? (
                  <div className="py-8 text-center">
                    <Loader2 className="mx-auto size-5 animate-spin text-primary" />
                  </div>
                ) : people.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Nobody found. Search a name, or type their full email address.
                  </p>
                ) : (
                  <ul>
                    {people.map((person) => (
                      <li
                        key={person.id}
                        className="flex items-center gap-3 border-b px-4 py-3 last:border-0"
                      >
                        <PersonAvatar name={person.name} url={person.avatarUrl} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{person.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {person.email}
                          </p>
                        </div>
                        {person.relationship === 'accepted' ? (
                          <Badge className="bg-success/15 text-success">Friends</Badge>
                        ) : person.relationship === 'pending_out' ? (
                          <Badge variant="secondary">Requested</Badge>
                        ) : person.relationship === 'pending_in' ? (
                          <Button size="sm" onClick={() => acceptFromSearch(person.id)}>
                            Accept
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            disabled={sendRequest.isPending}
                            onClick={() =>
                              sendRequest.mutate(
                                { userId: person.id },
                                {
                                  onSuccess: () =>
                                    toast.success('Request sent', {
                                      description: 'They will see it in their network.',
                                    }),
                                  onError: fail('Could not send request'),
                                },
                              )
                            }
                          >
                            <UserPlus className="size-3.5" />
                            Add
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>
        )}

        {/* Friend requests need an answer here. Workspace invitations moved
            to the Workspaces page, next to the list they join. */}
        {incoming.length > 0 && !showingSearch && (
          <section className="mb-8 flex flex-col gap-4">
            {incoming.length > 0 && (
              <div>
                <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Friend requests
                </h2>
                <Card>
                  <CardContent className="p-0">
                    <ul>
                      {incoming.map((request) => (
                        <li
                          key={request.id}
                          className="flex items-center gap-3 border-b px-4 py-3 last:border-0"
                        >
                          <PersonAvatar
                            name={request.friend_name}
                            url={request.friend_avatar_url}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">
                              {request.friend_name}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {request.friend_email ?? 'wants to connect'}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => respond.mutate({ id: request.id, accept: false })}
                          >
                            Decline
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => respond.mutate({ id: request.id, accept: true })}
                          >
                            Accept
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            )}

          </section>
        )}

        {!showingSearch && (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="friends">Friends ({friends.length})</TabsTrigger>
              <TabsTrigger value="collaborators">
                Collaborators ({collaboratorCount})
              </TabsTrigger>
              <TabsTrigger value="enquiries">
                Enquiries
                {pendingEnquiries.length > 0 && (
                  <Badge className="ml-1.5 h-5 min-w-5 justify-center px-1 text-[11px]">
                    {pendingEnquiries.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="friends" className="mt-4">
              {loadingFriends && friends.length === 0 ? (
                <ListSkeleton rows={3} />
              ) : friendsFailed && friends.length === 0 ? (
                <ErrorState
                  message="Could not load your network."
                  onRetry={() => refetchFriends()}
                />
              ) : friends.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={UserPlus}
                    title="No friends yet"
                    description="Search for someone above to connect. You can only collaborate and chat with people you are friends with."
                  />
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <ul>
                      {friends.map((friend) => (
                        <li
                          key={friend.id}
                          className="flex items-center gap-3 border-b px-4 py-3 last:border-0"
                        >
                          <PersonAvatar
                            name={friend.friend_name}
                            url={friend.friend_avatar_url}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">
                              {friend.friend_name}
                            </p>
                            {friend.friend_email && (
                              <p className="truncate text-xs text-muted-foreground">
                                {friend.friend_email}
                              </p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              removeFriend.mutate(friend.id, {
                                onError: fail('Could not remove'),
                              })
                            }
                          >
                            Remove
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="collaborators" className="mt-4">
              {collaborators.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={Users}
                    title="No collaborators yet"
                    description="Invite a friend from inside a workspace to give them access to its albums."
                  />
                </Card>
              ) : (
                // Who can do what is managed inside each workspace now, beside
                // its albums; this is the way to find them.
                <div className="flex flex-col gap-4">
                  {byWorkspace.map(([workspaceId, group]) => (
                    <section key={workspaceId}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <h2 className="truncate text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                          {group.name}
                        </h2>
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/workspaces/${workspaceId}?tab=members`}>Manage access</Link>
                        </Button>
                      </div>
                      <Card>
                        <CardContent className="p-0">
                          <ul>
                            {group.people.map((collaborator) => (
                              <li
                                key={collaborator.id}
                                className="flex items-center gap-3 border-b px-4 py-3 last:border-0"
                              >
                                <PersonAvatar
                                  name={collaborator.name}
                                  url={collaborator.avatar_url}
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold">
                                    {collaborator.name}
                                  </p>
                                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                    <Badge variant="secondary" className="text-[10px]">
                                      {ROLE_LABEL[collaborator.role] ?? collaborator.role}
                                    </Badge>
                                    {collaborator.status !== 'accepted' && (
                                      <Badge variant="outline" className="text-[10px]">
                                        {collaborator.status === 'pending' ? 'Invited' : 'Declined'}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    </section>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="enquiries" className="mt-4">
              <EnquiriesTab />
            </TabsContent>
          </Tabs>
        )}
      </div>

    </AppShell>
  );
}

/**
 * Suspense is required, not decorative: useSearchParams (for ?tab=enquiries)
 * opts the tree into client rendering, and Next fails the build without a
 * boundary around it.
 */
export default function NetworkPage() {
  return (
    <Suspense fallback={null}>
      <NetworkPageBody />
    </Suspense>
  );
}
