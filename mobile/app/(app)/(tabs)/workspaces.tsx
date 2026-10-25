import { View, Text, ScrollView, RefreshControl, Pressable, TextInput } from 'react-native';
import Animated from 'react-native-reanimated';
import {
  CardListSkeleton,
  EmptyState,
  FilterChip,
  TabScreen,
  useTabBottomInset,
} from '@/components';
import {
  useAuth,
  useCollaboratorInvitations,
  useDeletedWorkspaces,
  useTheme,
  useWorkspaces,
  usePlanLimits,
} from '@/src/hooks';
import { useChromeScroll } from '@/src/providers/ChromeProvider';
import { useCallback, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { ArchiveIcon, ChevronRightIcon, FolderPlusIcon, SearchIcon, Trash2Icon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { LoadFailed } from '@/components/LoadFailed';
import { WorkspaceInvitations } from '@/components/WorkspaceInvitations';
import { WorkspaceCard } from '@/components/WorkspaceCard';
import { PALETTES } from '@/theme';
import type { Workspace } from '@/src/api';

cssInterop(SearchIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(FolderPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ArchiveIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(Trash2Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

type Scope = 'all' | 'yours' | 'shared';

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'yours', label: 'Yours' },
  { key: 'shared', label: 'Shared with you' },
];

export default function WorkspacesScreen() {
  const onScroll = useChromeScroll();
  const bottomInset = useTabBottomInset();
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
  // Under the list, like the archive, so a workspace deleted by mistake is
  // found where it was rather than in Settings.
  const { workspaces: deleted } = useDeletedWorkspaces({ enabled: !!user?.id });

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

  return (
    <TabScreen title="Workspaces" create="workspace">
      <Animated.FlatList
        onScroll={onScroll}
        scrollEventThrottle={16}
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: bottomInset }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
        }
        ListHeaderComponent={
          <View>
            {/* First, above the list it would join: an invitation is the one
                thing on this screen waiting on somebody else. The screen's
                name is in the top bar, and making one is its +. */}
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
                {SCOPES.map((s) => (
                  <FilterChip
                    key={s.key}
                    label={s.label}
                    on={s.key === scope}
                    onPress={() => setScope(s.key)}
                  />
                ))}
              </ScrollView>
            )}
            <View className="h-2" />
          </View>
        }
        ListFooterComponent={
          archivedCount > 0 || deleted.length > 0 ? (
            <View className="gap-2">
              {archivedCount > 0 ? (
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
              ) : null}
              {deleted.length > 0 ? (
                <Pressable
                  onPress={() => router.push('/workspaces/deleted')}
                  accessibilityRole="button"
                  className="mx-5 mt-1 flex-row items-center gap-2 px-4 py-3 rounded-2xl bg-secondary active:scale-[0.98]"
                >
                  <Trash2Icon size={16} className="text-secondary-foreground" />
                  <Text className="text-secondary-foreground text-sm font-semibold flex-1">
                    Recently deleted · {deleted.length}
                  </Text>
                  <ChevronRightIcon size={16} className="text-muted-foreground" />
                </Pressable>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          // "No workspaces yet" on a failed request tells someone their own
          // work is gone. It is not, and saying so is the worst kind of wrong.
          // A placeholder in the list's own shape while it loads. It was null,
          // which left the screen empty under the bar until it all arrived.
          isLoading ? (
            <CardListSkeleton />
          ) : loadFailed ? (
            <View className="pt-8">
              <LoadFailed what="your workspaces" onRetry={() => refetchWorkspaces()} compact />
            </View>
          ) : workspaces.length > 0 ? (
            // Filtered down to nothing, which is not the same as having none.
            <EmptyState
              icon={SearchIcon}
              title="Nothing matches"
              body={query.trim() ? `No workspace matches “${query.trim()}”.` : 'Nothing here yet.'}
              secondary={{
                label: 'Show all',
                onPress: () => {
                  setQuery('');
                  setScope('all');
                },
              }}
            />
          ) : (
            <EmptyState
              icon={FolderPlusIcon}
              title="No workspaces yet"
              body="A workspace holds the albums, schedule and people for one client."
              action={{
                label: 'Create a workspace',
                onPress: guardWorkspaceCreate(() => router.push('/workspaces/create')),
              }}
            />
          )
        }
        renderItem={renderItem}
      />
    </TabScreen>
  );
}
