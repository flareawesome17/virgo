import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { memo, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  SearchIcon,
  UserPlusIcon,
  MapPinIcon,
  EllipsisIcon,
  MessageCircleIcon,
  XIcon,
  BriefcaseIcon,
  CalendarIcon,
  BanknoteIcon,
  ChevronRightIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  useAnswerEnquiry,
  useDeleteFriend,
  useFriendPresence,
  useFriends,
  useHireEnquiries,
  useOpenDirectChat,
  usePeopleSearch,
  usePeopleUnseen,
  useRespondToFriendRequest,
  useSendFriendRequest,
  useTheme,
} from '@/src/hooks';
import { RemoteImage } from '@/components/RemoteImage';
import { LoadFailed } from '@/components/LoadFailed';
import { PersonSafetySheet } from '@/components/PersonSafetySheet';
import { useTabBottomInset } from '@/components/TabScreen';
import { lastSeenLabel, usePresence } from '@/src/lib/presence-store';
import { profileActionMessage } from '@/src/lib/profile-media';
import { ApiError, type Friend, type HireEnquiry, type PersonResult } from '@/src/api';
import { PALETTES } from '@/theme';

for (const Icon of [
  SearchIcon, UserPlusIcon, MapPinIcon, EllipsisIcon, MessageCircleIcon, XIcon,
  BriefcaseIcon, CalendarIcon, BanknoteIcon, ChevronRightIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * A value once it has stopped changing for `ms`.
 *
 * For the people search: every keystroke was a request, and typing a name at
 * speed hit the rate limit, which came back as a search error.
 */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

const tap = () => {
  if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
};

/**
 * Whether a name matches what was typed: the start of the name, of any word
 * in it, or of the handle with its @ left off.
 */
function nameMatches(q: string, name: string, handle?: string | null): boolean {
  const needle = q.trim().replace(/^@+/, '').toLowerCase();
  if (!needle) return false;
  const lower = name.toLowerCase();
  if (lower.startsWith(needle) || lower.split(/\s+/).some((w) => w.startsWith(needle))) return true;
  return !!handle && handle.toLowerCase().startsWith(needle);
}

/** "Sat, Nov 14" — a job date is a day, and the year is usually noise. */
function readableDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const thisYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(thisYear ? {} : { year: 'numeric' as const }),
  });
}

