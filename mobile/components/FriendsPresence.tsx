import { View, Text, Image, Pressable, Alert } from 'react-native';
import { useMemo } from 'react';
import { router } from 'expo-router';
import { BriefcaseIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  useCollaborators,
  useFriendPresence,
  useOpenDirectChat,
  useTheme,
} from '@/src/hooks';
import {
  useOnlineKeyAmong,
  usePresence,
  lastSeenLabel,
} from '@/src/lib/presence-store';
import { PLACEHOLDER_IMAGE } from '@/src/lib/placeholder';
import type { Friend } from '@/src/api';

cssInterop(BriefcaseIcon, {
  className: { target: 'style', nativeStyleToProp: { color: true } },
});

/**
 * Friends, with who is around right now.
 *
 * The same list the web sidebar shows, on the tab where people already look
 * for people. Online first, because "who could pick up an edit this
 * afternoon" is the only question it answers; a briefcase marks a friend who
 * is also a collaborator.
 *
 * Sorted in JavaScript rather than by CSS `order` as on the web: React Native
 * has no such property, so the list has to know everyone's presence at once
 * instead of each row minding its own.
 */
export function FriendsPresence() {
  const { isDark } = useTheme();
  const { friends } = useFriendPresence();
  const { collaborators } = useCollaborators({ limit: 100 });

  const withAccounts = useMemo(
    () => friends.filter((f) => f.friend_user_id),
    [friends],
  );

  const ids = useMemo(
    () => withAccounts.map((f) => f.friend_user_id as string),
    [withAccounts],
  );
  const onlineKey = useOnlineKeyAmong(ids);
  const online = useMemo(
    () => new Set(onlineKey.split('|').filter(Boolean)),
    [onlineKey],
  );

  const collaboratorIds = useMemo(
    () =>
      new Set(
        collaborators
          .filter((c) => c.status === 'accepted' && c.collaborator_user_id)
          .map((c) => c.collaborator_user_id as string),
      ),
    [collaborators],
  );

  const sorted = useMemo(() => {
    // Stable within each group: someone connecting should lift one name to the
    // top, not reshuffle the rest around them.
    const rank = (f: Friend) => (online.has(f.friend_user_id as string) ? 0 : 1);
    return [...withAccounts].sort(
      (a, b) => rank(a) - rank(b) || a.friend_name.localeCompare(b.friend_name),
    );
  }, [withAccounts, online]);

  if (sorted.length === 0) return null;

  const activeCount = online.size;

  return (
    <View className="px-5 pt-2 pb-4 gap-2">
      <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px]">
        Friends{activeCount > 0 ? ` · ${activeCount} active` : ''}
      </Text>

      <View className="bg-card rounded-2xl overflow-hidden">
        {sorted.map((friend, i) => (
          <FriendRow
            key={friend.id}
            friend={friend}
            isCollaborator={collaboratorIds.has(friend.friend_user_id as string)}
            last={i === sorted.length - 1}
            isDark={isDark}
          />
        ))}
      </View>
    </View>
  );
}

function FriendRow({
  friend,
  isCollaborator,
  last,
  isDark,
}: {
  friend: Friend;
  isCollaborator: boolean;
  last: boolean;
  isDark: boolean;
}) {
  // Per row as well as in bulk: the parent needs the set to sort, this needs
  // the timestamp to say when they were last around.
  const { online, lastSeenAt } = usePresence(friend.friend_user_id);
  const openDirect = useOpenDirectChat();

  // Opens the conversation itself. `/chat/new` is the picker and takes no
  // "who" parameter, so routing there from a named person would land them on
  // a list to choose from — having already chosen.
  const openChat = () =>
    openDirect.mutate(friend.friend_user_id as string, {
      onSuccess: ({ id }) => router.push(`/chat/${id}`),
      onError: (err: Error) =>
        Alert.alert('Could not open chat', err.message || 'Please try again.'),
    });

  return (
    <Pressable
      onPress={openChat}
      disabled={openDirect.isPending}
      className="px-4 py-3 flex-row items-center gap-3 active:bg-muted/30"
      style={
        last
          ? undefined
          : { borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' }
      }
    >
      <View>
        <Image
          source={{ uri: friend.friend_avatar_url ?? PLACEHOLDER_IMAGE }}
          style={{ width: 40, height: 40, borderRadius: 20 }}
        />
        {/* Ringed in the card colour so it reads as cut into the avatar
            rather than stuck on top of it. */}
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
            borderColor: isDark ? '#1C1917' : '#FFFFFF',
          }}
        />
      </View>

      <View className="flex-1 min-w-0">
        <Text
          className={`text-sm font-semibold ${online ? 'text-foreground' : 'text-muted-foreground'}`}
          numberOfLines={1}
        >
          {friend.friend_name}
        </Text>
        <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
          {online ? 'Active now' : lastSeenLabel(lastSeenAt)}
        </Text>
      </View>

      {isCollaborator && (
        <View
          className="rounded-full p-1.5"
          style={{ backgroundColor: '#B66A4018' }}
          accessibilityLabel="Works with you"
        >
          <BriefcaseIcon size={13} style={{ color: '#B66A40' }} />
        </View>
      )}
    </Pressable>
  );
}
