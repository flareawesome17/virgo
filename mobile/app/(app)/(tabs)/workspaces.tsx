import { View, Text, FlatList, ScrollView, RefreshControl, Pressable, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppTopBar } from '@/components';
import { useAuth, useCollaboratorInvitations, useTheme, useWorkspaces, usePlanLimits } from '@/src/hooks';
import { useCallback, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { ArchiveIcon, ChevronRightIcon, FolderPlusIcon, PlusIcon, SearchIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { LoadFailed } from '@/components/LoadFailed';
import { WorkspaceInvitations } from '@/components/WorkspaceInvitations';
import { WorkspaceCard } from '@/components/WorkspaceCard';
import { PALETTES } from '@/theme';
import type { Workspace } from '@/src/api';

cssInterop(SearchIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(FolderPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ArchiveIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

type Scope = 'all' | 'yours' | 'shared';

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'yours', label: 'Yours' },
  { key: 'shared', label: 'Shared with you' },
];

export default function WorkspacesScreen() {
  const { guardWorkspaceCreate } = usePlanLimits();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const [refreshing, setRefreshing] = useState(false);
  const [scope, setScope] = useState<Scope>('all');
  const [query, setQuery] = useState('');

  // Newest activity first: the workspace something just happened in is the
  // one most likely to be wanted.
  const {
    workspaces,
    archivedCount,
    isLoading,
    loadFailed,
    refetch: refetchWorkspaces,
  } = useWorkspaces(
    { orderBy: 'last_activity_at', direction: 'desc', limit: 100 },
    { enabled: !!user?.id },
  );
  const { refetch: refetchInvitations } = useCollaboratorInvitations();

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchWorkspaces(), refetchInvitations()]);
    setRefreshing(false);
  };

  const { yours, shared } = useMemo(
    () => ({
      yours: workspaces.filter((w) => w.is_owner),
      shared: workspaces.filter((w) => !w.is_owner),
    }),
    [workspaces],
  );

  const renderItem = useCallback(
    ({ item }: { item: Workspace }) => <WorkspaceCard workspace={item} ring={palette.card} />,
    [palette.card],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inScope = scope === 'yours' ? yours : scope === 'shared' ? shared : workspaces;
    if (!q) return inScope;
    return inScope.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.description ?? '').toLowerCase().includes(q) ||
        w.owner.name.toLowerCase().includes(q),
    );
  }, [workspaces, yours, shared, query, scope]);

  const summary = [
    yours.length > 0 && `${yours.length} yours`,
    shared.length > 0 && `${shared.length} shared with you`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <AppTopBar />
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
        }
        ListHeaderComponent={
          <View>
            <View className="px-5 pt-4 pb-1 flex-row items-center justify-between">
              <View className="flex-1 min-w-0">
                <Text className="text-foreground text-[28px] font-bold tracking-tight">Workspaces</Text>
                {summary ? (
                  <Text className="text-muted-foreground text-sm mt-1">{summary}</Text>
                ) : null}
              </View>
              <Pressable
                onPress={guardWorkspaceCreate(() => router.push('/workspaces/create'))}
                accessibilityRole="button"
                accessibilityLabel="Create a workspace"
                className="w-11 h-11 rounded-xl bg-action items-center justify-center active:scale-[0.96]"
              >
                <PlusIcon size={20} className="text-action-foreground" />
              </Pressable>
            </View>

            {/* Under the title, above the list it would join: an invitation is
                the one thing on this screen waiting on somebody else. */}
            <WorkspaceInvitations />

            {workspaces.length > 0 && (
              <View className="px-5 pt-3 pb-1">
                <View className="flex-row items-center bg-secondary rounded-xl px-4 h-11 gap-3">
                  <SearchIcon size={16} className="text-muted-foreground" />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search workspaces"
                    placeholderTextColor={palette.mutedForeground}
                    className="flex-1 text-foreground text-sm"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    clearButtonMode="while-editing"
                    accessibilityLabel="Search workspaces"
                  />
                </View>
              </View>
            )}

            {/* Only when there is something to tell apart: a filter with one
                side empty is a control that does nothing. */}
            {yours.length > 0 && shared.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingVertical: 10 }}
              >
                {SCOPES.map((s) => {
                  const on = s.key === scope;
                  return (
                    <Pressable
                      key={s.key}
                      onPress={() => setScope(s.key)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                      className={`h-9 rounded-full px-4 justify-center active:scale-[0.98] ${
                        on ? 'bg-foreground' : 'bg-card border border-border'
                      }`}
                    >
                      <Text className={`text-[13px] ${on ? 'text-background font-bold' : 'text-foreground font-medium'}`}>
                        {s.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            <View className="h-2" />
          </View>
        }
        ListFooterComponent={
          archivedCount > 0 ? (
            <Pressable
              onPress={() => router.push('/workspaces/archived')}
              accessibilityRole="button"
              className="mx-5 mt-1 flex-row items-center gap-2 px-4 py-3 rounded-2xl bg-secondary active:scale-[0.98]"
            >
              <ArchiveIcon size={16} className="text-secondary-foreground" />
              <Text className="text-secondary-foreground text-sm font-semibold flex-1">
                Archived · {archivedCount}
              </Text>
              <ChevronRightIcon size={16} className="text-muted-foreground" />
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          // "No workspaces yet" on a failed request tells someone their own
          // work is gone. It is not, and saying so is the worst kind of wrong.
          isLoading ? null : loadFailed ? (
            <View className="pt-8">
              <LoadFailed what="your workspaces" onRetry={() => refetchWorkspaces()} compact />
            </View>
          ) : workspaces.length > 0 ? (
            // Filtered down to nothing, which is not the same as having none.
            <View className="px-5 pt-8 items-center gap-3">
              <View className="w-16 h-16 rounded-full bg-muted items-center justify-center">
                <SearchIcon size={26} className="text-muted-foreground" />
              </View>
              <Text className="text-foreground text-lg font-bold">Nothing matches</Text>
              <Text className="text-muted-foreground text-sm text-center px-8">
                {query.trim() ? `No workspace matches “${query.trim()}”.` : 'Nothing here yet.'}
              </Text>
              <Pressable
                onPress={() => {
                  setQuery('');
                  setScope('all');
                }}
                className="bg-card rounded-2xl px-5 py-3 active:scale-[0.96]"
                style={{ borderWidth: 1, borderColor: palette.border }}
              >
                <Text className="text-foreground text-sm font-semibold">Show all</Text>
              </Pressable>
            </View>
          ) : (
            <View className="px-5 pt-8 items-center gap-4">
              <View className="w-16 h-16 rounded-full bg-muted items-center justify-center">
                <FolderPlusIcon size={28} className="text-muted-foreground" />
              </View>
              <View className="items-center gap-1">
                <Text className="text-foreground text-lg font-bold">No workspaces yet</Text>
                <Text className="text-muted-foreground text-sm text-center px-8">
                  A workspace holds the albums, schedule and people for one client.
                </Text>
              </View>
              <Pressable
                onPress={guardWorkspaceCreate(() => router.push('/workspaces/create'))}
                className="bg-action rounded-2xl px-6 py-3.5 flex-row items-center gap-2 active:scale-[0.96]"
              >
                <PlusIcon size={18} className="text-white" />
                <Text className="text-white text-sm font-semibold">Create a workspace</Text>
              </Pressable>
            </View>
          )
        }
        renderItem={renderItem}
      />
    </SafeAreaView>
  );
}
