'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BriefcaseBusiness,
  Loader2,
  MapPin,
  MessageCircle,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AppShell, PageHeader } from '@/components/app-shell';
import { CenteredSpinner, EmptyState, ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  useLocationSharing,
  useNearbyPeople,
  useNearbyRoleCounts,
  useSetLocationPlace,
  useShareLocation,
  useStopSharingLocation,
} from '@/hooks/useNearby';
import { LocationField } from '@/components/location-field';
import { useScheduleEvents } from '@/hooks/useScheduleEvents';
import { isEventUpcoming } from '@/lib/calendar';
import { canonicalLocation, isKnownLocation } from '@/lib/ph-locations';
import { useFriends, useRespondToFriendRequest, useSendFriendRequest } from '@/hooks/useFriends';
import { useOpenDirectChat } from '@/hooks/useChat';
import { RolePicker } from '@/components/role-picker';
import type { NearbyPerson } from '@/api';

/** The API caps the radius at 200km. */
const RADII = [5, 25, 50, 100, 200];

export default function NearbyPage() {
  const router = useRouter();
  const [radiusKm, setRadiusKm] = useState(50);
  /** Empty means everyone; otherwise only people who do one of these. */
  const [roleFilter, setRoleFilter] = useState<string[]>([]);

  /**
   * What is in the "Near" box, and what is actually being searched.
   *
   * Two states, because they are not the same thing: the box holds whatever
   * has been typed, and only a value the app has coordinates for becomes a
   * search. Sending every keystroke would mean a request per letter, each one
   * refused by the server for naming a place that does not exist.
   *
   * Empty searches from the caller's own position, which is what it did before
   * this field existed.
   */
  const [placeInput, setPlaceInput] = useState('');
  /** Separate box, separate job: this one publishes a position. */
  const [myCityInput, setMyCityInput] = useState('');
  const searchPlace = isKnownLocation(placeInput)
    ? canonicalLocation(placeInput)
    : '';

  const { sharing, place: myPlace, isLoading: loadingStatus } = useLocationSharing();
  const startSharing = useShareLocation();
  const setPlace = useSetLocationPlace();
  const stopSharing = useStopSharingLocation();
  const { people, isLoading, loadFailed, refetch } = useNearbyPeople(
    radiusKm,
    roleFilter,
    searchPlace,
  );
  const { counts } = useNearbyRoleCounts(radiusKm, searchPlace);

  /** "within 50 km of Cebu City", or just "within 50 km" when it is you. */
  const near = searchPlace ? ` of ${searchPlace}` : '';

  /**
   * Your own upcoming shoots, as one-tap search centres.
   *
   * The question behind this screen is usually "who is free near my job", and
   * the job is already on your calendar with a place on it. Typing that place
   * again is work the app can do.
   *
   * Only events we can actually measure from. A shoot at "Shangri-La Mactan"
   * is a real event with no coordinates, and offering it would produce a chip
   * that answers with an error — the typed field below still handles it.
   */
  const { events } = useScheduleEvents({ limit: 100 });
  const eventShortcuts = useMemo(() => {
    const now = new Date();
    return events
      .filter(
        (e) =>
          e.location &&
          isKnownLocation(e.location) &&
          isEventUpcoming(e.event_date, e.event_time, now),
      )
      .sort((a, b) =>
        `${a.event_date}${a.event_time ?? ''}`.localeCompare(
          `${b.event_date}${b.event_time ?? ''}`,
        ),
      )
      .slice(0, 5);
  }, [events]);

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
        {/* Defaulted, not assumed present: a response cached before roles
            existed has no such field, and a missing badge list must not take
            the whole screen down with it. */}
        {(person.roles ?? []).length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {(person.roles ?? []).map((role) => (
              <Badge
                key={role}
                // The role you searched for is highlighted, so a person with
                // five roles still shows why they are in this list.
                variant={roleFilter.includes(role) ? 'default' : 'secondary'}
                className="px-1.5 py-0 text-[10px] font-medium"
              >
                {role}
              </Badge>
            ))}
          </div>
        )}
        {/* What turns Nearby from a list of names into a hiring tool: see the
            work before deciding whether to reach out. Only offered to people
            who have actually published — a handle alone would 404. */}
        {person.handle && (
          <Link
            href={`/u/${person.handle}`}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <BriefcaseBusiness className="size-3" />
            View profile
          </Link>
        )}
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
                  {sharing
                    ? myPlace
                      ? `Discoverable · ${myPlace}`
                      : 'Discoverable · from this device'
                    : 'You are not discoverable'}
                </p>
              </div>
              {loadingStatus ||
              startSharing.isPending ||
              stopSharing.isPending ||
              setPlace.isPending ? (
                <Loader2 className="size-4 animate-spin text-primary" />
              ) : (
                <Switch checked={sharing} onCheckedChange={toggleSharing} />
              )}
            </div>

            {/* The way in for anyone who will not grant the browser prompt —
                and on a desktop it is usually the better answer anyway, where
                the prompt is more intrusive and the fix less accurate than
                simply saying which city you work in. */}
            {!sharing && (
              <div className="mt-4 border-t pt-4">
                <p className="mb-2 text-xs text-muted-foreground">
                  Would rather not share a live position? Name your city instead —
                  it makes you findable to the same kilometre.
                </p>
                <LocationField
                  id="my-city"
                  value={myCityInput}
                  onChange={(next) => {
                    setMyCityInput(next);
                    if (!isKnownLocation(next)) return;
                    setPlace.mutate(canonicalLocation(next), {
                      onSuccess: () => setMyCityInput(''),
                      onError: fail('Could not set your city'),
                    });
                  }}
                  placeholder="Cebu City"
                />
              </div>
            )}

            <p className="mt-4 flex items-start gap-2 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              Others see only how far away you are, never where you are. Turning
              this off erases your stored location straight away.
            </p>
          </CardContent>
        </Card>

        {/* Where to look from. Only shown once sharing is on, because until
            then there is nothing to look at — discovery is reciprocal. */}
        {sharing && (
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Near
              </p>
              {searchPlace && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => setPlaceInput('')}
                >
                  Back to my location
                </Button>
              )}
            </div>
            {eventShortcuts.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {eventShortcuts.map((event) => {
                  // Compared canonically: the chip is on when the search is
                  // measuring from this event's place, however it got there.
                  const place = canonicalLocation(event.location ?? '');
                  return (
                    <Button
                      key={event.id}
                      size="sm"
                      variant={searchPlace === place ? 'default' : 'outline'}
                      className="h-auto py-1 text-xs font-normal"
                      onClick={() => setPlaceInput(place)}
                    >
                      <span className="font-semibold">{event.title}</span>
                      <span className="opacity-70">· {place}</span>
                    </Button>
                  );
                })}
              </div>
            )}
            <LocationField
              id="search-near"
              value={placeInput}
              onChange={setPlaceInput}
              placeholder={myPlace ?? 'Where you are'}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {searchPlace
                ? `Measuring from ${searchPlace}. This does not move you — you are still findable where you are.`
                : 'Searching from where you are. Type a city to look somewhere else.'}
            </p>
          </div>
        )}

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

        {/* Role filter — the point of the screen: "an SDE photo editor within
            30km", not "whoever happens to be around". */}
        {sharing && (
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Looking for
              </p>
              {roleFilter.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => setRoleFilter([])}
                >
                  Clear
                </Button>
              )}
            </div>
            <RolePicker
              selected={roleFilter}
              onChange={setRoleFilter}
              counts={counts}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {roleFilter.length === 0
                ? `Everyone within ${radiusKm} km${near}. Pick a role to narrow it down — the number is how many are in range.`
                : `Anyone who does ${roleFilter.join(' or ')}.`}
            </p>
          </div>
        )}

        {/* Results */}
        <div className="mt-6">
          {!sharing ? (
            <Card>
              <EmptyState
                icon={MapPin}
                title="Turn on sharing to see who is nearby"
                description="Discovery works both ways — only people who share their location can find each other. Use the switch above, or name your city if you would rather not share a live position."
              />
            </Card>
          ) : isLoading ? (
            <CenteredSpinner />
          ) : loadFailed ? (
            <Card>
              <ErrorState message="Could not look up who is nearby." onRetry={() => refetch()} />
            </Card>
          ) : people.length === 0 ? (
            <Card>
              <EmptyState
                icon={MapPin}
                title={
                  roleFilter.length > 0
                    ? `No ${roleFilter.join(' or ')} within ${radiusKm} km${near}`
                    : `Nobody within ${radiusKm} km${near}`
                }
                description={
                  roleFilter.length > 0
                    ? 'Try a wider radius, a different role, or another city. Only people sharing their location appear here.'
                    : 'Try a wider radius or another city. Only people sharing their location appear here.'
                }
                action={
                  roleFilter.length > 0 ? (
                    <Button size="sm" variant="outline" onClick={() => setRoleFilter([])}>
                      Clear the filter
                    </Button>
                  ) : searchPlace ? (
                    <Button size="sm" variant="outline" onClick={() => setPlaceInput('')}>
                      Back to my location
                    </Button>
                  ) : undefined
                }
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
