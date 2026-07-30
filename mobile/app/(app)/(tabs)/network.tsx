import { View, Text, ScrollView, RefreshControl, Pressable, Image, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp, useAuth, useTheme } from '@/src/hooks';
import { useState, useMemo } from 'react';
import {
  SearchIcon,
  UserPlusIcon,
  MessageCircleIcon,
  MailIcon,
  ChevronRightIcon,
  UsersIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

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
  const { client } = useApp();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const { data: collaborators = [] } = useQuery({
    queryKey: ['collaborators', user?.id],
    queryFn: async () => {
      const { data, error } = await client
        .from('collaborators')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: workspaces = [] } = useQuery({
    queryKey: ['workspaces', user?.id],
    queryFn: async () => {
      const { data, error } = await client
        .from('workspaces')
        .select('*')
        .eq('user_id', user?.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

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
    await queryClient.invalidateQueries({ queryKey: ['collaborators'] });
    await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
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
      <ScrollView
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

        {/* Quick invite */}
        <View className="px-5 pt-2 pb-4">
          <Pressable className="bg-card rounded-2xl p-4 flex-row items-center gap-4 active:scale-[0.98]" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 }}>
            <View className="w-12 h-12 rounded-2xl bg-primary/10 items-center justify-center">
              <UserPlusIcon size={22} className="text-primary" />
            </View>
            <View className="flex-1">
              <Text className="text-foreground text-base font-semibold">Invite Collaborators</Text>
              <Text className="text-muted-foreground text-xs mt-0.5">Share a workspace link via email or message</Text>
            </View>
            <ChevronRightIcon size={16} className="text-muted-foreground" />
          </Pressable>
        </View>

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
                          ? { borderBottomWidth: 1, borderBottomColor: '#F0E8E2' }
                          : undefined
                      }
                    >
                      <Image
                        source={{
                          uri:
                            collab.avatar_url ||
                            `https://picsum.photos/seed/${collab.id}/100/100`,
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
    </SafeAreaView>
  );
}
