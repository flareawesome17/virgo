import { View, Text, ScrollView, RefreshControl, Pressable, TextInput, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Modal } from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useAuth,
  useCollaborators,
  useCollaboratorAlbums,
  useDeleteCollaborator,
  useSetCollaboratorAlbums,
  useDeleteFriend,
  useFriends,
  useFriendPresence,
  useRespondToFriendRequest,
  useSendFriendRequest,
  usePeopleSearch,
  useTheme,
  useWorkspaces,
} from '@/src/hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  SearchIcon,
  UserPlusIcon,
  ChevronRightIcon,
  UsersIcon,
  CheckIcon,
  MapPinIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLACEHOLDER_IMAGE } from '@/src/lib/placeholder';
import { LoadFailed } from '@/components/LoadFailed';
import { AccessChip } from '@/components/WorkspaceInvitations';
import { lastSeenLabel, usePresence } from '@/src/lib/presence-store';
import type { Friend, MediaAccess } from '@/src/api';
import { PALETTES } from '@/theme';

cssInterop(SearchIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UsersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MapPinIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  photographer: 'Photographer',
  editor: 'Editor',
  reviewer: 'Reviewer',
  client: 'Client',
};

const ROLE_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  owner: { bg: '#B66A4018', text: '#B66A40' },
  photographer: { bg: '#8B5E3C18', text: '#8B5E3C' },
  editor: { bg: '#5B7B9A18', text: '#5B7B9A' },
  reviewer: { bg: '#C1774518', text: '#C17745' },
  client: { bg: '#6B8E4E18', text: '#6B8E4E' },
};