function Avatar({ url, name, size = 44 }: { url?: string | null; name: string; size?: number }) {
  if (url) {
    return <RemoteImage source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View
      className="rounded-full items-center justify-center bg-primary/10"
      style={{ width: size, height: size }}
    >
      <Text className="text-primary font-bold" style={{ fontSize: size * 0.38 }}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

function SectionTitle({ title, count, action }: { title: string; count?: number; action?: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between mb-2 ml-1 min-h-[28px]">
      <Text accessibilityRole="header" className="text-foreground text-[13px] font-semibold">
        {title}
        {count ? <Text className="text-muted-foreground font-normal">{`  ${count}`}</Text> : null}
      </Text>
      {action}
    </View>
  );
}

/**
 * Connect › People.
 *
 * Who is waiting on you — hire enquiries and connection requests — then the
 * requests you are waiting on, then everyone you are connected to, by name.
 * Searching looks through your own connections first and the rest of Virgo
 * after them.
 *
 * Collaborators by workspace used to fill the rest of this screen: every
 * member of every workspace, one person as many times as they had
 * workspaces, with Access and Remove. Each workspace's Members tab is where
 * that is managed, and it is still there.
 */
export function PeopleView() {
  const bottomInset = useTabBottomInset();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;

  const sendRequest = useSendFriendRequest();
  const respond = useRespondToFriendRequest();
  const removeFriend = useDeleteFriend();
  const unseen = usePeopleUnseen();

  // Requests addressed to me. `requested_by: 'them'` is the recipient's side of
  // the pair the server writes.
  const incoming = useFriends({ status: 'pending', requested_by: 'them', limit: 100 });
  // Requests I sent, so they can be taken back.
  const outgoing = useFriends({ status: 'pending', requested_by: 'me', limit: 100 });
  const hire = useHireEnquiries();
  /*
   * useFriendPresence, not useFriends: it seeds the presence store from the
   * snapshot, which is what puts a live dot on each row. Every connection, by
   * name.
   */
  const connections = useFriendPresence();

  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const settledSearch = useSettled(search, 300);
  const term = search.trim();
  const searching = term.length >= 2;
  const people = usePeopleSearch(settledSearch);
  /** The incoming request whose More menu is open. */
  const [safetyFor, setSafetyFor] = useState<Friend | null>(null);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      incoming.refetch(),
      outgoing.refetch(),
      connections.refetch(),
      hire.refetch(),
      unseen.refetch(),
      ...(searching ? [people.refetch()] : []),
    ]);
    setRefreshing(false);
  };

  // ── Actions ───────────────────────────────────────────────────────────────

  const withdraw = (row: Friend) =>
    Alert.alert('Withdraw your request?', `${row.friend_name} will no longer see it.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: () =>
          removeFriend.mutate(row.id, {
            onError: (err) => Alert.alert("Couldn't withdraw it", profileActionMessage(err, 'withdraw')),
          }),
      },
    ]);

  /**
   * Accepting or declining, once. The row leaves the list as soon as it is
   * answered (useRespondToFriendRequest), so it cannot be answered twice.
   */
  const answer = (row: Friend, accept: boolean) =>
    respond.mutate(
      { id: row.id, accept },
      {
        onSuccess: () => {
          if (accept) tap();
        },
        onError: (err) =>
          Alert.alert(
            accept ? "Couldn't accept the request" : "Couldn't decline the request",
            profileActionMessage(err, accept ? 'accept' : 'decline'),
          ),
      },
    );

  /*
   * No alert for a request that went: the button turning to "Requested" with
   * a tap is the answer. "They will see it in their network" named a screen
   * the app no longer has.
   */
  const connect = (userId: string) =>
    sendRequest.mutate(
      { userId },
      {
        onSuccess: tap,
        onError: (err) => {
          // A 400 is the relationship having moved on somewhere else — already
          // connected, already asked, or they asked first — so the row is out
          // of date rather than wrong. Refreshing it shows the right button.
          if (err instanceof ApiError && err.status === 400) {
            void people.refetch();
            void incoming.refetch();
            return;
          }
          Alert.alert("Couldn't send the request", profileActionMessage(err, 'connect'));
        },
      },
    );

  const confirmRemoveFriend = (row: Friend) =>
    Alert.alert(
      `Remove ${row.friend_name}?`,
      // Says what survives: removing a connection does not take them off the
      // workspaces they were already added to.
      'They will no longer be one of your connections. They stay on any workspace you already added them to — remove them there separately.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            removeFriend.mutate(row.id, {
              onError: (err) =>
                Alert.alert("Couldn't remove them", profileActionMessage(err, 'unfriend')),
            }),
        },
      ],
    );

  // ── Search ────────────────────────────────────────────────────────────────

  /** Your own connections that match, first, by name. */
  const connectionMatches = useMemo(
    () =>
      searching
        ? connections.friends.filter((f) => nameMatches(term, f.friend_name, f.friend_handle))
        : [],
    [searching, connections.friends, term],
  );
  const shownAccountIds = useMemo(
    () => new Set(connectionMatches.map((f) => f.friend_user_id).filter(Boolean) as string[]),
    [connectionMatches],
  );
  const results = useMemo(
    () => people.people.filter((p) => !shownAccountIds.has(p.id)),
    [people.people, shownAccountIds],
  );
  // Nothing is said about a search that has not been run yet. "Nobody found"
  // flashed while the debounce settled, and any refresh in the background
  // collapsed results that were already on screen into a spinner.
  const settling = term !== settledSearch.trim();
  const resultsPending = settling || people.isLoading;

  const pendingEnquiries = hire.pending;
  const otherEnquiries = hire.enquiries.length - pendingEnquiries.length;
  const border = palette.border;

  return (
    <View className="flex-1">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
        }
      >
        {/* Search, and Nearby beside it: the other way in to people you do
            not know by name yet. Only here, on People — it sat over Messages
            too, unlabelled. */}
        <View className="px-5 pt-3 pb-3 flex-row items-center gap-3">
          <View className="flex-1 flex-row items-center bg-secondary rounded-xl px-4 h-12 gap-3">
            <SearchIcon size={16} className="text-muted-foreground" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search people"
              placeholderTextColor={palette.mutedForeground}
              accessibilityLabel="Search people"
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              className="text-foreground text-sm flex-1"
            />
            {search.length > 0 && (
              <Pressable
                onPress={() => setSearch('')}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                className="w-11 h-11 -mr-3 items-center justify-center"
              >
                <XIcon size={15} className="text-muted-foreground" />
              </Pressable>
            )}
          </View>
          <Pressable
            onPress={() => router.push('/discover/nearby')}
            accessibilityRole="button"
            accessibilityLabel="Find people nearby"
            className="h-12 px-3.5 rounded-xl bg-secondary flex-row items-center gap-1.5 active:opacity-70"
          >
            <MapPinIcon size={16} className="text-primary" />
            <Text className="text-primary text-[13px] font-bold">Nearby</Text>
          </Pressable>
        </View>

        {searching ? (
          <>
            {connectionMatches.length > 0 && (
              <View className="px-5 pb-4">
                <SectionTitle title="Your connections" />
                <View className="bg-card rounded-2xl overflow-hidden border border-border/30">
                  {connectionMatches.map((f, i) => (
                    <FriendRow
                      key={f.id}
                      friend={f}
                      borderColor={border}
                      cardColor={palette.card}
                      last={i === connectionMatches.length - 1}
                      onMore={() => confirmRemoveFriend(f)}
                    />
                  ))}
                </View>
              </View>
            )}

            <View className="px-5 pb-4">
              <SectionTitle title="People on Virgo" />
              <View className="bg-card rounded-2xl overflow-hidden border border-border/30">
                {resultsPending && results.length === 0 ? (
                  <View className="px-4 py-5 items-center">
                    <ActivityIndicator size="small" color={palette.primary} />
                  </View>
                ) : people.loadFailed && results.length === 0 ? (
                  <LoadFailed what="the search results" onRetry={() => people.refetch()} compact />
                ) : results.length === 0 ? (
                  <Text className="text-muted-foreground text-sm text-center py-5 px-4">
                    {connectionMatches.length > 0
                      ? 'Nobody else by that name.'
                      : 'Nobody found. Try a first name, a surname, an @handle, or their full email address.'}
                  </Text>
                ) : (
                  results.map((p, i) => (
                    <PersonRow
                      key={p.id}
                      person={p}
                      last={i === results.length - 1}
                      borderColor={border}
                      connecting={sendRequest.isPending && sendRequest.variables && 'userId' in sendRequest.variables && sendRequest.variables.userId === p.id}
                      onConnect={() => connect(p.id)}
                      onWithdraw={() => {
                        const row = outgoing.friends.find((f) => f.friend_user_id === p.id);
                        if (row) withdraw(row);
                      }}
                      incomingRow={incoming.friends.find((f) => f.friend_user_id === p.id) ?? null}
                      onAccept={(row) => answer(row, true)}
                      accepting={respond.isPending}
                    />
                  ))
                )}
              </View>
            </View>
          </>
        ) : (
          <>
            {/* Paid work waiting on you. It lived under Settings, with no
                count anywhere, and was found only through its push. */}
            {pendingEnquiries.length > 0 ? (
              <View className="px-5 pb-4">
                <SectionTitle
                  title="Hire enquiries"
                  count={pendingEnquiries.length}
                  action={
                    <Pressable
                      onPress={() => router.push('/friends/enquiries')}
                      accessibilityRole="button"
                      className="min-h-[44px] -my-2 px-2 justify-center active:opacity-60"
                    >
                      <Text className="text-primary text-xs font-bold">See all</Text>
                    </Pressable>
                  }
                />
                <View className="gap-2.5">
                  {pendingEnquiries.map((e) => (
                    <EnquiryCard key={e.id} enquiry={e} />
                  ))}
                </View>
              </View>
            ) : otherEnquiries > 0 ? (
              // Answered and sent ones still need a way in.
              <View className="px-5 pb-4">
                <Pressable
                  onPress={() => router.push('/friends/enquiries')}
                  accessibilityRole="button"
                  className="bg-card rounded-2xl border border-border/30 px-4 min-h-[52px] flex-row items-center gap-3 active:opacity-80"
                >
                  <BriefcaseIcon size={16} className="text-primary" />
                  <Text className="text-foreground text-sm font-semibold flex-1">Hire enquiries</Text>
                  <ChevronRightIcon size={16} className="text-muted-foreground" />
                </Pressable>
              </View>
            ) : null}

            {incoming.friends.length > 0 && (
              <View className="px-5 pb-4">
                <SectionTitle title="Connection requests" count={incoming.friends.length} />
                <View className="bg-card rounded-2xl overflow-hidden border border-border/30">
                  {incoming.friends.map((req, i) => (
                    <RequestRow
                      key={req.id}
                      request={req}
                      last={i === incoming.friends.length - 1}
                      borderColor={border}
                      busy={respond.isPending && respond.variables?.id === req.id}
                      onAccept={() => answer(req, true)}
                      onDecline={() => answer(req, false)}
                      onMore={() => setSafetyFor(req)}
                    />
                  ))}
                </View>
              </View>
            )}

            {outgoing.friends.length > 0 && (
              <View className="px-5 pb-4">
                <SectionTitle title="Sent requests" count={outgoing.friends.length} />
                <View className="bg-card rounded-2xl overflow-hidden border border-border/30">
                  {outgoing.friends.map((row, i) => (
                    <View
                      key={row.id}
                      className="px-4 py-3 flex-row items-center gap-3"
                      style={i < outgoing.friends.length - 1 ? { borderBottomWidth: 1, borderBottomColor: border } : undefined}
                    >
                      <Avatar url={row.friend_avatar_url} name={row.friend_name} size={40} />
                      <View className="flex-1 min-w-0">
                        <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                          {row.friend_name}
                        </Text>
                        <Text className="text-muted-foreground text-xs mt-0.5">Waiting for them</Text>
                      </View>
                      <Pressable
                        onPress={() => withdraw(row)}
                        disabled={removeFriend.isPending}
                        accessibilityRole="button"
                        accessibilityLabel={`Withdraw your request to ${row.friend_name}`}
                        className="px-3.5 min-h-[44px] justify-center rounded-xl bg-muted active:scale-[0.96]"
                      >
                        <Text className="text-foreground text-xs font-bold">Withdraw</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View className="px-5 pb-4">
              <SectionTitle title="Connections" count={connections.friends.length} />
              <View className="bg-card rounded-2xl overflow-hidden border border-border/30">
                {connections.loading ? (
                  <View className="py-6 items-center">
                    <ActivityIndicator size="small" color={palette.primary} />
                  </View>
                ) : connections.loadFailed && connections.friends.length === 0 ? (
                  <LoadFailed what="your connections" onRetry={() => connections.refetch()} compact />
                ) : connections.friends.length === 0 ? (
                  <View className="py-6 px-5 items-center">
                    <Text className="text-foreground text-sm font-semibold">No connections yet</Text>
                    <Text className="text-muted-foreground text-xs text-center mt-1 leading-5">
                      Search for someone above, or see who works near you.
                    </Text>
                  </View>
                ) : (
                  connections.friends.map((f, i) => (
                    <FriendRow
                      key={f.id}
                      friend={f}
                      borderColor={border}
                      cardColor={palette.card}
                      last={i === connections.friends.length - 1}
                      onMore={() => confirmRemoveFriend(f)}
                    />
                  ))
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* By account id, which a request carries and a legacy free-text row
          does not — those rows get no button. A block deletes the request on
          both sides, and the refreshed list drops it. */}
      <PersonSafetySheet
        visible={!!safetyFor}
        onClose={() => setSafetyFor(null)}
        name={safetyFor?.friend_name ?? ''}
        target={safetyFor?.friend_user_id ? { userId: safetyFor.friend_user_id } : null}
        source="requests"
      />
    </View>
  );
}

/**
 * One request.
 *
 * The name has the row to itself, with Ignore and Accept full width under it.
 * Beside the avatar, two buttons and a menu left a 375 pt phone about six
 * characters of name, and none at large text sizes. And the row opens the
 * profile now, so a request is not just an initial and "wants to connect".
 */
const RequestRow = memo(function RequestRow({
  request,
  last,
  borderColor,
  busy,
  onAccept,
  onDecline,
  onMore,
}: {
  request: Friend;
  last: boolean;
  borderColor: string;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onMore: () => void;
}) {
  const handle = request.friend_handle ?? null;
  return (
    <View
      className="px-4 pt-3 pb-3.5"
      style={last ? undefined : { borderBottomWidth: 1, borderBottomColor: borderColor }}
    >
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={handle ? () => router.push(`/u/${handle}`) : undefined}
          disabled={!handle}
          accessibilityRole={handle ? 'button' : undefined}
          accessibilityLabel={handle ? `${request.friend_name}'s profile` : request.friend_name}
          className="flex-1 min-w-0 flex-row items-center gap-3 active:opacity-70"
        >
          <Avatar url={request.friend_avatar_url} name={request.friend_name} />
          <View className="flex-1 min-w-0">
            <Text className="text-foreground text-[15px] font-semibold" numberOfLines={2}>
              {request.friend_name}
            </Text>
            <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
              {handle ? `@${handle} · wants to connect` : 'Wants to connect'}
            </Text>
          </View>
        </Pressable>
        {/* A request is often all you have of a stranger — no profile if
            theirs is unpublished, no chat until you accept — so the way to
            report or block them is on the request itself. */}
        {request.friend_user_id ? (
          <Pressable
            onPress={onMore}
            accessibilityRole="button"
            accessibilityLabel={`More options for ${request.friend_name}`}
            accessibilityHint="Opens report and block options"
            className="w-11 h-11 -mr-2 items-center justify-center active:opacity-60"
          >
            <EllipsisIcon size={18} className="text-muted-foreground" />
          </Pressable>
        ) : null}
      </View>
      <View className="flex-row gap-2.5 mt-3">
        <Pressable
          onPress={onDecline}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Ignore ${request.friend_name}'s request`}
          className="flex-1 min-h-[44px] rounded-xl bg-muted items-center justify-center active:scale-[0.98]"
        >
          <Text className="text-foreground text-sm font-bold">Ignore</Text>
        </Pressable>
        <Pressable
          onPress={onAccept}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Accept ${request.friend_name}'s request`}
          accessibilityState={{ busy }}
          className="flex-1 min-h-[44px] rounded-xl bg-action items-center justify-center active:scale-[0.98]"
        >
          {busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text className="text-action-foreground text-sm font-bold">Accept</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
});

