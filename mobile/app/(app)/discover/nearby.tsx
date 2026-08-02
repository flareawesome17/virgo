import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ArrowLeftIcon,
  MapPinIcon,
  MessageCircleIcon,
  UserPlusIcon,
  ShieldCheckIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  useFriends,
  useLocationSharing,
  useNearbyPeople,
  useNearbyRoleCounts,
  useOpenDirectChat,
  useRespondToFriendRequest,
  useSendFriendRequest,
  useShareLocation,
  useStopSharingLocation,
  useTheme,
} from '@/src/hooks';
import { RolePicker } from '@/components';
import type { NearbyPerson } from '@/src/api';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MapPinIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MessageCircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ShieldCheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/** The API caps the radius at 200km. */
const RADII = [5, 25, 50, 100, 200];

function distanceLabel(km: number): string {
  if (km < 1) return 'under 1 km away';
  return `${km} km away`;
}

/**
 * Collaborators near you.
 *
 * Discovery is reciprocal by design: you appear to others only while you are
 * sharing, and you can only search while sharing yourself. Nobody's coordinates
 * cross the wire — the server returns a distance and nothing more.
 */
export default function NearbyScreen() {
  const { isDark } = useTheme();
  const [radiusKm, setRadiusKm] = useState(50);
  /** Empty means everyone; otherwise only people who do one of these. */
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const { sharing, isLoading: loadingStatus } = useLocationSharing();
  const startSharing = useShareLocation();
  const stopSharing = useStopSharingLocation();

  const { people, isLoading, refetch } = useNearbyPeople(radiusKm, roleFilter);
  const { counts } = useNearbyRoleCounts(radiusKm);

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
    await refetch();
    setRefreshing(false);
  };

  const toggleSharing = (next: boolean) => {
    if (next) {
      startSharing.mutate(undefined, {
        onError: (err: any) =>
          Alert.alert(
            'Could not turn on sharing',
            err?.message || 'Please try again.',
          ),
      });
      return;
    }
    stopSharing.mutate(undefined, {
      onError: (err: any) =>
        Alert.alert('Could not turn off sharing', err?.message || 'Please try again.'),
    });
  };

  const addFriend = (person: NearbyPerson) => {
    sendRequest.mutate(
      { userId: person.id },
      {
        onSuccess: () =>
          Alert.alert('Request sent', `${person.name} will see it in their network.`),
        onError: (err: any) =>
          Alert.alert('Could not send request', err?.message || 'Please try again.'),
      },
    );
  };

  const acceptFrom = (userId: string) => {
    const match = incoming.find((f) => f.friend_user_id === userId);
    if (!match) return;
    respond.mutate({ id: match.id, accept: true });
  };

  const message = (person: NearbyPerson) => {
    openDirect.mutate(person.id, {
      onSuccess: ({ id }) => router.push(`/chat/${id}`),
      onError: (err: any) =>
        Alert.alert('Could not open chat', err?.message || 'Please try again.'),
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
        <Image
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
        <View className="flex-row items-center gap-1 mt-0.5">
          <MapPinIcon size={11} className="text-muted-foreground" />
          <Text className="text-muted-foreground text-xs">
            {distanceLabel(person.distanceKm)}
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
                  style={{
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 5,
                    backgroundColor: matched ? '#B66A40' : '#B66A4014',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: '700',
                      color: matched ? '#FFFFFF' : '#B66A40',
                    }}
                  >
                    {role}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {person.relationship === 'accepted' ? (
        <Pressable
          onPress={() => message(person)}
          disabled={openDirect.isPending}
          className="px-3 py-2 rounded-xl bg-primary flex-row items-center gap-1.5 active:scale-[0.94]"
        >
          <MessageCircleIcon size={13} className="text-white" />
          <Text className="text-white text-xs font-bold">Message</Text>
        </Pressable>
      ) : person.relationship === 'pending_out' ? (
        <View className="px-3 py-1.5 rounded-full bg-muted">
          <Text className="text-muted-foreground text-[11px] font-bold">Requested</Text>
        </View>
      ) : person.relationship === 'pending_in' ? (
        <Pressable
          onPress={() => acceptFrom(person.id)}
          className="px-3 py-2 rounded-xl bg-primary active:scale-[0.94]"
        >
          <Text className="text-white text-xs font-bold">Accept</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => addFriend(person)}
          disabled={sendRequest.isPending}
          className="px-3 py-2 rounded-xl bg-primary flex-row items-center gap-1.5 active:scale-[0.94]"
        >
          <UserPlusIcon size={13} className="text-white" />
          <Text className="text-white text-xs font-bold">Add</Text>
        </Pressable>
      )}
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={isDark ? '#C17745' : '#B66A40'}
          />
        }
      >
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
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

        {/* Sharing opt-in */}
        <View className="px-5 mt-4">
          <View className="bg-card rounded-2xl p-4" style={cardShadow}>
            <View className="flex-row items-center gap-3">
              <View
                className="w-10 h-10 rounded-xl items-center justify-center"
                style={{ backgroundColor: sharing ? '#6B8E4E18' : '#A8948920' }}
              >
                <MapPinIcon
                  size={18}
                  style={{ color: sharing ? '#6B8E4E' : '#8B7355' }}
                />
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-foreground text-sm font-bold">
                  Share my location
                </Text>
                <Text className="text-muted-foreground text-xs mt-0.5">
                  {sharing ? 'You are discoverable' : 'You are not discoverable'}
                </Text>
              </View>
              {startSharing.isPending || stopSharing.isPending || loadingStatus ? (
                <ActivityIndicator size="small" color="#B66A40" />
              ) : (
                <Switch
                  value={sharing}
                  onValueChange={toggleSharing}
                  trackColor={{ false: isDark ? '#3A322C' : '#E5D9D1', true: '#B66A40' }}
                  thumbColor="#FFFFFF"
                />
              )}
            </View>

            <View className="flex-row items-start gap-2 mt-3.5 pt-3.5" style={{ borderTopWidth: 1, borderTopColor: isDark ? '#2A2522' : '#F0E8E2' }}>
              <ShieldCheckIcon size={13} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-[11px] flex-1 leading-4">
                Others see only how far away you are, never where you are.
                Turning this off erases your stored location straight away.
              </Text>
            </View>
          </View>
        </View>

        {/* Radius */}
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
                  className={`px-4 py-2 rounded-full active:scale-[0.95] ${on ? 'bg-primary' : 'bg-card'}`}
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

        {/* Role filter — the point of the screen: "an SDE photo editor within
            30km", not "whoever happens to be around". */}
        {sharing && (
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
                ? `Everyone within ${radiusKm} km. Pick a role to narrow it down — the number is how many are in range.`
                : `Anyone who does ${roleFilter.join(' or ')}.`}
            </Text>
          </View>
        )}

        {/* Results */}
        {!sharing ? (
          <View className="px-10 pt-14 items-center">
            <View className="w-16 h-16 rounded-full bg-muted items-center justify-center mb-4">
              <MapPinIcon size={26} className="text-muted-foreground" />
            </View>
            <Text className="text-foreground text-base font-bold text-center">
              Turn on sharing to see who is nearby
            </Text>
            <Text className="text-muted-foreground text-sm text-center mt-2 leading-5">
              Discovery works both ways — only people who share their location
              can find each other.
            </Text>
          </View>
        ) : isLoading ? (
          <View className="pt-14 items-center">
            <ActivityIndicator size="small" color="#B66A40" />
          </View>
        ) : people.length === 0 ? (
          <View className="px-10 pt-14 items-center">
            <Text className="text-foreground text-base font-bold text-center">
              {roleFilter.length > 0
                ? `No ${roleFilter.join(' or ')} within ${radiusKm} km`
                : `Nobody within ${radiusKm} km`}
            </Text>
            <Text className="text-muted-foreground text-sm text-center mt-2 leading-5">
              {roleFilter.length > 0
                ? 'Try a wider radius or a different role. Only people sharing their location appear here.'
                : 'Try a wider radius. Only people sharing their location appear here.'}
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
                  Friends nearby
                </Text>
                <View className="bg-card rounded-2xl overflow-hidden" style={cardShadow}>
                  {friendsNearby.map((p, i) => renderPerson(p, i, friendsNearby.length))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
