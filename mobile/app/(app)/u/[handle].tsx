import {
  View, Text, ScrollView, Pressable, ActivityIndicator, Alert,
  Share, useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import {
  ApiError,
  friendsApi,
  profileBanner,
  profileUrl,
  queryKeys,
  type ProfileView,
  type PublicProfile,
  type ViewerConnection,
} from '@/src/api';
import {
  useOpenDirectChat,
  useProfileSettings,
  usePublicProfile,
  useRespondToFriendRequest,
  useSendFriendRequest,
  useTheme,
} from '@/src/hooks';
import {
  ArrowLeftIcon, BriefcaseIcon, Building2Icon, CalendarCheckIcon, CalendarIcon,
  CheckIcon, ClockIcon, EllipsisIcon, GlobeIcon, MapPinIcon, MessageCircleIcon,
  PencilIcon, Share2Icon, UserCheckIcon, UserPlusIcon, UserSearchIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PersonSafetySheet } from '@/components/PersonSafetySheet';
import { LoadFailed } from '@/components/LoadFailed';
import {
  PortfolioBlock,
  ProfileAvatar,
  ProfileCover,
  ProfileDetails,
  ProfileStatsLine,
  type ProfileDetailRow,
} from '@/components/ProfileParts';
import { SITE, profileActionMessage } from '@/src/lib/profile-media';
import { PALETTES } from '@/theme';

// Every icon drawn here, including those handed to ProfileDetails, which
// draws them by class. One left out renders without its colour.
for (const Icon of [
  ArrowLeftIcon, BriefcaseIcon, Building2Icon, CalendarCheckIcon, CalendarIcon,
  CheckIcon, ClockIcon, EllipsisIcon, GlobeIcon, MapPinIcon, MessageCircleIcon,
  PencilIcon, Share2Icon, UserCheckIcon, UserPlusIcon, UserSearchIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * Somebody's profile, on the phone.
 *
 * The same content virgo.ph/@handle serves a stranger, rendered natively. A
 * signed-in person who taps a name should not be handed off to a browser —
 * that is the moment they are deciding whether to trust somebody with a
 * booking, and leaving the app is the worst thing to do to that decision.
 */
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { handle } = useLocalSearchParams<{ handle: string }>();

  const q = usePublicProfile(handle);
  // Only for an API that sends no viewer block: Settings > View profile used
  // to open your own page here, where "Hire <you>" leads to a screen that
  // refuses it.
  const { settings: own } = useProfileSettings();
  const [safetyOpen, setSafetyOpen] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (q.isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color={palette.primary} />
      </SafeAreaView>
    );
  }

  // Ahead of any cached copy: a block or an unpublish has to take the page
  // away, not leave the one from before it on screen.
  if (q.notFound) return <NotFound onBack={back} />;

  if (q.loadFailed) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <View className="flex-row items-center gap-3 px-5 py-3">
          <Pressable onPress={back} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
            <ArrowLeftIcon size={20} className="text-foreground" />
          </Pressable>
          <Text className="text-foreground text-lg font-bold flex-1" numberOfLines={1}>
            {handle ? `@${handle}` : 'Profile'}
          </Text>
        </View>
        <LoadFailed what="this profile" onRetry={() => q.refetch()} />
      </SafeAreaView>
    );
  }

  const person = q.profile;
  if (!person) return <NotFound onBack={back} />;

  const isSelf =
    person.viewer?.isSelf ??
    (!!own?.handle && own.handle.toLowerCase() === person.handle.toLowerCase());
  const first = person.displayName.split(' ')[0];

  const rows: ProfileDetailRow[] = [];
  if (person.location) rows.push({ icon: MapPinIcon, text: person.location });
  if (person.studioName) rows.push({ icon: Building2Icon, text: person.studioName });
  if (person.website) {
    const site = person.website;
    rows.push({
      icon: GlobeIcon,
      text: site.replace(/^https?:\/\//i, ''),
      tone: 'link',
      onPress: () => Linking.openURL(/^https?:\/\//i.test(site) ? site : `https://${site}`),
    });
  }
  if (person.availableForBookings) {
    rows.push({ icon: CalendarCheckIcon, text: 'Available for bookings', tone: 'success' });
  }
  rows.push({ icon: CalendarIcon, text: `On Virgo since ${person.memberSince}` });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-3 px-5 py-3">
        <Pressable onPress={back} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeftIcon size={20} className="text-foreground" />
        </Pressable>
        <Text className="text-foreground text-lg font-bold flex-1" numberOfLines={1}>
          @{person.handle}
        </Text>
        <Pressable
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Share profile"
          onPress={() =>
            Share.share({
              message: `${person.displayName} on Virgo — ${profileUrl(person.handle, SITE)}`,
            })
          }
        >
          <Share2Icon size={18} className="text-muted-foreground" />
        </Pressable>
        {!isSelf && (
          <Pressable
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="More options"
            onPress={() => setSafetyOpen(true)}
          >
            <EllipsisIcon size={18} className="text-muted-foreground" />
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <ProfileCover banner={profileBanner(person)} width={width} />

        <View className="px-5">
          <View style={{ marginTop: -48 }}>
            <ProfileAvatar url={person.avatarUrl} name={person.displayName} size={96} />
          </View>

          <Text className="text-foreground text-[22px] font-extrabold mt-3" numberOfLines={2}>
            {person.displayName}
          </Text>
          {person.title ? (
            <Text className="text-muted-foreground text-[15px] font-medium mt-0.5">
              {person.title}
            </Text>
          ) : null}

          {person.roles.length > 0 && (
            <View className="flex-row flex-wrap gap-1.5 mt-2.5">
              {person.roles.map((role) => (
                <View key={role} className="rounded-full px-3 py-1 bg-primary/10">
                  <Text className="text-primary text-[11px] font-bold">{role}</Text>
                </View>
              ))}
            </View>
          )}

          <ProfileStatsLine
            stats={person.stats}
            mutual={isSelf ? 0 : person.mutualConnections}
            className="mt-3"
          />

          <View className="mt-4 gap-2">
            {isSelf ? (
              <Pressable
                className="rounded-2xl py-3.5 flex-row items-center justify-center gap-2 bg-muted active:opacity-80"
                onPress={() => router.push('/settings/profile')}
                accessibilityRole="button"
              >
                <PencilIcon size={16} className="text-foreground" />
                <Text className="text-foreground text-[15px] font-bold">Edit profile</Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  className="rounded-2xl py-3.5 flex-row items-center justify-center gap-2 bg-action active:opacity-90"
                  onPress={() => router.push(`/hire/${person.handle}`)}
                  accessibilityRole="button"
                >
                  <BriefcaseIcon size={16} className="text-action-foreground" />
                  <Text className="text-action-foreground text-[15px] font-bold">Hire {first}</Text>
                </Pressable>
                {/* Only when the API said where the viewer stands: guessing
                    would offer Connect to somebody already connected. */}
                {person.viewer && handle && (
                  <ConnectionActions
                    person={person}
                    cacheHandle={handle}
                    connection={person.viewer.connection}
                    friendId={person.viewer.friendId}
                    first={first}
                    onStale={() => q.refetch()}
                  />
                )}
              </>
            )}
          </View>

          {person.bio ? (
            <Text className="text-muted-foreground text-[13px] leading-5 mt-4">{person.bio}</Text>
          ) : null}

          <View className="mt-4">
            <ProfileDetails rows={rows} />
          </View>
        </View>

        <PortfolioBlock
          header="Portfolio"
          width={width}
          items={person.portfolio}
          emptyState={
            <View className="items-center px-5 py-10">
              <BriefcaseIcon size={26} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-[13px] text-center mt-3 leading-5">
                {first} has not added any work yet. You can still send an enquiry.
              </Text>
            </View>
          }
        />
      </ScrollView>

      {/* By handle: the profile never carries the account id. Blocking goes
          back, because across a block this profile no longer exists. */}
      {!isSelf && (
        <PersonSafetySheet
          visible={safetyOpen}
          onClose={() => setSafetyOpen(false)}
          name={person.displayName}
          target={{ handle: person.handle }}
          source="profile"
          onBlocked={() => router.back()}
        />
      )}
    </SafeAreaView>
  );
}

function NotFound({ onBack }: { onBack: () => void }) {
  return (
    <SafeAreaView className="flex-1 bg-background items-center justify-center px-10">
      <UserSearchIcon size={30} className="text-muted-foreground" />
      <Text className="text-foreground text-[15px] font-bold mt-3">Profile not found</Text>
      <Text className="text-muted-foreground text-[13px] text-center mt-1.5 leading-5">
        This profile is private, or the handle has changed.
      </Text>
      <Pressable className="mt-5" onPress={onBack} accessibilityRole="button">
        <Text className="text-primary text-[13px] font-bold">Go back</Text>
      </Pressable>
    </SafeAreaView>
  );
}

/**
 * Connect, and what it becomes.
 *
 * Withdrawing, declining and removing stay on Network, where the whole list
 * is. A declined request keeps reading as Requested — the server reports it
 * that way on purpose, so nobody learns they were turned down by watching a
 * button change back.
 *
 * Message only once connected: chat needs a connection, and a button that
 * answers "you can only chat with people you're connected with" is a dead end.
 */
function ConnectionActions({
  person,
  cacheHandle,
  connection,
  friendId,
  first,
  onStale,
}: {
  person: ProfileView;
  /** The handle the query is cached under, exactly as the route gave it. */
  cacheHandle: string;
  connection: ViewerConnection;
  friendId: string | null;
  first: string;
  onStale: () => void;
}) {
  const queryClient = useQueryClient();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const send = useSendFriendRequest();
  const respond = useRespondToFriendRequest();
  const openDirect = useOpenDirectChat();
  const [opening, setOpening] = useState(false);

  // Written to the raw cached profile; the screen reads it back through
  // withProfileDefaults like any other copy.
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
          // better than an alert would.
          if (err instanceof ApiError && err.status === 400) {
            onStale();
            return;
          }
          if (err instanceof ApiError && err.status === 404) onStale();
          Alert.alert("Couldn't send the request", profileActionMessage(err, 'connect'));
        },
      },
    );

  const accept = () => {
    if (!friendId) return;
    respond.mutate(
      { id: friendId, accept: true },
      {
        onSuccess: () => writeViewer({ connection: 'accepted', friendId }),
        onError: (err) => {
          onStale();
          Alert.alert("Couldn't accept the request", profileActionMessage(err, 'accept'));
        },
      },
    );
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
      Alert.alert("Couldn't open the chat", profileActionMessage(err, 'message'));
    } finally {
      setOpening(false);
    }
  };

  if (connection === 'none') {
    return (
      <Pressable
        onPress={connect}
        disabled={send.isPending}
        accessibilityRole="button"
        accessibilityLabel={`Connect with ${first}`}
        accessibilityState={{ busy: send.isPending, disabled: send.isPending }}
        className="rounded-2xl py-3 border border-primary flex-row items-center justify-center gap-2 active:opacity-80"
      >
        {send.isPending ? (
          <ActivityIndicator size="small" color={palette.primary} />
        ) : (
          <UserPlusIcon size={16} className="text-primary" />
        )}
        <Text className="text-primary text-[15px] font-bold">Connect</Text>
      </Pressable>
    );
  }

  if (connection === 'pending_out') {
    return (
      <View
        className="rounded-2xl py-3 bg-muted flex-row items-center justify-center gap-2"
        accessible
        accessibilityLabel="Connection requested"
        accessibilityState={{ disabled: true }}
      >
        <ClockIcon size={16} className="text-muted-foreground" />
        <Text className="text-muted-foreground text-[15px] font-bold">Requested</Text>
      </View>
    );
  }

  if (connection === 'pending_in') {
    return (
      <Pressable
        onPress={accept}
        disabled={respond.isPending || !friendId}
        accessibilityRole="button"
        accessibilityLabel={`Accept ${first}'s connection request`}
        accessibilityState={{ busy: respond.isPending, disabled: respond.isPending || !friendId }}
        className="rounded-2xl py-3 bg-primary flex-row items-center justify-center gap-2 active:opacity-90"
      >
        {respond.isPending ? (
          <ActivityIndicator size="small" color={palette.primaryForeground} />
        ) : (
          <UserCheckIcon size={16} className="text-primary-foreground" />
        )}
        <Text className="text-primary-foreground text-[15px] font-bold">Accept</Text>
      </Pressable>
    );
  }

  return (
    <View className="flex-row gap-2">
      <View
        className="flex-1 rounded-2xl py-3 bg-success/15 flex-row items-center justify-center gap-2"
        accessible
        accessibilityLabel={`Connected with ${first}`}
      >
        <CheckIcon size={16} className="text-success" />
        <Text className="text-success text-[15px] font-bold">Connected</Text>
      </View>
      <Pressable
        onPress={message}
        disabled={opening || !friendId}
        accessibilityRole="button"
        accessibilityLabel={`Message ${first}`}
        accessibilityState={{ busy: opening, disabled: opening || !friendId }}
        className="flex-1 rounded-2xl py-3 bg-muted flex-row items-center justify-center gap-2 active:opacity-80"
      >
        {opening ? (
          <ActivityIndicator size="small" color={palette.foreground} />
        ) : (
          <MessageCircleIcon size={16} className="text-foreground" />
        )}
        <Text className="text-foreground text-[15px] font-bold">Message</Text>
      </Pressable>
    </View>
  );
}