/** Someone found by search, with the button their relationship calls for. */
function PersonRow({
  person,
  last,
  borderColor,
  connecting,
  onConnect,
  onWithdraw,
  incomingRow,
  onAccept,
  accepting,
}: {
  person: PersonResult;
  last: boolean;
  borderColor: string;
  connecting: boolean | undefined;
  onConnect: () => void;
  onWithdraw: () => void;
  incomingRow: Friend | null;
  onAccept: (row: Friend) => void;
  accepting: boolean;
}) {
  const handle = person.handle ?? null;
  const openDirect = useOpenDirectChat();
  const message = () =>
    openDirect.mutate(person.id, {
      onSuccess: ({ id }) => router.push(`/chat/${id}`),
      onError: (err) => Alert.alert("Couldn't open the chat", profileActionMessage(err, 'message')),
    });

  return (
    <View
      className="px-4 py-3 flex-row items-center gap-3"
      style={last ? undefined : { borderBottomWidth: 1, borderBottomColor: borderColor }}
    >
      {/* The row opens their profile, when they have one: search results were
          a dead end, and a "Connected" one could not even be messaged. */}
      <Pressable
        onPress={handle ? () => router.push(`/u/${handle}`) : undefined}
        disabled={!handle}
        accessibilityRole={handle ? 'button' : undefined}
        accessibilityLabel={handle ? `${person.name}'s profile` : person.name}
        className="flex-1 min-w-0 flex-row items-center gap-3 active:opacity-70"
      >
        <Avatar url={person.avatarUrl} name={person.name} size={40} />
        <View className="flex-1 min-w-0">
          <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
            {person.name}
          </Text>
          {/* The address only comes back when it was what you searched for,
              so most rows show the handle, and an unpublished account shows
              neither. */}
          {person.email || handle ? (
            <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
              {person.email || `@${handle}`}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {person.relationship === 'accepted' ? (
        <Pressable
          onPress={message}
          disabled={openDirect.isPending}
          accessibilityRole="button"
          accessibilityLabel={`Message ${person.name}`}
          className="w-11 h-11 rounded-xl bg-primary/10 items-center justify-center active:scale-[0.96]"
        >
          {openDirect.isPending ? (
            <ActivityIndicator size="small" color="#A85D35" />
          ) : (
            <MessageCircleIcon size={18} className="text-primary" />
          )}
        </Pressable>
      ) : person.relationship === 'pending_out' ? (
        <Pressable
          onPress={onWithdraw}
          accessibilityRole="button"
          accessibilityLabel={`Requested. Withdraw your request to ${person.name}`}
          className="px-3.5 min-h-[44px] justify-center rounded-xl bg-muted active:opacity-70"
        >
          <Text className="text-foreground text-xs font-bold">Requested</Text>
        </Pressable>
      ) : person.relationship === 'pending_in' ? (
        <Pressable
          onPress={incomingRow ? () => onAccept(incomingRow) : undefined}
          disabled={accepting || !incomingRow}
          accessibilityRole="button"
          accessibilityLabel={`Accept ${person.name}'s request`}
          className="px-4 min-h-[44px] justify-center rounded-xl bg-action active:scale-[0.96]"
        >
          <Text className="text-action-foreground text-xs font-bold">Accept</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={onConnect}
          disabled={!!connecting}
          accessibilityRole="button"
          accessibilityLabel={`Connect with ${person.name}`}
          className="px-3.5 min-h-[44px] rounded-xl bg-action flex-row items-center gap-1.5 active:scale-[0.96]"
        >
          {connecting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <UserPlusIcon size={14} className="text-action-foreground" />
          )}
          <Text className="text-action-foreground text-xs font-bold">Connect</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * One connection, with whether they are around.
 *
 * Its own component because `usePresence` is a hook keyed on one person: a
 * friend coming online re-renders their row and nothing else.
 */
const FriendRow = memo(function FriendRow({
  friend,
  borderColor,
  cardColor,
  last,
  onMore,
}: {
  friend: Friend;
  borderColor: string;
  cardColor: string;
  last: boolean;
  onMore: () => void;
}) {
  const { online, lastSeenAt } = usePresence(friend.friend_user_id);
  // A friend added by name, with no account behind them yet, can never be
  // online — so they get no dot at all rather than a grey one implying they
  // are simply away.
  const hasAccount = !!friend.friend_user_id;
  const handle = friend.friend_handle ?? null;
  const openDirect = useOpenDirectChat();
  const message = async () => {
    if (!friend.friend_user_id || openDirect.isPending) return;
    try {
      const chat = await openDirect.mutateAsync(friend.friend_user_id);
      router.push(`/chat/${chat.id}`);
    } catch (err) {
      Alert.alert("Couldn't open the chat", profileActionMessage(err, 'message'));
    }
  };

  return (
    <View
      className="pl-4 pr-2 py-2.5 flex-row items-center gap-2"
      style={last ? undefined : { borderBottomWidth: 1, borderBottomColor: borderColor }}
    >
      <Pressable
        onPress={handle ? () => router.push(`/u/${handle}`) : undefined}
        disabled={!handle}
        accessibilityRole={handle ? 'button' : undefined}
        accessibilityLabel={
          handle
            ? `${friend.friend_name}'s profile${hasAccount ? (online ? ', active now' : '') : ''}`
            : friend.friend_name
        }
        className="flex-1 min-w-0 flex-row items-center gap-3 min-h-[44px] active:opacity-70"
      >
        <View>
          <Avatar url={friend.friend_avatar_url} name={friend.friend_name} size={40} />
          {hasAccount && (
            // Ringed in the card colour so it reads as cut into the avatar
            // rather than stuck on top of it.
            <View
              style={{
                position: 'absolute',
                right: -1,
                bottom: -1,
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: online ? '#10b981' : '#9ca3af',
                borderWidth: 2,
                borderColor: cardColor,
              }}
            />
          )}
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
            {friend.friend_name}
          </Text>
          <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
            {/* When they were last around, falling back to the address for
                somebody with no account to be around in. */}
            {hasAccount ? (online ? 'Active now' : lastSeenLabel(lastSeenAt)) : (friend.friend_email ?? '')}
          </Text>
        </View>
      </Pressable>

      {hasAccount && (
        <Pressable
          onPress={message}
          disabled={openDirect.isPending}
          accessibilityRole="button"
          accessibilityLabel={`Message ${friend.friend_name}`}
          className="w-11 h-11 rounded-xl bg-primary/10 items-center justify-center active:scale-[0.96]"
        >
          {openDirect.isPending ? (
            <ActivityIndicator size="small" color="#A85D35" />
          ) : (
            <MessageCircleIcon size={18} className="text-primary" />
          )}
        </Pressable>
      )}
      <Pressable
        onPress={onMore}
        accessibilityRole="button"
        accessibilityLabel={`More options for ${friend.friend_name}`}
        accessibilityHint="Remove this connection"
        className="w-11 h-11 items-center justify-center active:opacity-60"
      >
        <EllipsisIcon size={18} className="text-muted-foreground" />
      </Pressable>
    </View>
  );
});

/**
 * A hire enquiry waiting on you: who, what, when and for how much, with the
 * answer under it. The card opens the full list, where sent and answered
 * ones are too.
 */
function EnquiryCard({ enquiry }: { enquiry: HireEnquiry }) {
  const answer = useAnswerEnquiry();
  const [acting, setActing] = useState<'accept' | 'decline' | null>(null);

  const respond = (accept: boolean) => {
    setActing(accept ? 'accept' : 'decline');
    answer.mutate(
      { id: enquiry.id, accept },
      {
        onSuccess: (result) => {
          if (accept) tap();
          if (accept && result.conversationId) router.push(`/chat/${result.conversationId}`);
        },
        onError: (err) =>
          Alert.alert(
            accept ? "Couldn't accept the enquiry" : "Couldn't decline the enquiry",
            profileActionMessage(err, 'enquiry'),
          ),
        onSettled: () => setActing(null),
      },
    );
  };

  const details = [
    enquiry.roleWanted ? { icon: BriefcaseIcon, text: enquiry.roleWanted } : null,
    enquiry.eventDate ? { icon: CalendarIcon, text: readableDate(enquiry.eventDate) } : null,
    enquiry.budget ? { icon: BanknoteIcon, text: enquiry.budget } : null,
  ].filter(Boolean) as { icon: typeof BriefcaseIcon; text: string }[];

  return (
    <View className="bg-card rounded-2xl border border-border/30 p-4">
      <Pressable
        onPress={() => router.push('/friends/enquiries')}
        accessibilityRole="button"
        accessibilityLabel={`${enquiry.personName} wants to hire you. ${enquiry.message}`}
        accessibilityHint="Opens all your enquiries"
        className="active:opacity-80"
      >
        <View className="flex-row items-center gap-3">
          <Avatar url={enquiry.personAvatarUrl} name={enquiry.personName} size={40} />
          <View className="flex-1 min-w-0">
            <Text className="text-foreground text-[15px] font-semibold" numberOfLines={1}>
              {enquiry.personName}
            </Text>
            <Text className="text-muted-foreground text-xs mt-0.5">Wants to hire you</Text>
          </View>
        </View>
        {details.length > 0 && (
          <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1 mt-2.5">
            {details.map(({ icon: Icon, text }) => (
              <View key={text} className="flex-row items-center gap-1">
                <Icon size={12} className="text-muted-foreground" />
                <Text className="text-muted-foreground text-xs">{text}</Text>
              </View>
            ))}
          </View>
        )}
        <Text className="text-foreground text-[13px] leading-5 mt-2" numberOfLines={3}>
          {enquiry.message}
        </Text>
      </Pressable>
      <View className="flex-row gap-2.5 mt-3">
        <Pressable
          onPress={() => respond(false)}
          disabled={answer.isPending}
          accessibilityRole="button"
          accessibilityLabel={`Decline ${enquiry.personName}'s enquiry`}
          className="flex-1 min-h-[44px] rounded-xl bg-muted items-center justify-center active:scale-[0.98]"
        >
          {acting === 'decline' ? (
            <ActivityIndicator size="small" color="#9ca3af" />
          ) : (
            <Text className="text-foreground text-sm font-bold">Decline</Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => respond(true)}
          disabled={answer.isPending}
          accessibilityRole="button"
          accessibilityLabel={`Accept ${enquiry.personName}'s enquiry`}
          className="flex-1 min-h-[44px] rounded-xl bg-action items-center justify-center active:scale-[0.98]"
        >
          {acting === 'accept' ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text className="text-action-foreground text-sm font-bold">Accept</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