export default function NetworkScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const sendRequest = useSendFriendRequest();
  const respond = useRespondToFriendRequest();

  // Requests addressed to me. `requested_by: 'them'` is the recipient's side of
  // the pair the server writes.
  const { friends: incoming, refetch: refetchIncoming } = useFriends({
    status: 'pending',
    requested_by: 'them',
    limit: 50,
  });

  const addFriend = (userId: string) => {
    sendRequest.mutate(
      { userId },
      {
        onSuccess: () => Alert.alert('Request sent', 'They will see it in their network.'),
        // The API's messages are already user-facing ("You are already
        // friends", "They have already sent you a request"), so they are used
        // as written.
        onError: (err: any) =>
          Alert.alert('Could not send request', err?.message || 'Please try again.'),
      },
    );
  };

  /** Accepts from the search row, where only the account id is to hand. */
  const acceptFromSearch = (userId: string) => {
    const match = incoming.find((f) => f.friend_user_id === userId);
    if (!match) return;
    respond.mutate({ id: match.id, accept: true });
  };

  /*
   * useFriendPresence, not useFriends: it seeds the presence store from the
   * snapshot, which is what puts a live dot on each row.
   *
   * This was the home screen's job, through a second copy of the friend list
   * that sat above Quick Actions. Two lists of the same people, one to reach
   * them and one to manage them, and only the one you could not act on knew
   * who was around. There is one list now, and it is the one with the names.
   */
  const {
    friends: acceptedFriends,
    refetch: refetchFriends,
    loadFailed: friendsFailed,
  } = useFriendPresence();


  const removeFriend = useDeleteFriend();
  const removeCollaborator = useDeleteCollaborator();

  // Which collaborator's access is being edited, if any.
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [pickedAlbums, setPickedAlbums] = useState<Record<string, MediaAccess>>({});
  const { albums: accessAlbums, isFetching: loadingAccess } = useCollaboratorAlbums(
    editing?.id ?? null,
  );
  const saveAccess = useSetCollaboratorAlbums();

  // Seed the checkboxes from what they can see today, once per open.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (!editing || accessAlbums.length === 0) return;
    if (seededFor.current === editing.id) return;
    seededFor.current = editing.id;
    setPickedAlbums(
      Object.fromEntries(
        accessAlbums
          .filter((a) => a.shared)
          .map((a) => [a.id, a.media_access ?? 'view']),
      ),
    );
  }, [editing, accessAlbums]);

  const openAccessEditor = (id: string, name: string) => {
    seededFor.current = null;
    setPickedAlbums({});
    setEditing({ id, name });
  };

  const confirmRemoveCollaborator = (id: string, name: string) => {
    Alert.alert(
      'Remove collaborator',
      // Spells out the blast radius: workspace membership is what grants album
      // access, so removing it takes every album in that workspace with it.
      `${name} will lose access to this workspace and all of its albums. They stay in your friends, so you can invite them again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            removeCollaborator.mutate(id, {
              onError: (err: any) =>
                Alert.alert('Could not remove', err?.message || 'Please try again.'),
            }),
        },
      ],
    );
  };

  const confirmRemoveFriend = (id: string, name: string) => {
    Alert.alert(
      'Remove friend',
      // Says what survives, since removing a friend does not retract the
      // workspaces they were already added to.
      `${name} will no longer be in your friends. They stay on any workspace you already added them to — remove them there separately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeFriend.mutate(id),
        },
      ],
    );
  };

  const { user } = useAuth();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // The same box filters collaborators and finds people to add — searching
  // for someone is how you reach them, which is what this screen is for.
  const {
    people,
    isFetching: isSearching,
    loadFailed: peopleFailed,
    refetch: refetchPeople,
  } = usePeopleSearch(search);

  const enabled = { enabled: !!user?.id };

  const {
    collaborators,
    refetch: refetchCollaborators,
    loadFailed: collabFailed,
  } = useCollaborators(
    { orderBy: 'created_at', direction: 'desc', limit: 100 },
    enabled,
  );

  const { workspaces, refetch: refetchWorkspaces } = useWorkspaces(
    { limit: 100 },
    enabled,
  );

  const workspaceNameById = Object.fromEntries(workspaces.map((w) => [w.id, w.name]));

  const filtered = useMemo(() => {
    if (!search.trim()) return collaborators;
    const q = search.toLowerCase();
    return collaborators.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.role && c.role.toLowerCase().includes(q)) ||
        (workspaceNameById[c.workspace_id] || '').toLowerCase().includes(q)
    );
  }, [collaborators, search, workspaceNameById]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchCollaborators(), refetchWorkspaces(), refetchIncoming(), refetchFriends()]);
    setRefreshing(false);
  };

  // Group by workspace
  const grouped = useMemo(() => {
    const map: Record<string, typeof collaborators> = {};
    for (const c of filtered) {
      const wsName = workspaceNameById[c.workspace_id] || 'Unassigned';
      if (!map[wsName]) map[wsName] = [];
      map[wsName].push(c);
    }
    return map;
  }, [filtered, workspaceNameById]);

  const groupKeys = Object.keys(grouped);

  return (
    <SafeAreaView edges={embedded ? [] : ['top']} className="flex-1 bg-background">
      {/* Lifts the form above the keyboard. Without this the fields nearest
          the bottom sat underneath it on iOS with no way to scroll to them. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >

      <ScrollView keyboardShouldPersistTaps="handled"
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.primary}
          />
        }
      >
        {/* Header */}
        {!embedded && <View className="px-5 pt-4 pb-2 flex-row items-start justify-between gap-3">
          <View className="flex-1 min-w-0">
            <Text className="text-foreground text-[28px] font-bold tracking-tight">Network</Text>
            <Text className="text-muted-foreground text-sm mt-1">
              {collaborators.length} collaborators across {workspaces.length} workspaces
            </Text>
          </View>
          {/* Finding people by name only works if you already know it. Nearby
              is the other way in. */}
          <Pressable
            onPress={() => router.push('/discover/nearby')}
            accessibilityRole="button"
            className="min-h-11 flex-row items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary active:scale-[0.96]"
          >
            <MapPinIcon size={14} className="text-primary" />
            <Text className="text-primary text-xs font-bold">Nearby</Text>
          </Pressable>
        </View>}

        {/* Search */}
        <View className="px-5 pt-3 pb-2">
          <View className="flex-row items-center bg-secondary rounded-xl px-4 h-12 gap-3">
            <SearchIcon size={16} className="text-muted-foreground" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search people and collaborators"
              placeholderTextColor={palette.mutedForeground}
              className="text-foreground text-sm flex-1"
            />
          </View>
        </View>

        {/* People matching the search, with the relationship the server
            reports, so the button says what tapping it will do. */}
        {search.trim().length >= 2 && (
          <View className="px-5 pb-4">
            <Text className="text-foreground text-[13px] font-semibold mb-2 ml-1">
              People
            </Text>
            <View className="bg-card rounded-2xl overflow-hidden border border-border/30">
              {isSearching ? (
                <View className="px-4 py-5 items-center">
                  <ActivityIndicator size="small" color={palette.primary} />
                </View>
              ) : peopleFailed ? (
                <LoadFailed what="the search results" onRetry={() => refetchPeople()} compact />
              ) : people.length === 0 ? (
                <Text className="text-muted-foreground text-sm text-center py-5 px-4">
                  Nobody found. Search a name, or type their full email address.
                </Text>
              ) : (
                people.map((p, i) => (
                  <View
                    key={p.id}
                    className="px-4 py-3 flex-row items-center gap-3"
                    style={i < people.length - 1 ? { borderBottomWidth: 1, borderBottomColor: palette.border } : undefined}
                  >
                    {p.avatarUrl ? (
                      <RemoteImage source={{ uri: p.avatarUrl }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                    ) : (
                      <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: `${palette.primary}18` }}>
                        <Text style={{ color: palette.primary, fontWeight: '700' }}>
                          {p.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                        {p.email}
                      </Text>
                    </View>

                    {p.relationship === 'accepted' ? (
                      <View className="px-3 py-1.5 rounded-full bg-[#6B8E4E18]">
                        <Text className="text-[#6B8E4E] text-xs font-bold">Friends</Text>
                      </View>
                    ) : p.relationship === 'pending_out' ? (
                      <View className="px-3 py-1.5 rounded-full bg-muted">
                        <Text className="text-muted-foreground text-xs font-bold">Requested</Text>
                      </View>
                    ) : p.relationship === 'pending_in' ? (
                      <Pressable
                        onPress={() => acceptFromSearch(p.id)}
                        className="px-3 py-2 rounded-xl bg-action active:scale-[0.94]"
                      >
                        <Text className="text-white text-xs font-bold">Accept</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => addFriend(p.id)}
                        disabled={sendRequest.isPending}
                        className="px-3 py-2 rounded-xl bg-action flex-row items-center gap-1.5 active:scale-[0.94]"
                      >
                        <UserPlusIcon size={13} className="text-white" />
                        <Text className="text-white text-xs font-bold">Add</Text>
                      </Pressable>
                    )}
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        {/* Incoming requests. Previously invisible: a request created no row
            for the recipient, so there was nothing here to show. */}
        {incoming.length > 0 && (
          <View className="px-5 pb-4">
            <Text className="text-foreground text-[13px] font-semibold mb-2 ml-1">
              Friend requests
            </Text>
            <View className="bg-card rounded-2xl overflow-hidden border border-border/30">
              {incoming.map((req, i) => (
                <View
                  key={req.id}
                  className="px-4 py-3 flex-row items-center gap-3"
                  style={i < incoming.length - 1 ? { borderBottomWidth: 1, borderBottomColor: palette.border } : undefined}
                >
                  <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: `${palette.primary}18` }}>
                    <Text style={{ color: palette.primary, fontWeight: '700' }}>
                      {req.friend_name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                      {req.friend_name}
                    </Text>
                    <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                      {req.friend_email ?? 'wants to connect'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => respond.mutate({ id: req.id, accept: false })}
                    className="px-3 py-2 rounded-xl bg-muted active:scale-[0.94]"
                  >
                    <Text className="text-muted-foreground text-xs font-bold">Decline</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => respond.mutate({ id: req.id, accept: true })}
                    className="px-3 py-2 rounded-xl bg-action active:scale-[0.94]"
                  >
                    <Text className="text-white text-xs font-bold">Accept</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Friends. The screen listed collaborators but never the people you
            are connected to, so an accepted request had nowhere to show. */}
        {search.trim().length < 2 && (
          <View className="px-5 pb-4">
            <View className="flex-row items-center justify-between mb-2 ml-1">
              <Text className="text-foreground text-[13px] font-semibold">
                Friends
              </Text>
              <Text className="text-muted-foreground text-xs font-semibold">
                {acceptedFriends.length}
              </Text>
            </View>

            <View className="bg-card rounded-2xl overflow-hidden border border-border/30">
              {friendsFailed && acceptedFriends.length === 0 ? (
                <LoadFailed what="your friends" onRetry={() => refetchFriends()} compact />
              ) : acceptedFriends.length === 0 ? (
                <Text className="text-muted-foreground text-sm text-center py-5 px-4">
                  No friends yet. Search for someone above to connect.
                </Text>
              ) : (
                acceptedFriends.map((f, i) => (
                  <FriendRow
                    key={f.id}
                    friend={f}
                    borderColor={palette.border}
                    cardColor={palette.card}
                    last={i === acceptedFriends.length - 1}
                    onRemove={() => confirmRemoveFriend(f.id, f.friend_name)}
                  />
                ))
              )}
            </View>
          </View>
        )}

        {/* Collaborator list grouped by workspace */}
        {collabFailed && groupKeys.length === 0 ? (
          <View className="pt-8">
            <LoadFailed
              what="your collaborators"
              onRetry={() => refetchCollaborators()}
              compact
            />
          </View>
        ) : groupKeys.length === 0 ? (
          <View className="px-5 pt-8 items-center gap-4">
            <View className="w-16 h-16 rounded-full bg-muted items-center justify-center">
              <UsersIcon size={28} className="text-muted-foreground" />
            </View>
            <View className="items-center gap-1">
              <Text className="text-foreground text-lg font-bold">No collaborators yet</Text>
              <Text className="text-muted-foreground text-sm text-center px-8">
                Invite photographers, editors, and clients to your workspaces
              </Text>
            </View>
          </View>
        ) : (
          groupKeys.map((wsName) => (
            <View key={wsName} className="mb-5">
              <View className="px-5 mb-2">
                <Text className="text-foreground text-[13px] font-semibold">
                  {wsName}
                </Text>
              </View>
              <View className="mx-5 bg-card rounded-2xl overflow-hidden border border-border/30">
                {grouped[wsName].map((collab, i) => {
                  const badge = ROLE_BADGE_COLORS[collab.role] || ROLE_BADGE_COLORS.editor;
                  return (
                    <Pressable
                      key={collab.id}
                      className="flex-row items-center gap-3 px-4 py-3.5 active:bg-muted/30"
                      style={
                        i < grouped[wsName].length - 1
                          ? { borderBottomWidth: 1, borderBottomColor: palette.border }
                          : undefined
                      }
                    >
                      <RemoteImage
                        source={{
                          uri:
                            collab.avatar_url ||
                            PLACEHOLDER_IMAGE,
                        }}
                        style={{ width: 40, height: 40, borderRadius: 20 }}
                      />
                      <View className="flex-1 min-w-0">
                        <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                          {collab.name}
                        </Text>
                        <View className="flex-row items-center gap-2 mt-0.5">
                          <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: badge.bg }}>
                            <Text style={{ color: badge.text, fontSize: 11, fontWeight: '700' }}>
                              {ROLE_LABELS[collab.role] || collab.role}
                            </Text>
                          </View>
                          {/* An invitation not yet answered is not access. */}
                          {collab.status === 'pending' && (
                            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: '#A8948920' }}>
                              <Text style={{ color: '#8B7355', fontSize: 11, fontWeight: '700' }}>
                                Pending
                              </Text>
                            </View>
                          )}
                          {collab.status === 'declined' && (
                            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: '#C76B4A20' }}>
                              <Text style={{ color: '#C76B4A', fontSize: 11, fontWeight: '700' }}>
                                Declined
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                      {/* Replaces two icon buttons that had no onPress. Neither
                          editing access nor removing was reachable from the app
                          even though both existed in the API. */}
                      <View className="flex-row items-center gap-2">
                        <Pressable
                          onPress={() => openAccessEditor(collab.id, collab.name)}
                          className="px-3 py-2 rounded-xl bg-primary/10 active:scale-[0.94]"
                        >
                          <Text className="text-primary text-xs font-bold">Access</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => confirmRemoveCollaborator(collab.id, collab.name)}
                          className="px-3 py-2 rounded-xl bg-muted active:scale-[0.94]"
                        >
                          <Text className="text-muted-foreground text-xs font-bold">Remove</Text>
                        </Pressable>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </ScrollView>
          </KeyboardAvoidingView>

      {/* Edit which albums a collaborator can see. Unticking one removes it
          for them without touching the workspace or any other album. */}
      <Modal
        visible={!!editing}
        transparent
        animationType="slide"
        onRequestClose={() => setEditing(null)}
      >
        <Pressable
          className="flex-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onPress={() => setEditing(null)}
        />
        <View className="bg-card rounded-t-3xl px-5 pt-5" style={{ paddingBottom: 32 }}>
          <Text className="text-foreground text-lg font-bold">
            {editing?.name}&rsquo;s access
          </Text>
          <Text className="text-muted-foreground text-sm mt-1">
            Albums they can open in this workspace. New albums are shared
            automatically unless you untick them here.
          </Text>

          {loadingAccess && accessAlbums.length === 0 ? (
            <View className="py-8 items-center">
              <ActivityIndicator size="small" color={palette.primary} />
            </View>
          ) : accessAlbums.length === 0 ? (
            <Text className="text-muted-foreground text-sm text-center py-8">
              This workspace has no albums yet.
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 340 }} className="mt-4">
              {accessAlbums.map((a, i) => {
                const level = pickedAlbums[a.id];
                const on = level !== undefined;
                return (
                  <Pressable
                    key={a.id}
                    onPress={() =>
                      setPickedAlbums((prev) => {
                        const base = { ...prev };
                        if (base[a.id] === undefined) base[a.id] = 'view';
                        else delete base[a.id];
                        return base;
                      })
                    }
                    className="py-3 flex-row items-center gap-3 active:opacity-70"
                    style={i < accessAlbums.length - 1 ? { borderBottomWidth: 1, borderBottomColor: palette.border } : undefined}
                  >
                    <View
                      className="items-center justify-center rounded-md"
                      style={{
                        width: 22,
                        height: 22,
                        backgroundColor: on ? palette.action : 'transparent',
                        borderWidth: on ? 0 : 1.5,
                        borderColor: palette.border,
                      }}
                    >
                      {on && <CheckIcon size={14} className="text-white" />}
                    </View>
                    <Text className="text-foreground text-sm flex-1" numberOfLines={1}>
                      {a.name}
                    </Text>
                    {/* Only once it is actually shared: an access level on an
                        album nobody can open says nothing. */}
                    {on ? (
                      <AccessChip
                        value={level}
                        onChange={(next) =>
                          setPickedAlbums((prev) => ({ ...prev, [a.id]: next }))
                        }
                      />
                    ) : (
                      <Text className="text-muted-foreground text-xs">{a.item_count}</Text>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View className="flex-row gap-3 mt-5">
            <Pressable
              onPress={() => setEditing(null)}
              className="flex-1 bg-muted rounded-2xl py-3.5 items-center active:scale-[0.97]"
            >
              <Text className="text-foreground text-base font-semibold">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!editing) return;
                saveAccess.mutate(
                  {
                    id: editing.id,
                    albums: Object.entries(pickedAlbums).map(([album_id, media_access]) => ({
                      album_id,
                      media_access,
                    })),
                  },
                  {
                    onSuccess: () => setEditing(null),
                    onError: (err: any) =>
                      Alert.alert('Could not save', err?.message || 'Please try again.'),
                  },
                );
              }}
              disabled={saveAccess.isPending}
              className="flex-[2] bg-action rounded-2xl py-3.5 items-center flex-row justify-center gap-2 active:scale-[0.97]"
            >
              {saveAccess.isPending && <ActivityIndicator size="small" color="#FFFFFF" />}
              <Text className="text-white text-base font-bold">
                {saveAccess.isPending ? 'Saving…' : 'Save access'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/**
 * One friend, with whether they are around.
 *
 * Its own component because `usePresence` is a hook keyed on one person: this
 * way a friend coming online re-renders their row and nothing else, rather
 * than the whole list on every heartbeat.
 */
function FriendRow({
  friend,
  borderColor,
  cardColor,
  last,
  onRemove,
}: {
  friend: Friend;
  borderColor: string;
  cardColor: string;
  last: boolean;
  onRemove: () => void;
}) {
  const { online, lastSeenAt } = usePresence(friend.friend_user_id);
  // A friend added by name, with no account behind them yet, can never be
  // online — so they get no dot at all rather than a grey one implying they
  // are simply away.
  const hasAccount = !!friend.friend_user_id;

  return (
    <View
      className="px-4 py-3 flex-row items-center gap-3"
      style={
        last
          ? undefined
          : { borderBottomWidth: 1, borderBottomColor: borderColor }
      }
    >
      <View>
        {friend.friend_avatar_url ? (
          <RemoteImage
            source={{ uri: friend.friend_avatar_url }}
            style={{ width: 40, height: 40, borderRadius: 20 }}
          />
        ) : (
          <View
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: '#6B8E4E18' }}
          >
            <Text style={{ color: '#6B8E4E', fontWeight: '700' }}>
              {friend.friend_name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
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
          {hasAccount
            ? online
              ? 'Active now'
              : lastSeenLabel(lastSeenAt)
            : (friend.friend_email ?? '')}
        </Text>
      </View>

      <Pressable
        onPress={onRemove}
        className="px-3 py-2 rounded-xl bg-muted active:scale-[0.94]"
      >
        <Text className="text-muted-foreground text-xs font-bold">Remove</Text>
      </Pressable>
    </View>
  );
}
