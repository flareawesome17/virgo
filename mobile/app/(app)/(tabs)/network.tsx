import { View, Text, ScrollView, RefreshControl, Pressable, Image, TextInput, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useAuth,
  useCollaborators,
  useFriends,
  useRespondToFriendRequest,
  useSendFriendRequest,
  useTheme,
  useWorkspaces,
} from '@/src/hooks';
import { useState, useMemo } from 'react';
import { router } from 'expo-router';
import {
  SearchIcon,
  UserPlusIcon,
  MessageCircleIcon,
  MailIcon,
  ChevronRightIcon,
  UsersIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLACEHOLDER_IMAGE } from '@/src/lib/placeholder';

cssInterop(SearchIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MessageCircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MailIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UsersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

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

export default function NetworkScreen() {
  const [friendEmail, setFriendEmail] = useState('');
  const [friendError, setFriendError] = useState('');

  const sendRequest = useSendFriendRequest();
  const respond = useRespondToFriendRequest();

  // Requests addressed to me. `requested_by: 'them'` is the recipient's side of
  // the pair the server writes.
  const { friends: incoming, refetch: refetchIncoming } = useFriends({
    status: 'pending',
    requested_by: 'them',
    limit: 50,
  });

  const submitFriendRequest = () => {
    const email = friendEmail.trim();
    if (!email || sendRequest.isPending) return;
    sendRequest.mutate(email, {
      onSuccess: () => {
        setFriendEmail('');
        setFriendError('');
        Alert.alert('Request sent', `${email} will see it in their network.`);
      },
      // The API's messages are already user-facing ("You are already friends",
      // "No Virgo account uses that email address"), so they are shown as-is.
      onError: (err: any) =>
        setFriendError(err?.message || 'Could not send the request.'),
    });
  };

  const { user } = useAuth();
  const { isDark } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const enabled = { enabled: !!user?.id };

  const { collaborators, refetch: refetchCollaborators } = useCollaborators(
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
    await Promise.all([refetchCollaborators(), refetchWorkspaces(), refetchIncoming()]);
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
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
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
            tintColor={isDark ? '#C17745' : '#B66A40'}
          />
        }
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-2">
          <Text className="text-foreground text-[28px] font-bold tracking-tight">Network</Text>
          <Text className="text-muted-foreground text-sm mt-1">
            {collaborators.length} collaborators across {workspaces.length} workspaces
          </Text>
        </View>

        {/* Search */}
        <View className="px-5 pt-3 pb-2">
          <View className="flex-row items-center bg-card rounded-2xl px-4 h-11 gap-3" style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <SearchIcon size={16} className="text-muted-foreground" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search collaborators"
              placeholderTextColor="#A89489"
              className="text-foreground text-sm flex-1"
            />
          </View>
        </View>

        {/* Add a friend, inline. This used to push a separate screen; adding
            someone is a one-field action and belongs where the network is. */}
        <View className="px-5 pt-2 pb-4">
          <View
            className="bg-card rounded-2xl p-4"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 }}
          >
            <View className="flex-row items-center gap-4">
              <View className="w-12 h-12 rounded-2xl bg-primary/10 items-center justify-center">
                <UserPlusIcon size={22} className="text-primary" />
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-base font-semibold">Add a friend</Text>
                <Text className="text-muted-foreground text-xs mt-0.5">
                  Only friends can be added to workspaces and albums
                </Text>
              </View>
            </View>

            <View className="flex-row items-center gap-2 mt-3">
              <View className="flex-1 bg-muted rounded-xl px-3 py-2.5 flex-row items-center gap-2">
                <MailIcon size={14} className="text-muted-foreground" />
                <TextInput
                  value={friendEmail}
                  onChangeText={(t) => { setFriendEmail(t); setFriendError(''); }}
                  placeholder="their@email.com"
                  placeholderTextColor="#A89489"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onSubmitEditing={submitFriendRequest}
                  returnKeyType="send"
                  className="text-foreground text-sm flex-1"
                />
              </View>
              <Pressable
                onPress={submitFriendRequest}
                disabled={!friendEmail.trim() || sendRequest.isPending}
                className={`rounded-xl px-4 py-2.5 items-center justify-center active:scale-[0.96] ${
                  friendEmail.trim() ? 'bg-primary' : 'bg-muted'
                }`}
              >
                {sendRequest.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text className={`text-sm font-bold ${friendEmail.trim() ? 'text-white' : 'text-muted-foreground'}`}>
                    Send
                  </Text>
                )}
              </Pressable>
            </View>

            {friendError ? (
              <Text className="text-[#C76B4A] text-xs mt-2">{friendError}</Text>
            ) : null}
          </View>
        </View>

        {/* Incoming requests. Previously invisible: a request created no row
            for the recipient, so there was nothing here to show. */}
        {incoming.length > 0 && (
          <View className="px-5 pb-4">
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
              Friend requests
            </Text>
            <View
              className="bg-card rounded-2xl overflow-hidden"
              style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
            >
              {incoming.map((req, i) => (
                <View
                  key={req.id}
                  className="px-4 py-3 flex-row items-center gap-3"
                  style={i < incoming.length - 1 ? { borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' } : undefined}
                >
                  <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: '#B66A4018' }}>
                    <Text style={{ color: '#B66A40', fontWeight: '700' }}>
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
                    className="px-3 py-2 rounded-xl bg-primary active:scale-[0.94]"
                  >
                    <Text className="text-white text-xs font-bold">Accept</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Collaborator list grouped by workspace */}
        {groupKeys.length === 0 ? (
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
                <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px]">
                  {wsName}
                </Text>
              </View>
              <View className="mx-5 bg-card rounded-2xl overflow-hidden" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 }}>
                {grouped[wsName].map((collab, i) => {
                  const badge = ROLE_BADGE_COLORS[collab.role] || ROLE_BADGE_COLORS.editor;
                  return (
                    <Pressable
                      key={collab.id}
                      className="flex-row items-center gap-3 px-4 py-3.5 active:bg-muted/30"
                      style={
                        i < grouped[wsName].length - 1
                          ? { borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' }
                          : undefined
                      }
                    >
                      <Image
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
                            <Text style={{ color: badge.text, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                              {ROLE_LABELS[collab.role] || collab.role}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <View className="flex-row items-center gap-2">
                        <Pressable className="w-8 h-8 rounded-full bg-muted items-center justify-center active:scale-[0.92]">
                          <MessageCircleIcon size={14} className="text-muted-foreground" />
                        </Pressable>
                        <Pressable className="w-8 h-8 rounded-full bg-muted items-center justify-center active:scale-[0.92]">
                          <MailIcon size={14} className="text-muted-foreground" />
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
    </SafeAreaView>
  );
}
