import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Switch,
  TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ROLE_DEFAULT_ACCESS, type CollaboratorRole, type MediaAccess } from '@/src/api';
import {
  useAlbums,
  useCreateCollaborator,
  useFriends,
  useTheme,
  useWorkspace,
  useWorkspaceMembers,
} from '@/src/hooks';
import { useLocalSearchParams, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ArrowLeftIcon, CheckIcon, ChevronDownIcon, SearchIcon, SendIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { LoadFailed } from '@/components/LoadFailed';
import { ChoiceSheet, PersonAvatar } from '@/components/WorkspaceBits';
import {
  ACCESS_HINT,
  ACCESS_LABEL,
  ACCESS_LEVELS,
  INVITE_ROLES,
  ROLE_BLURB,
  ROLE_LABEL,
  firstName,
  plural,
} from '@/src/lib/workspaces';
import { PALETTES } from '@/theme';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(SendIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronDownIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(SearchIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

type Level = MediaAccess | 'none';

/**
 * Invites a friend onto a workspace, saying exactly what they will get.
 *
 * The role says what it gives — "Upload by default" — and the albums are
 * chosen here, at the one moment you know what this person is for, along with
 * whether albums made later reach them too.
 *
 * Send waits for the album list. It did not: "every album" was sent as
 * whatever had loaded by then, which on a slow connection was none of them.
 * Someone who declined can be asked again from here (`?person=`).
 */
export default function InviteCollaboratorsScreen() {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const insets = useSafeAreaInsets();
  const { id, person } = useLocalSearchParams<{ id: string; person?: string }>();

  const { data: workspace } = useWorkspace(id);
  const { friends, isLoading: loadingFriends, loadFailed, refetch } = useFriends({ status: 'accepted', limit: 100 });
  const { members } = useWorkspaceMembers(id);
  const albumsQuery = useAlbums({ workspace_id: id, orderBy: 'created_at', direction: 'desc', limit: 100 }, { enabled: !!id });
  const albums = albumsQuery.albums;
  const create = useCreateCollaborator();

  const [search, setSearch] = useState('');
  const [friendId, setFriendId] = useState<string | null>(person || null);
  const [role, setRole] = useState<CollaboratorRole>('photographer');
  const [mode, setMode] = useState<'all' | 'choose'>('all');
  const [chosen, setChosen] = useState<Record<string, Level>>({});
  const [later, setLater] = useState(true);
  const [choosing, setChoosing] = useState<string | null>(null);

  /** Where each friend stands with this workspace already. */
  const standing = useMemo(() => {
    const map = new Map<string, 'here' | 'invited' | 'declined'>();
    for (const m of members) {
      if (!m.user_id) continue;
      map.set(m.user_id, m.status === 'declined' ? 'declined' : m.status === 'pending' ? 'invited' : 'here');
    }
    return map;
  }, [members]);

  const q = search.trim().toLowerCase();
  const people = friends
    .filter((f) => f.friend_user_id)
    .filter(
      (f) => !q || f.friend_name.toLowerCase().includes(q) || (f.friend_email ?? '').toLowerCase().includes(q),
    );
  const friend = friends.find((f) => f.friend_user_id === friendId) ?? null;
  const who = friend ? firstName(friend.friend_name) : 'they';
  const level = ROLE_DEFAULT_ACCESS[role];

  const grants =
    mode === 'all'
      ? albums.map((a) => ({ album_id: a.id, media_access: level }))
      : Object.entries(chosen)
          .filter((entry): entry is [string, MediaAccess] => entry[1] !== 'none')
          .map(([album_id, media_access]) => ({ album_id, media_access }));

  const ready = !!friend && albumsQuery.isSuccess && !create.isPending;

  const send = () => {
    if (!friend?.friend_user_id || !ready) return;
    create.mutate(
      {
        workspace_id: id,
        collaborator_user_id: friend.friend_user_id,
        name: friend.friend_name,
        avatar_url: friend.friend_avatar_url,
        role,
        albums: grants,
        new_album_access: later ? level : null,
      },
      {
        onSuccess: () =>
          Alert.alert(
            'Invitation sent',
            `${firstName(friend.friend_name)} sees it in Workspaces, with exactly what you are sharing, and can accept it there.`,
            [{ text: 'Done', onPress: () => router.back() }],
          ),
        onError: (err: Error) => Alert.alert('Could not invite', err.message),
      },
    );
  };

  const choosingAlbum = choosing ? albums.find((a) => a.id === choosing) : null;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      {/* Lifts the search above the keyboard on iOS. */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <View className="px-2 pt-1 flex-row items-center gap-1">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            className="w-11 h-11 items-center justify-center active:opacity-60"
          >
            <ArrowLeftIcon size={20} className="text-foreground" />
          </Pressable>
          <Text className="text-foreground text-[17px] font-semibold flex-1" numberOfLines={1}>
            Invite to {workspace?.name ?? 'workspace'}
          </Text>
        </View>

        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 32, gap: 20 }}
        >
          <View className="gap-2">
            <Text className="text-muted-foreground text-xs mx-1">
              Friends only. Nothing is shared until they accept.
            </Text>
            <View className="flex-row items-center bg-secondary rounded-xl px-4 h-11 gap-3">
              <SearchIcon size={16} className="text-muted-foreground" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search your friends"
                placeholderTextColor={palette.mutedForeground}
                className="flex-1 text-foreground text-sm"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Search your friends"
              />
            </View>
            <View className="bg-card rounded-2xl border border-border/40 overflow-hidden">
              {loadingFriends ? (
                <ActivityIndicator className="py-6" />
              ) : loadFailed && friends.length === 0 ? (
                <LoadFailed what="your friends" onRetry={() => refetch()} compact />
              ) : friends.length === 0 ? (
                <Pressable
                  onPress={() => router.push('/(app)/(tabs)/connect?view=people')}
                  className="px-4 py-5 items-center active:opacity-70"
                >
                  <Text className="text-foreground text-sm font-semibold">No friends yet</Text>
                  <Text className="text-muted-foreground text-xs mt-1 text-center">
                    You can invite people you are friends with. Find them on Network first.
                  </Text>
                  <Text className="text-primary text-xs font-bold mt-3">Go to Network</Text>
                </Pressable>
              ) : people.length === 0 ? (
                <Text className="text-muted-foreground text-sm text-center py-5">
                  No friends match “{search.trim()}”.
                </Text>
              ) : (
                people.map((f, i) => {
                  const state = standing.get(f.friend_user_id!);
                  const disabled = state === 'here' || state === 'invited';
                  const picked = friendId === f.friend_user_id;
                  const note =
                    state === 'here'
                      ? 'Already here'
                      : state === 'invited'
                        ? 'Invited already'
                        : state === 'declined'
                          ? 'Declined last time — you can ask again'
                          : f.friend_email;
                  return (
                    <Pressable
                      key={f.id}
                      onPress={() => setFriendId(picked ? null : f.friend_user_id)}
                      disabled={disabled}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: picked, disabled }}
                      className={`px-3.5 py-3 flex-row items-center gap-3 ${picked ? 'bg-secondary' : ''}`}
                      style={[
                        i > 0 ? { borderTopWidth: 1, borderTopColor: palette.border } : {},
                        disabled ? { opacity: 0.5 } : {},
                      ]}
                    >
                      <PersonAvatar name={f.friend_name} url={f.friend_avatar_url} size={36} />
                      <View className="flex-1 min-w-0">
                        <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                          {f.friend_name}
                        </Text>
                        {note ? (
                          <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                            {note}
                          </Text>
                        ) : null}
                      </View>
                      {picked && <CheckIcon size={18} className="text-primary" />}
                    </Pressable>
                  );
                })
              )}
            </View>
          </View>

          <View className="gap-2">
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[1.5px] mx-1">Role</Text>
            <View className="flex-row flex-wrap gap-2">
              {INVITE_ROLES.map((r) => {
                const on = r === role;
                return (
                  <Pressable
                    key={r}
                    onPress={() => setRole(r)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    className={`rounded-2xl px-3 py-2.5 border-[1.5px] ${on ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}
                    style={{ width: '48.5%' }}
                  >
                    <Text className="text-foreground text-sm font-semibold">{ROLE_LABEL[r]}</Text>
                    <Text className="text-muted-foreground text-xs mt-0.5">{ROLE_BLURB[r]}</Text>
                    <Text className="text-secondary-foreground text-[11px] font-bold mt-1">
                      {ACCESS_LABEL[ROLE_DEFAULT_ACCESS[r]]} by default
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View className="gap-2">
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[1.5px] mx-1">Albums</Text>
            {albumsQuery.isLoading ? (
              <ActivityIndicator className="py-4" />
            ) : albums.length === 0 ? (
              <Text className="text-muted-foreground text-sm mx-1">This workspace has no albums yet.</Text>
            ) : (
              <View className="bg-card rounded-2xl border border-border/40 overflow-hidden">
                {(
                  [
                    [
                      'all',
                      albums.length === 1
                        ? `${albums[0].name}, at ${ACCESS_LABEL[level]}`
                        : `All ${plural(albums.length, 'album')}, at ${ACCESS_LABEL[level]}`,
                    ],
                    ['choose', `Choose albums and what ${who} can do in each`],
                  ] as ['all' | 'choose', string][]
                ).map(([value, label], i) => {
                  const on = mode === value;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => setMode(value)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      className="flex-row items-center gap-3 px-3.5 py-3"
                      style={i > 0 ? { borderTopWidth: 1, borderTopColor: palette.border } : undefined}
                    >
                      <View
                        className="w-5 h-5 rounded-full items-center justify-center"
                        style={{ borderWidth: 2, borderColor: on ? palette.primary : palette.border }}
                      >
                        {on && <View className="w-2.5 h-2.5 rounded-full bg-primary" />}
                      </View>
                      <Text className="text-foreground text-sm flex-1">{label}</Text>
                    </Pressable>
                  );
                })}
                {mode === 'choose' &&
                  albums.map((album) => {
                    const value = chosen[album.id] ?? 'none';
                    return (
                      <Pressable
                        key={album.id}
                        onPress={() => setChoosing(album.id)}
                        accessibilityRole="button"
                        className="flex-row items-center gap-2.5 pl-11 pr-3.5 py-3 active:opacity-70"
                        style={{ borderTopWidth: 1, borderTopColor: palette.border }}
                      >
                        <Text className="text-foreground text-sm flex-1" numberOfLines={1}>
                          {album.name}
                        </Text>
                        <Text className={`text-[13px] font-semibold ${value === 'none' ? 'text-muted-foreground' : 'text-foreground'}`}>
                          {value === 'none' ? 'Can’t see' : ACCESS_LABEL[value]}
                        </Text>
                        <ChevronDownIcon size={16} className="text-muted-foreground" />
                      </Pressable>
                    );
                  })}
              </View>
            )}
            <View className="flex-row items-center gap-3 px-3.5 py-3 rounded-2xl bg-secondary">
              <View className="flex-1">
                <Text className="text-foreground text-[13px] font-semibold">Also share albums I add later</Text>
                <Text className="text-muted-foreground text-xs mt-0.5">
                  {later ? `At ${ACCESS_LABEL[level]}, as soon as you make them` : 'They stay private until you share them'}
                </Text>
              </View>
              <Switch value={later} onValueChange={setLater} accessibilityLabel="Also share albums I add later" />
            </View>
          </View>

          <Text className="text-muted-foreground text-xs mx-1">
            {friend
              ? `${who} gets a notification and an email, and sees exactly what you are sharing before accepting.`
              : 'They get a notification and an email, and see exactly what you are sharing before accepting.'}
          </Text>

          <Pressable
            onPress={send}
            disabled={!ready}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready }}
            className={`h-[50px] rounded-2xl flex-row items-center justify-center gap-2 ${ready ? 'bg-action' : 'bg-muted'}`}
          >
            {create.isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <SendIcon size={16} className={ready ? 'text-white' : 'text-muted-foreground'} />
            )}
            <Text className={`text-base font-bold ${ready ? 'text-white' : 'text-muted-foreground'}`}>
              {create.isPending ? 'Sending…' : 'Send invite'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <ChoiceSheet<Level>
        visible={!!choosingAlbum}
        title={choosingAlbum ? `What ${who} can do in ${choosingAlbum.name}` : ''}
        options={[
          { value: 'none', label: 'Can’t see it' },
          ...ACCESS_LEVELS.map((l) => ({ value: l as Level, label: ACCESS_LABEL[l], description: ACCESS_HINT[l] })),
        ]}
        value={choosingAlbum ? (chosen[choosingAlbum.id] ?? 'none') : null}
        onChoose={(value) => choosingAlbum && setChosen((prev) => ({ ...prev, [choosingAlbum.id]: value }))}
        onClose={() => setChoosing(null)}
      />
    </SafeAreaView>
  );
}
