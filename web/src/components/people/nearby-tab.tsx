'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BriefcaseBusiness,
  ChevronRight,
  Loader2,
  MapPin,
  MessageCircle,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
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
  useShareLocation,
  useStopSharingLocation,
} from '@/hooks/useNearby';
import { useAuth } from '@/hooks/useAuth';
import { LocationField } from '@/components/location-field';
import { useScheduleEventRange } from '@/hooks/useScheduleEvents';
import { dateToKey, isEventUpcoming, todayKey } from '@/lib/calendar';
import { canonicalLocation, isKnownLocation } from '@/lib/ph-locations';
import { useFriends, useRespondToFriendRequest, useSendFriendRequest } from '@/hooks/useFriends';
import { useOpenDirectChat } from '@/hooks/useChat';
import { RolePicker } from '@/components/role-picker';
import type { NearbyPerson, NearbySource } from '@/api';
import { PersonSafetyMenu, usePersonSafety } from '@/components/people/person-safety';

/** The API caps the radius at 200km. */
const RADII = [5, 25, 50, 100, 200];

/**
 * Where somebody is, said as honestly as the server knows it.
 *
 * A city centre is the same point for everybody in that city, so "3 km away"
 * from one would be precise-looking and wrong: it says "In Cebu City", with
 * the rough distance only once they are in a different town. A device
 * position is a real distance, rounded to the kilometre.
 */
function whereLabel(person: NearbyPerson): string {
  if (person.approximate && person.place) {
    return person.distanceKm >= 1
      ? `In ${person.place} · about ${person.distanceKm} km`
      : `In ${person.place}`;
  }
  return person.distanceKm < 1 ? 'under 1 km away' : `${person.distanceKm} km away`;
}

/**
 * Collaborators near you.
 *
 * Everyone with an address is here at their city's centre, never their
 * street, unless they hide — and anyone can look, from their own city or one
 * they type. Sharing the browser's position is optional and only makes the
 * match closer.
 */
