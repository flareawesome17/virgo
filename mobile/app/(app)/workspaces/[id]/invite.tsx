import { View, Text, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CollaboratorRole } from '@/src/api';
import {
  useAlbums,
  useCreateCollaborator,
  useFriends,
  useWorkspace,
  useTheme,
} from '@/src/hooks';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftIcon,
  SendIcon,
  CheckIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { LoadFailed } from '@/components/LoadFailed';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(SendIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const ROLES = [
  { key: 'photographer', label: 'Photographer', desc: 'Can upload, edit media' },
  { key: 'editor', label: 'Editor', desc: 'Can edit, review, export' },
  { key: 'reviewer', label: 'Reviewer', desc: 'Can view and comment' },
  { key: 'client', label: 'Client', desc: 'View-only access' },
];

const ROLE_COLORS: Record<string, string> = {
  photographer: '#B66A40',
  editor: '#C17745',
  reviewer: '#8B5E3C',
  client: '#5B7B9A',
};

export default function InviteCollaboratorsScreen() {
  const { isDark } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [role, setRole] = useState('photographer');
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);

  const { data: workspace } = useWorkspace(id);

  // Only accepted friends are eligible; the API rejects anyone else.
  const { friends, loadFailed, refetch } = useFriends({ status: 'accepted', limit: 100 });

  const { albums } = useAlbums({ workspace_id: id, limit: 100 }, { enabled: !!id });

  const [sharedAlbumIds, setSharedAlbumIds] = useState<string[]>([]);

  // Default to sharing everything, matching the inheritance rule. Only seeded
  // once the albums arrive, and never again, so a deliberate deselection is
  // not undone by a refetch.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || albums.length === 0) return;
    seeded.current = true;
    setSharedAlbumIds(albums.map((a) => a.id));
  }, [albums]);

  /** Sends one invitation straight away. */
  const sendOne = async () => {
    const friend = friends.find((f) => f.id === selectedFriendId);
    if (!friend) {
      Alert.alert('Choose someone', 'Pick a friend to invite to this workspace.');
      return;
    }
    if (!friend.friend_user_id) {
      // Predates real friendships, so there is no account to invite.
      Alert.alert(
        'Cannot invite',
        'This contact is not linked to a Virgo account. Add them again from Network.',
      );
      return;
    }

    try {
      await createCollaborator.mutateAsync({
        workspace_id: id,
        collaborator_user_id: friend.friend_user_id,
        name: friend.friend_name,
        role: role as CollaboratorRole,
        album_ids: sharedAlbumIds,
      });
      setSelectedFriendId(null);
      setRole('photographer');
      Alert.alert(
        'Invitation sent',
        `${friend.friend_name} will see it in their network and can accept it there.`,
        [{ text: 'Done', onPress: () => router.back() }, { text: 'Invite someone else' }],
      );
    } catch (err: any) {
      Alert.alert('Could not invite', err?.message || 'Please try again.');
    }
  };

  const createCollaborator = useCreateCollaborator();

  const accent = workspace?.accent_color || '#B66A40';

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      {/* Lifts the form above the keyboard. Without this the fields nearest
          the bottom sat underneath it on iOS with no way to scroll to them. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={{
              shadowColor: '#000',
              shadowOpacity: 0.04,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            }}
          >
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <View>
            <Text className="text-foreground text-[22px] font-bold tracking-tight">
              Invite Collaborators
            </Text>
            {workspace ? (
              <Text className="text-muted-foreground text-sm mt-0.5">
                Add members to {workspace.name}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Friend picker. This was a name + email form, which created a label
            rather than inviting anyone — collaborators are accounts now, and
            only accepted friends are eligible. */}
        <View className="px-5 mt-6">
          <Text className="text-foreground text-base font-bold tracking-tight mb-1">
            Choose a friend
          </Text>
          <Text className="text-muted-foreground text-xs mb-3">
            Only people you are friends with can join a workspace.
          </Text>

          {loadFailed && friends.length === 0 ? (
            <LoadFailed what="your friends" onRetry={() => refetch()} compact />
          ) : friends.length === 0 ? (
            <Pressable
              onPress={() => router.push('/(app)/(tabs)/network')}
              className="bg-card rounded-2xl px-4 py-5 items-center active:scale-[0.98]"
              style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
            >
              <Text className="text-foreground text-sm font-semibold">No friends yet</Text>
              <Text className="text-muted-foreground text-xs mt-1 text-center">
                Search for someone in Network and add them first.
              </Text>
              <Text className="text-primary text-xs font-bold mt-3">Go to Network</Text>
            </Pressable>
          ) : (
            <View
              className="bg-card rounded-2xl overflow-hidden"
              style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
            >
              {friends.map((f, i) => {
                const picked = selectedFriendId === f.id;
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => setSelectedFriendId(picked ? null : f.id)}
                    className="px-4 py-3 flex-row items-center gap-3 active:bg-muted/30"
                    style={i < friends.length - 1 ? { borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' } : undefined}
                  >
                    <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: '#B66A4018' }}>
                      <Text style={{ color: '#B66A40', fontWeight: '700' }}>
                        {f.friend_name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                        {f.friend_name}
                      </Text>
                      {f.friend_email ? (
                        <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                          {f.friend_email}
                        </Text>
                      ) : null}
                    </View>
                    {picked && <CheckIcon size={16} className="text-primary" />}
                  </Pressable>
                );
              })}
            </View>
          )}


          {/* Role picker */}
          <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide mt-4 mb-2 ml-1">
            Role
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {ROLES.map((r) => (
              <Pressable
                key={r.key}
                onPress={() => setRole(r.key)}
                className={`rounded-xl px-4 py-2.5 active:scale-[0.96] ${
                  role === r.key ? 'bg-primary' : 'bg-card'
                }`}
                style={
                  role !== r.key
                    ? {
                        shadowColor: '#000',
                        shadowOpacity: 0.03,
                        shadowRadius: 4,
                        shadowOffset: { width: 0, height: 1 },
                        elevation: 1,
                      }
                    : undefined
                }
              >
                <Text
                  className={`text-sm font-semibold ${
                    role === r.key ? 'text-white' : 'text-foreground'
                  }`}
                >
                  {r.label}
                </Text>
                <Text
                  className={`text-[10px] mt-0.5 ${
                    role === r.key ? 'text-white/70' : 'text-muted-foreground'
                  }`}
                >
                  {r.desc}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Which albums to share. Everything is selected by default, which
              matches the inheritance rule: a collaborator gets the workspace's
              albums, including ones created later, unless excluded. */}
          {albums.length > 0 && (
            <View className="mt-6">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide ml-1">
                  Albums to share
                </Text>
                <Pressable
                  onPress={() =>
                    setSharedAlbumIds(
                      sharedAlbumIds.length === albums.length ? [] : albums.map((a) => a.id),
                    )
                  }
                  className="active:opacity-60"
                >
                  <Text className="text-primary text-xs font-bold">
                    {sharedAlbumIds.length === albums.length ? 'Clear all' : 'Select all'}
                  </Text>
                </Pressable>
              </View>

              <View
                className="bg-card rounded-2xl overflow-hidden"
                style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
              >
                {albums.map((a, i) => {
                  const on = sharedAlbumIds.includes(a.id);
                  return (
                    <Pressable
                      key={a.id}
                      onPress={() =>
                        setSharedAlbumIds((prev) =>
                          prev.includes(a.id) ? prev.filter((x) => x !== a.id) : [...prev, a.id],
                        )
                      }
                      className="px-4 py-3 flex-row items-center gap-3 active:bg-muted/30"
                      style={i < albums.length - 1 ? { borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' } : undefined}
                    >
                      <View
                        className="items-center justify-center rounded-md"
                        style={{
                          width: 20,
                          height: 20,
                          backgroundColor: on ? '#B66A40' : 'transparent',
                          borderWidth: on ? 0 : 1.5,
                          borderColor: isDark ? '#4A423C' : '#D9C2B7',
                        }}
                      >
                        {on && <CheckIcon size={13} className="text-white" />}
                      </View>
                      <Text className="text-foreground text-sm flex-1" numberOfLines={1}>
                        {a.name}
                      </Text>
                      <Text className="text-muted-foreground text-xs">
                        {a.item_count ?? 0}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {sharedAlbumIds.length === 0 && (
                <Text className="text-muted-foreground text-xs mt-2 ml-1">
                  They will join the workspace but see no albums yet.
                </Text>
              )}
            </View>
          )}

          {/* Sends immediately. This used to stage into a list, and the Send
              button only appeared once something had been staged — so picking a
              friend looked like it did nothing. */}
          <Pressable
            onPress={sendOne}
            disabled={!selectedFriendId || createCollaborator.isPending}
            className={`rounded-2xl py-3.5 items-center mt-4 flex-row justify-center gap-2 active:scale-[0.97] ${
              selectedFriendId ? 'bg-primary' : 'bg-muted'
            }`}
            style={
              selectedFriendId
                ? { shadowColor: '#B66A40', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 }
                : undefined
            }
          >
            {createCollaborator.isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <SendIcon size={16} className={selectedFriendId ? 'text-white' : 'text-muted-foreground'} />
            )}
            <Text className={`text-sm font-bold ${selectedFriendId ? 'text-white' : 'text-muted-foreground'}`}>
              {createCollaborator.isPending ? 'Sending…' : 'Send invitation'}
            </Text>
          </Pressable>
        </View>

      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
