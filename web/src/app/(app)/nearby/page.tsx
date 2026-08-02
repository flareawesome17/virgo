'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MapPin, MessageCircle, ShieldCheck, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AppShell, PageHeader } from '@/components/app-shell';
import { CenteredSpinner, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  useLocationSharing,
  useNearbyPeople,
  useShareLocation,
  useStopSharingLocation,
} from '@/hooks/useNearby';
import { useFriends, useRespondToFriendRequest, useSendFriendRequest } from '@/hooks/useFriends';
import { useOpenDirectChat } from '@/hooks/useChat';
import type { NearbyPerson } from '@/api';

/** The API caps the radius at 200km. */
const RADII = [5, 25, 50, 100, 200];

export default function NearbyPage() {
  const router = useRouter();
  const [radiusKm, setRadiusKm] = useState(50);

  const { sharing, isLoading: loadingStatus } = useLocationSharing();
  const startSharing = useShareLocation();
  const stopSharing = useStopSharingLocation();
  const { people, isLoading } = useNearbyPeople(radiusKm);

  const sendRequest = useSendFriendRequest();
  const respond = useRespondToFriendRequest();
  const openDirect = useOpenDirectChat();

  // Accepting from here needs the friend row, which the nearby result does not
  // carry — only the account id. The incoming list maps one to the other.
  const { friends: incoming } = useFriends({
    status: 'pending',
    requested_by: 'them',
    limit: 50,
  });

  const fail = (label: string) => (err: Error) =>
    toast.error(label, { description: err.message });

  const toggleSharing = (next: boolean) => {
    const mutation = next ? startSharing : stopSharing;
    mutation.mutate(undefined as never, {
      onError: fail(next ? 'Could not turn on sharing' : 'Could not turn off sharing'),
    });
  };

  const suggested = people.filter((p) => p.relationship !== 'accepted');
  const friendsNearby = people.filter((p) => p.relationship === 'accepted');

  const renderPerson = (person: NearbyPerson) => (
    <li key={person.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
      <Avatar className="size-11 shrink-0">
        {person.avatarUrl && <AvatarImage src={person.avatarUrl} alt="" />}
        <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
          {person.name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{person.name}</p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3" />
          {person.distanceKm < 1 ? 'under 1 km away' : `${person.distanceKm} km away`}
        </p>
      </div>
      {person.relationship === 'accepted' ? (
        <Button
          size="sm"
          disabled={openDirect.isPending}
          onClick={() =>
            openDirect.mutate(person.id, {
              onSuccess: ({ id }) => router.push(`/chat/${id}`),
              onError: fail('Could not open chat'),
            })
          }
        >
          <MessageCircle className="size-3.5" />
          Message
        </Button>
      ) : person.relationship === 'pending_out' ? (
        <Badge variant="secondary">Requested</Badge>
      ) : person.relationship === 'pending_in' ? (
        <Button
          size="sm"
          onClick={() => {
            const match = incoming.find((f) => f.friend_user_id === person.id);
            if (match) respond.mutate({ id: match.id, accept: true });
          }}
        >
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
                    description: `${person.name} will see it in their network.`,
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
  );

  return (
    <AppShell title="Nearby">
      <PageHeader
        title="Nearby"
        description="Freelancers and collaborators around you"
      />

      <div className="mx-auto w-full max-w-3xl px-6 py-6">
        {/* Sharing opt-in */}
        <Card>
          <CardContent className="py-5">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'grid size-10 shrink-0 place-items-center rounded-lg',
                  sharing ? 'bg-success/15' : 'bg-muted',
                )}
              >
                <MapPin className={cn('size-4', sharing ? 'text-success' : 'text-muted-foreground')} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">Share my location</p>
                <p className="text-xs text-muted-foreground">
                  {sharing ? 'You are discoverable' : 'You are not discoverable'}
                </p>
              </div>
              {loadingStatus || startSharing.isPending || stopSharing.isPending ? (
                <Loader2 className="size-4 animate-spin text-primary" />
              ) : (
                <Switch checked={sharing} onCheckedChange={toggleSharing} />
              )}
            </div>

            <p className="mt-4 flex items-start gap-2 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              Others see only how far away you are, never where you are. Turning
              this off erases your stored location straight away.
            </p>
          </CardContent>
        </Card>

        {/* Radius */}
        <div className="mt-6">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Within
          </p>
          <div className="flex flex-wrap gap-2">
            {RADII.map((r) => (
              <Button
                key={r}
                size="sm"
                variant={r === radiusKm ? 'default' : 'outline'}
                onClick={() => setRadiusKm(r)}
              >
                {r} km
              </Button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="mt-6">
          {!sharing ? (
            <Card>
              <EmptyState
                icon={MapPin}
                title="Turn on sharing to see who is nearby"
                description="Discovery works both ways — only people who share their location can find each other."
              />
            </Card>
          ) : isLoading ? (
            <CenteredSpinner />
          ) : people.length === 0 ? (
            <Card>
              <EmptyState
                icon={MapPin}
                title={`Nobody within ${radiusKm} km`}
                description="Try a wider radius. Only people sharing their location appear here."
              />
            </Card>
          ) : (
            <div className="flex flex-col gap-6">
              {suggested.length > 0 && (
                <section>
                  <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Suggested collaborators
                  </h2>
                  <Card>
                    <CardContent className="p-0">
                      <ul>{suggested.map(renderPerson)}</ul>
                    </CardContent>
                  </Card>
                </section>
              )}
              {friendsNearby.length > 0 && (
                <section>
                  <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Friends nearby
                  </h2>
                  <Card>
                    <CardContent className="p-0">
                      <ul>{friendsNearby.map(renderPerson)}</ul>
                    </CardContent>
                  </Card>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