export function NearbyTab() {
  const router = useRouter();
  // A block refreshes the discover queries, and the server leaves the person
  // out of the next answer.
  const safety = usePersonSafety('nearby');
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
  const searchPlace = isKnownLocation(placeInput)
    ? canonicalLocation(placeInput)
    : '';

  const { profile } = useAuth();
  const {
    sharing,
    place: myPlace,
    source,
    hidden,
    addressPlace,
    exactLocation,
    exactLocationStale,
    updatedAt: myUpdatedAt,
    data: locationStatus,
    isLoading: loadingStatus,
    loadFailed: statusFailed,
    refetch: refetchStatus,
  } = useLocationSharing();
  // Never read, rather than read as nowhere: "You're not in Nearby" was the
  // wrong thing to tell somebody whose status simply failed to load.
  const statusUnknown = statusFailed && !locationStatus;
  // What places them. An older API sends no source, and there sharing was the
  // only way to be placed at all.
  const placedBy: NearbySource | null =
    source !== undefined ? source : sharing ? (myPlace ? 'place' : 'gps') : null;
  // A device position counts for 30 days; after that the address's city
  // takes over. The age shows, with a way to refresh it from 25 days on.
  // Measured from when the tab opened: render has to be pure, and an age in
  // whole days does not need a clock that ticks.
  const [openedAt] = useState(() => Date.now());
  const positionAgeDays =
    exactLocation && myUpdatedAt
      ? Math.floor((openedAt - new Date(myUpdatedAt).getTime()) / 86_400_000)
      : null;
  const positionExpired =
    exactLocationStale || (positionAgeDays !== null && positionAgeDays >= 30);
  const positionAgeing = positionAgeDays !== null && positionAgeDays >= 25;
  const startSharing = useShareLocation();
  const stopSharing = useStopSharingLocation();
  const {
    people,
    data: result,
    isLoading,
    loadFailed,
    refetch,
  } = useNearbyPeople(radiusKm, roleFilter, searchPlace);
  const { counts } = useNearbyRoleCounts(radiusKm, searchPlace);

  /*
   * Nowhere to measure from: no city in the address, nothing shared, nothing
   * typed. Read from the search itself; an older API says it with
   * `sharing: false` instead.
   */
  const nowhere =
    !!result &&
    !searchPlace &&
    (result.origin !== undefined ? result.origin === null : !result.sharing);
  /** An address on the profile whose city the server could not place. */
  const addressUnplaced = !!profile?.addressCity && profile.addressPlace === null;

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
  // The next 60 days, as Schedule's Upcoming reads them. The 100 oldest held
  // nothing upcoming at all for an account with a past behind it.
  const [soonWindow] = useState(() => {
    const end = new Date();
    end.setDate(end.getDate() + 60);
    return { from: todayKey(), to: dateToKey(end) };
  });
  const { events } = useScheduleEventRange(soonWindow.from, soonWindow.to);
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

  /** "Use my exact location": the browser's position, or back to the city. */
  const toggleExact = (next: boolean) => {
    const mutation = next ? startSharing : stopSharing;
    mutation.mutate(undefined as never, {
      onError: fail(
        next ? "Couldn't use your exact location" : "Couldn't stop using your exact location",
      ),
    });
  };

  /** One line on how you are placed, and one on what it means. */
  const placement: { title: string; detail: string } = statusUnknown
    ? { title: "Couldn't check how you're shown", detail: 'Check your connection and try again.' }
    : hidden
      ? {
          title: "You're hidden from Nearby",
          detail: 'Nobody sees you here. You can still look around.',
        }
      : placedBy === 'gps'
        ? {
            title: "You're shown at your exact location",
            detail:
              positionAgeDays !== null && positionAgeDays > 0
                ? `From this browser, ${positionAgeDays} ${positionAgeDays === 1 ? 'day' : 'days'} ago. Others see a distance, never a place.`
                : 'From this browser. Others see a distance, never a place.',
          }
        : placedBy === 'place'
          ? { title: `You're shown in ${myPlace}`, detail: 'The city you picked.' }
          : placedBy === 'address'
            ? {
                title: `You're shown in ${myPlace}`,
                detail: 'From the city in your address — never your street.',
              }
            : {
                title: "You're not in Nearby yet",
                detail: addressUnplaced
                  ? "We couldn't place the city in your address. Check its spelling in your profile."
                  : 'Add your city to your profile and you will appear here.',
              };

  const exactDetail = positionExpired
    ? 'Over 30 days old, so your city is used instead.'
    : exactLocation
      ? 'Kept to about a kilometre. Turning it off erases it straight away.'
      : placedBy === 'address' || placedBy === 'place'
        ? `Optional — a closer match than ${myPlace}.`
        : 'Optional — a closer match than a city.';

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
        {/* Wraps rather than truncates: on a phone-width row beside the
            buttons, "about 4 km" was the part that got cut. */}
        <p className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
          <MapPin className="mt-0.5 size-3 shrink-0" />
          <span>{whereLabel(person)}</span>
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
      {/* Nearby is where strangers meet, so every row carries the way out. */}
      <PersonSafetyMenu
        safety={safety}
        className="-mr-2"
        subject={{ name: person.name, target: { userId: person.id } }}
      />
    </li>
  );

  return (
    <div>
        {/* How you are placed. Being shown is the default — everyone with an
            address is here at their city — so this says where, offers the
            browser's position for a closer match, and points at the one
            place to hide. */}
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
                <p className="text-sm font-bold">{placement.title}</p>
                <p className="text-xs text-muted-foreground">{placement.detail}</p>
                {/* A city picked in an older version places them until they
                    say otherwise; this is the way back to the address. */}
                {placedBy === 'place' && addressPlace ? (
                  <Button
                    size="sm"
                    variant="link"
                    className="h-auto p-0 text-xs"
                    disabled={stopSharing.isPending}
                    onClick={() => toggleExact(false)}
                  >
                    Use {addressPlace} from my address instead
                  </Button>
                ) : placedBy === null && !statusUnknown && !loadingStatus ? (
                  <Button asChild size="sm" variant="link" className="h-auto p-0 text-xs">
                    <Link href="/settings/profile">
                      {addressUnplaced ? 'Check my address' : 'Add my city'}
                    </Link>
                  </Button>
                ) : null}
              </div>
              {loadingStatus ? (
                <Loader2 className="size-4 animate-spin text-primary" />
              ) : statusUnknown ? (
                <Button size="sm" variant="outline" onClick={() => void refetchStatus()}>
                  Try again
                </Button>
              ) : null}
            </div>

            {/* Optional, and only ever closer than the city. Not while the
                status is unknown: a switch drawn off would be a guess. */}
            {!statusUnknown && (
              <div className="mt-4 flex items-center gap-3 border-t pt-4">
                <div className="min-w-0 flex-1">
                  <label htmlFor="exact-location" className="text-sm font-semibold">
                    Use my exact location
                  </label>
                  <p className="text-xs text-muted-foreground">{exactDetail}</p>
                  {exactLocation && (positionAgeing || positionExpired) && (
                    <Button
                      size="sm"
                      variant="link"
                      className="h-auto p-0 text-xs"
                      disabled={startSharing.isPending}
                      onClick={() => toggleExact(true)}
                    >
                      {positionExpired ? 'Update my position' : 'Update it before it expires'}
                    </Button>
                  )}
                </div>
                {loadingStatus || startSharing.isPending || stopSharing.isPending ? (
                  <Loader2 className="size-4 animate-spin text-primary" />
                ) : (
                  <Switch
                    id="exact-location"
                    checked={exactLocation}
                    onCheckedChange={toggleExact}
                  />
                )}
              </div>
            )}

            <Link
              href="/settings"
              className="mt-4 flex items-start gap-2 border-t pt-4 text-xs leading-relaxed text-muted-foreground hover:text-foreground"
            >
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              <span className="flex-1">
                Others see your city, or how far away you are — never your
                street.{' '}
                <span className="font-semibold text-primary">
                  {hidden ? 'Show me again in Settings' : 'Hide me in Settings'}
                </span>
              </span>
              <ChevronRight className="mt-0.5 size-3.5 shrink-0" />
            </Link>
          </CardContent>
        </Card>

        {/* Where to look from. For everyone: somebody with no city of their
            own can still look around one. */}
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Near
            </p>
            {searchPlace && placedBy !== null && (
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
            placeholder={myPlace ?? (placedBy === 'gps' ? 'Where you are' : 'Cebu City')}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {searchPlace
              ? `Measuring from ${searchPlace}. This does not move you.`
              : placedBy === 'gps'
                ? 'Searching from where you are. Type a city to look somewhere else.'
                : placedBy !== null && myPlace
                  ? `Searching from ${myPlace}. Type a city to look somewhere else.`
                  : 'Type a city to look around it.'}
          </p>
        </div>

        {/* Radius. Only once there is somewhere to measure from, like the
            roles: until then there is nothing for it to narrow. */}
        {!nowhere && (
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
        )}

        {/* Role filter — the point of the screen: "an SDE photo editor within
            30km", not "whoever happens to be around". */}
        {!nowhere && (
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
          {nowhere ? (
            <Card>
              <EmptyState
                icon={MapPin}
                title={
                  addressUnplaced
                    ? "We couldn't place your city"
                    : "Add your city to see who's near you"
                }
                description={
                  addressUnplaced
                    ? 'Nearby measures from the city in your address. Check its spelling, and the province, in your profile.'
                    : 'Nearby measures from the city in your address — never your street. Or type a city above to look around it.'
                }
                action={
                  <Button asChild size="sm">
                    <Link href="/settings/profile">
                      {addressUnplaced ? 'Check my address' : 'Add my address'}
                    </Link>
                  </Button>
                }
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
                    ? 'Try a wider radius, a different role, or another city.'
                    : 'Try a wider radius or another city.'
                }
                action={
                  roleFilter.length > 0 ? (
                    <Button size="sm" variant="outline" onClick={() => setRoleFilter([])}>
                      Clear the filter
                    </Button>
                  ) : searchPlace && placedBy !== null ? (
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
      {safety.dialogs}
    </div>
  );
}
