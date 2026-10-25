import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Switch,
  Linking,
  Platform,
} from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import * as Haptics from 'expo-haptics';
import { profileActionMessage } from '@/src/lib/profile-media';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ArrowLeftIcon,
  MapPinIcon,
  MessageCircleIcon,
  UserPlusIcon,
  ShieldCheckIcon,
  BriefcaseIcon,
  EllipsisIcon,
  ChevronRightIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { LocationField } from '@/components/LocationField';
import { canonicalLocation, isKnownLocation } from '@/src/lib/ph-locations';
import { isEventUpcoming } from '@/src/lib/calendar';
import {
  useAuth,
  useFriends,
  useLocationSharing,
  useNearbyPeople,
  useNearbyRoleCounts,
  useOpenDirectChat,
  useScheduleEvents,
  useRespondToFriendRequest,
  useSendFriendRequest,
  useShareLocation,
  useStopSharingLocation,
  useTheme,
} from '@/src/hooks';
import { RolePicker } from '@/components';
import type { NearbyPerson, NearbySource } from '@/src/api';
import { LoadFailed } from '@/components/LoadFailed';
import { PersonSafetySheet } from '@/components/PersonSafetySheet';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MapPinIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MessageCircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ShieldCheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(BriefcaseIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(EllipsisIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/** The API caps the radius at 200km. */
const RADII = [5, 25, 50, 100, 200];

/**
 * Where somebody is, said as honestly as the server knows it.
 *
 * A town's centre is the same point for everybody in that town, so "3 km
 * away" from one would be precise-looking and wrong: it says "In Ozamiz City,
 * Misamis Occidental", with a rough distance only once they are clearly
 * somewhere else. The server decides that: it sends 0 for anyone too close to
 * their point to measure, and never a figure finer than both positions allow.
 * Somebody whose town it has no centre for stands at the province's capital,
 * so inside the province they read as just their town.
 */
function whereLabel(person: NearbyPerson): string {
  if (person.approximate && person.place) {
    return person.distanceKm >= 1
      ? `In ${person.place} · about ${person.distanceKm} km`
      : `In ${person.place}`;
  }
  if (person.distanceKm < 1) return 'under 1 km away';
  return `${person.distanceKm} km away`;
}

/**
 * Collaborators near you.
 *
 * Everyone with an address is here at their city's centre, never their
 * street, unless they hide — and anyone can look, from their own city or one
 * they type. Sharing the device's position is optional and only makes the
 * match closer. Nobody's coordinates cross the wire — the server returns a
 * distance and a place name and nothing more.
 */
export default function NearbyScreen() {
  const { isDark } = useTheme();
  const [radiusKm, setRadiusKm] = useState(50);
  /** Empty means everyone; otherwise only people who do one of these. */
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  /** The person whose More menu is open. */
  const [safetyFor, setSafetyFor] = useState<NearbyPerson | null>(null);

  /**
   * What is in the "Near" box, and what is actually being searched.
   *
   * Two states, because they are not the same thing: the box holds whatever
   * has been typed, and only a value the app has coordinates for becomes a
   * search. Sending every keystroke would mean a request per letter, each one
   * refused by the server for naming a place that does not exist.
   */
  const [placeInput, setPlaceInput] = useState('');
  const searchPlace = isKnownLocation(placeInput)
    ? canonicalLocation(placeInput)
    : '';

  const { profile } = useAuth();
  const {
    sharing,
    place: myPlace,
    updatedAt: myUpdatedAt,
    source,
    precision: myPrecision,
    hidden,
    exactLocation,
    exactLocationStale,
    data: status,
    isLoading: loadingStatus,
    loadFailed: statusFailed,
    refetch: refetchStatus,
  } = useLocationSharing();
  // Never read, rather than read as nowhere: "You're not in Nearby" was the
  // wrong thing to tell somebody whose status simply failed to load.
  const statusUnknown = statusFailed && !status;
  /*
   * What places you. An older API sends no `source`, and there sharing was
   * the only way to be placed at all.
   */
  const placedBy: NearbySource | null =
    source !== undefined ? source : sharing ? (myPlace ? 'place' : 'gps') : null;
  /*
   * A device position stops counting after 30 days, and nothing used to say
   * so: people dropped off Nearby and never knew. Now the city in their
   * address takes over, and the age is shown with a way to refresh it from
   * 25 days on.
   */
  const positionAgeDays =
    exactLocation && myUpdatedAt
      ? Math.floor((Date.now() - new Date(myUpdatedAt).getTime()) / 86_400_000)
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
   * typed. Read from the search itself, which is the thing that failed to
   * have an origin; an older API says it with `sharing: false` instead.
   */
  const nowhere =
    !!result &&
    !searchPlace &&
    (result.origin !== undefined ? result.origin === null : !result.sharing);
  /** An address on the profile whose city the server could not place. */
  const addressUnplaced =
    !!profile?.addressCity && profile.addressPlace === null;

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

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchStatus()]);
    setRefreshing(false);
  };

  /** "Use my exact location": the device's position, or back to the city. */
  const toggleExact = (next: boolean) => {
    if (next) {
      startSharing.mutate(undefined, {
        onError: (err: any) =>
          Alert.alert(
            "Couldn't use your exact location",
            err?.message || 'Please try again.',
            err?.code === 'LOCATION_BLOCKED'
              ? [
                  { text: 'Not now', style: 'cancel' },
                  { text: 'Open Settings', onPress: () => void Linking.openSettings() },
                ]
              : undefined,
          ),
      });
      return;
    }
    stopSharing.mutate(undefined, {
      // Fixed copy: the server's text is written for the API, not for this
      // screen.
      onError: () =>
        Alert.alert(
          "Couldn't stop using your exact location",
          'Check your connection and try again.',
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
                ? `From this device, ${positionAgeDays} ${positionAgeDays === 1 ? 'day' : 'days'} ago. Others see a distance, never a place.`
                : 'From this device. Others see a distance, never a place.',
          }
        : placedBy === 'place'
          ? { title: `You're shown in ${myPlace}`, detail: 'The city you picked.' }
          : placedBy === 'address'
            ? {
                title: `You're shown in ${myPlace}`,
                detail:
                  myPrecision === 'province'
                    ? "From the town in your address — never your street. It isn't on our map yet, so distances are measured from your province's capital and are rough."
                    : 'From the city in your address — never your street.',
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

  /*
   * No alert when a request goes: the row turns to "Requested" once Nearby
   * refreshes, with a tap to say so. The alert named a "network" the app no
   * longer has, and People says Connect where this said Add.
   */
  const addFriend = (person: NearbyPerson) => {
    sendRequest.mutate(
      { userId: person.id },
      {
        onSuccess: () => {
          if (Platform.OS !== 'web') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          }
        },
        onError: (err) => Alert.alert("Couldn't send the request", profileActionMessage(err, 'connect')),
      },
    );
  };

  // Through the same handler as People: one answer at a time, and a failure
  // that says so. A double tap here sent it twice and a failure said nothing.
  const acceptFrom = (userId: string) => {
    if (respond.isPending) return;
    const match = incoming.find((f) => f.friend_user_id === userId);
    if (!match) return;
    respond.mutate(
      { id: match.id, accept: true },
      {
        onError: (err) =>
          Alert.alert("Couldn't accept the request", profileActionMessage(err, 'accept')),
      },
    );
  };

  const message = (person: NearbyPerson) => {
    openDirect.mutate(person.id, {
      onSuccess: ({ id }) => router.push(`/chat/${id}`),
      onError: (err) => Alert.alert("Couldn't open the chat", profileActionMessage(err, 'message')),
    });
  };

  // Two lists from one query: people you already know, and people you don't —
  // the second is the actual point of the screen.
  const friendsNearby = people.filter((p) => p.relationship === 'accepted');
  const suggested = people.filter((p) => p.relationship !== 'accepted');

  const renderPerson = (person: NearbyPerson, i: number, total: number) => (
    <View
      key={person.id}
      className="px-4 py-3 flex-row items-center gap-3"
      style={
        i < total - 1
          ? { borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' }
          : undefined
      }
    >
      {person.avatarUrl ? (
        <RemoteImage
          source={{ uri: person.avatarUrl }}
          style={{ width: 44, height: 44, borderRadius: 22 }}
        />
      ) : (
        <View
          className="w-11 h-11 rounded-full items-center justify-center"
          style={{ backgroundColor: '#B66A4018' }}
        >
          <Text style={{ color: '#B66A40', fontWeight: '700', fontSize: 16 }}>
            {person.name.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}

      <View className="flex-1 min-w-0">
        <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
          {person.name}
        </Text>
        {/* Two lines rather than one: beside the buttons on a narrow phone,
            "about 4 km" was the part that got cut. */}
        <View className="flex-row items-start gap-1 mt-0.5">
          <MapPinIcon size={11} className="text-muted-foreground mt-0.5" />
          <Text className="text-muted-foreground text-xs flex-1" numberOfLines={2}>
            {whereLabel(person)}
          </Text>
        </View>
        {/* Defaulted, not assumed present: a response cached before roles
            existed has no such field, and a missing badge list must not take
            the whole screen down with it. */}
        {(person.roles ?? []).length > 0 && (
          <View className="flex-row flex-wrap gap-1 mt-1.5">
            {(person.roles ?? []).map((role) => {
              // The role you searched for is highlighted, so somebody with
              // five roles still shows why they are in this list.
              const matched = roleFilter.includes(role);
              return (
                <View
                  key={role}
                  className={`px-1.5 py-0.5 rounded-md ${matched ? 'bg-action' : 'bg-primary/10'}`}
                >
                  <Text
                    className={`text-[11px] font-bold ${
                      matched ? 'text-action-foreground' : 'text-primary'
                    }`}
                  >
                    {role}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* What turns Nearby from a list of names into a hiring tool: see the
            work before deciding whether to reach out. Only offered to people
            who have actually published — a handle alone would 404. */}
        {person.handle && (
          <Pressable
            className="flex-row items-center gap-1 mt-0.5 min-h-[32px] self-start active:opacity-60"
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`View ${person.name}'s profile`}
            onPress={() => router.push(`/u/${person.handle}`)}
          >
            <BriefcaseIcon size={12} className="text-primary" />
            <Text className="text-primary text-xs font-semibold">View profile</Text>
          </Pressable>
        )}
      </View>

      {person.relationship === 'accepted' ? (
        <Pressable
          onPress={() => message(person)}
          disabled={openDirect.isPending}
          accessibilityRole="button"
          accessibilityLabel={`Message ${person.name}`}
          className="px-3 min-h-[44px] rounded-xl bg-action flex-row items-center gap-1.5 active:scale-[0.96]"
        >
          <MessageCircleIcon size={14} className="text-action-foreground" />
          <Text className="text-action-foreground text-xs font-bold">Message</Text>
        </Pressable>
      ) : person.relationship === 'pending_out' ? (
        <View className="px-3 min-h-[44px] justify-center rounded-xl bg-muted">
          <Text className="text-foreground text-xs font-bold">Requested</Text>
        </View>
      ) : person.relationship === 'pending_in' ? (
        <Pressable
          onPress={() => acceptFrom(person.id)}
          disabled={respond.isPending}
          accessibilityRole="button"
          accessibilityLabel={`Accept ${person.name}'s request`}
          className="px-4 min-h-[44px] justify-center rounded-xl bg-action active:scale-[0.96]"
          style={{ opacity: respond.isPending ? 0.6 : 1 }}
        >
          {respond.isPending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text className="text-action-foreground text-xs font-bold">Accept</Text>
          )}
        </Pressable>
      ) : (
        <Pressable
          onPress={() => addFriend(person)}
          disabled={sendRequest.isPending}
          accessibilityRole="button"
          accessibilityLabel={`Connect with ${person.name}`}
          className="px-3 min-h-[44px] rounded-xl bg-action flex-row items-center gap-1.5 active:scale-[0.96]"
        >
          <UserPlusIcon size={14} className="text-action-foreground" />
          <Text className="text-action-foreground text-xs font-bold">Connect</Text>
        </Pressable>
      )}

      {/* Nearby is where strangers meet, so every row carries the way out. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`More options for ${person.name}`}
        onPress={() => setSafetyFor(person)}
        className="w-11 h-11 -mr-2 items-center justify-center active:opacity-60"
      >
        <EllipsisIcon size={16} className="text-muted-foreground" />
      </Pressable>
    </View>
  );

  const cardShadow = {
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  } as const;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
        // A tap on a city suggestion picks it. Without this the first tap only
        // closed the keyboard, and the suggestion needed a second.
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={isDark ? '#C17745' : '#B66A40'}
          />
        }
      >
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable accessibilityRole="button" accessibilityLabel="Back"
            onPress={() => router.back()}
            className="w-11 h-11 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
          >
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-foreground text-[22px] font-bold tracking-tight">
              Nearby
            </Text>
            <Text className="text-muted-foreground text-sm mt-0.5">
              Freelancers and collaborators around you
            </Text>
          </View>
        </View>

        {/* How you are placed. Being shown is the default — everyone with an
            address is here at their city — so this says where, offers the
            device's position for a closer match, and points at the one place
            to hide. */}
        <View className="px-5 mt-4">
          <View className="bg-card rounded-2xl p-4" style={cardShadow}>
            <View className="flex-row items-center gap-3">
              <View
                className="w-10 h-10 rounded-xl items-center justify-center"
                style={{ backgroundColor: sharing ? '#6B8E4E18' : '#A8948920' }}
              >
                <MapPinIcon size={18} color={sharing ? '#6B8E4E' : '#8B7355'} />
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-foreground text-sm font-bold">{placement.title}</Text>
                <Text className="text-muted-foreground text-xs mt-0.5 leading-4">
                  {placement.detail}
                </Text>
                {/* A city picked in an older version places them until they
                    say otherwise; this is the way back to the address. */}
                {placedBy === 'place' && status?.addressPlace ? (
                  <Pressable
                    onPress={() => toggleExact(false)}
                    disabled={stopSharing.isPending}
                    accessibilityRole="button"
                    hitSlop={6}
                    className="mt-1.5 self-start"
                  >
                    <Text className="text-primary text-xs font-bold">
                      Use {status.addressPlace} from my address instead
                    </Text>
                  </Pressable>
                ) : placedBy === null && !statusUnknown && !loadingStatus ? (
                  <Pressable
                    onPress={() => router.push('/settings/profile')}
                    accessibilityRole="button"
                    hitSlop={6}
                    className="mt-1.5 self-start"
                  >
                    <Text className="text-primary text-xs font-bold">
                      {addressUnplaced ? 'Check my address' : 'Add my city'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              {loadingStatus ? (
                <ActivityIndicator size="small" color="#B66A40" />
              ) : statusUnknown ? (
                <Pressable
                  onPress={() => void refetchStatus()}
                  accessibilityRole="button"
                  className="min-h-[44px] px-2 justify-center active:opacity-60"
                >
                  <Text className="text-primary text-[13px] font-bold">Try again</Text>
                </Pressable>
              ) : null}
            </View>

            {/* Optional, and only ever closer than the city. Not while the
                status is unknown: a switch drawn off would be a guess. */}
            {!statusUnknown && (
              <View
                className="flex-row items-center gap-3 mt-3.5 pt-3.5"
                style={{ borderTopWidth: 1, borderTopColor: isDark ? '#2A2522' : '#F0E8E2' }}
              >
                <View className="flex-1 min-w-0">
                  <Text className="text-foreground text-sm font-semibold">
                    Use my exact location
                  </Text>
                  <Text className="text-muted-foreground text-xs mt-0.5 leading-4">
                    {exactDetail}
                  </Text>
                  {exactLocation && (positionAgeing || positionExpired) && (
                    <Pressable
                      onPress={() => toggleExact(true)}
                      disabled={startSharing.isPending}
                      accessibilityRole="button"
                      hitSlop={6}
                      className="mt-1.5 self-start"
                    >
                      <Text className="text-primary text-xs font-bold">
                        {positionExpired ? 'Update my position' : 'Update it before it expires'}
                      </Text>
                    </Pressable>
                  )}
                </View>
                {startSharing.isPending || stopSharing.isPending || loadingStatus ? (
                  <ActivityIndicator size="small" color="#B66A40" />
                ) : (
                  <Switch
                    value={exactLocation}
                    onValueChange={toggleExact}
                    accessibilityLabel="Use my exact location"
                    trackColor={{ false: isDark ? '#3A322C' : '#E5D9D1', true: '#B66A40' }}
                    thumbColor="#FFFFFF"
                  />
                )}
              </View>
            )}

            <Pressable
              onPress={() => router.push('/settings/privacy')}
              accessibilityRole="button"
              className="flex-row items-center gap-2 mt-3.5 pt-3.5 active:opacity-60"
              style={{ borderTopWidth: 1, borderTopColor: isDark ? '#2A2522' : '#F0E8E2' }}
            >
              <ShieldCheckIcon size={13} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-[11px] flex-1 leading-4">
                Others see your city, or how far away you are — never your
                street.{' '}
                <Text className="text-primary font-bold">
                  {hidden ? 'Show me again in Privacy' : 'Hide me in Privacy'}
                </Text>
              </Text>
              <ChevronRightIcon size={13} className="text-muted-foreground" />
            </Pressable>
          </View>
        </View>

        {/* Where to look from. For everyone: somebody with no city of their
            own can still look around one. */}
        <View className="px-5 mt-5">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] ml-1">
              Near
            </Text>
            {searchPlace && placedBy !== null ? (
              <Pressable onPress={() => setPlaceInput('')} className="active:opacity-60">
                <Text className="text-primary text-xs font-semibold">
                  Back to my location
                </Text>
              </Pressable>
            ) : null}
          </View>
          {eventShortcuts.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingBottom: 8 }}
            >
              {eventShortcuts.map((event) => {
                // Compared canonically: the chip is on when the search is
                // measuring from this event's place, however it got there.
                const place = canonicalLocation(event.location ?? '');
                const on = searchPlace === place;
                return (
                  <Pressable
                    key={event.id}
                    onPress={() => setPlaceInput(place)}
                    className={`px-3 py-2 rounded-2xl active:scale-[0.96] ${on ? 'bg-action' : 'bg-card'}`}
                    style={on ? undefined : cardShadow}
                  >
                    <Text
                      numberOfLines={1}
                      className={`text-xs font-bold ${on ? 'text-white' : 'text-foreground'}`}
                    >
                      {event.title}
                    </Text>
                    <Text
                      numberOfLines={1}
                      className={`text-[10px] ${on ? 'text-white/80' : 'text-muted-foreground'}`}
                    >
                      {place}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <LocationField
            value={placeInput}
            onChange={setPlaceInput}
            placeholder={myPlace ?? (placedBy === 'gps' ? 'Where you are' : 'Cebu City')}
          />
          <Text className="text-muted-foreground text-xs mt-2 ml-1 leading-4">
            {searchPlace
              ? `Measuring from ${searchPlace}. This does not move you.`
              : placedBy === 'gps'
                ? 'Searching from where you are. Type a city to look somewhere else.'
                : placedBy !== null && myPlace
                  ? `Searching from ${myPlace}. Type a city to look somewhere else.`
                  : 'Type a city to look around it.'}
          </Text>
        </View>

        {/* Radius. Only once there is somewhere to measure from, like the
            roles: until then there is nothing for it to narrow. */}
        {!nowhere && (
        <View className="px-5 mt-5">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
            Within
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {RADII.map((r) => {
              const on = r === radiusKm;
              return (
                <Pressable
                  key={r}
                  onPress={() => setRadiusKm(r)}
                  className={`px-4 py-2 rounded-full active:scale-[0.95] ${on ? 'bg-action' : 'bg-card'}`}
                  style={on ? undefined : cardShadow}
                >
                  <Text
                    className={`text-xs font-bold ${on ? 'text-white' : 'text-muted-foreground'}`}
                  >
                    {r} km
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
        )}

        {/* Role filter — the point of the screen: "an SDE photo editor within
            30km", not "whoever happens to be around". */}
        {!nowhere && (
          <View className="px-5 mt-5">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] ml-1">
                Looking for
              </Text>
              {roleFilter.length > 0 && (
                <Pressable
                  onPress={() => setRoleFilter([])}
                  className="active:opacity-60"
                >
                  <Text className="text-primary text-xs font-semibold">Clear</Text>
                </Pressable>
              )}
            </View>
            <RolePicker
              selected={roleFilter}
              onChange={setRoleFilter}
              counts={counts}
            />
            <Text className="text-muted-foreground text-xs mt-2 ml-1 leading-4">
              {roleFilter.length === 0
                ? `Everyone within ${radiusKm} km${near}. Pick a role to narrow it down — the number is how many are in range.`
                : `Anyone who does ${roleFilter.join(' or ')}.`}
            </Text>
          </View>
        )}

        {/* Results */}
        {nowhere ? (
          <View className="px-10 pt-14 items-center">
            <View className="w-16 h-16 rounded-full bg-muted items-center justify-center mb-4">
              <MapPinIcon size={26} className="text-muted-foreground" />
            </View>
            <Text className="text-foreground text-base font-bold text-center">
              {addressUnplaced
                ? "We couldn't place your city"
                : "Add your city to see who's near you"}
            </Text>
            <Text className="text-muted-foreground text-sm text-center mt-2 leading-5">
              {addressUnplaced
                ? 'Nearby measures from the city in your address. Check its spelling, and the province, in your profile.'
                : 'Nearby measures from the city in your address — never your street. Or type a city above to look around it.'}
            </Text>
            <Pressable
              onPress={() => router.push('/settings/profile')}
              accessibilityRole="button"
              className="mt-4 bg-action rounded-xl px-5 min-h-[44px] justify-center active:scale-[0.96]"
            >
              <Text className="text-action-foreground text-sm font-bold">
                {addressUnplaced ? 'Check my address' : 'Add my address'}
              </Text>
            </Pressable>
          </View>
        ) : isLoading ? (
          <View className="pt-14 items-center">
            <ActivityIndicator size="small" color="#B66A40" />
          </View>
        ) : loadFailed ? (
          <View className="pt-14">
            <LoadFailed what="who is nearby" onRetry={() => refetch()} compact />
          </View>
        ) : people.length === 0 ? (
          <View className="px-10 pt-14 items-center">
            <Text className="text-foreground text-base font-bold text-center">
              {roleFilter.length > 0
                ? `No ${roleFilter.join(' or ')} within ${radiusKm} km${near}`
                : `Nobody within ${radiusKm} km${near}`}
            </Text>
            <Text className="text-muted-foreground text-sm text-center mt-2 leading-5">
              {roleFilter.length > 0
                ? 'Try a wider radius, a different role, or another city.'
                : 'Try a wider radius or another city.'}
            </Text>
            {roleFilter.length > 0 && (
              <Pressable
                onPress={() => setRoleFilter([])}
                className="mt-4 bg-card rounded-xl px-5 py-2.5 active:scale-[0.96]"
                style={cardShadow}
              >
                <Text className="text-foreground text-sm font-semibold">
                  Clear the filter
                </Text>
              </Pressable>
            )}
          </View>
        ) : (
          <>
            {suggested.length > 0 && (
              <View className="px-5 mt-6">
                <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
                  Suggested collaborators
                </Text>
                <View className="bg-card rounded-2xl overflow-hidden" style={cardShadow}>
                  {suggested.map((p, i) => renderPerson(p, i, suggested.length))}
                </View>
              </View>
            )}

            {friendsNearby.length > 0 && (
              <View className="px-5 mt-6">
                <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
                  Connections nearby
                </Text>
                <View className="bg-card rounded-2xl overflow-hidden" style={cardShadow}>
                  {friendsNearby.map((p, i) => renderPerson(p, i, friendsNearby.length))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* One menu for every row. A block refreshes the discover queries, and
          the server leaves the person out of the next answer. */}
      <PersonSafetySheet
        visible={!!safetyFor}
        onClose={() => setSafetyFor(null)}
        name={safetyFor?.name ?? ''}
        target={safetyFor ? { userId: safetyFor.id } : null}
        source="nearby"
      />
    </SafeAreaView>
  );
}
