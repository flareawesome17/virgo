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
              <View className="px-5 pt-2 pb-1">
                <View className="flex-row items-center bg-muted rounded-[14px] px-3.5 h-11 gap-2.5">
                  <SearchIcon size={18} className="text-muted-foreground" />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search workspaces"
                    placeholderTextColor={palette.mutedForeground}
                    className="flex-1 text-foreground text-[15px]"
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
                    // With how many each holds, so the choice is not a guess.
                    label={`${s.label} ${
                      s.key === 'all' ? workspaces.length : s.key === 'yours' ? yours.length : shared.length
                    }`}
                    accessibilityLabel={s.label}
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
            // One quiet group, in the rows Settings uses: these are places
            // to go, not work, so they do not look like workspaces.
            <View className="mx-5 mt-2 bg-card rounded-[20px] border border-border/40 overflow-hidden">
              {archivedCount > 0 ? (
                <Pressable
                  onPress={() => router.push('/workspaces/archived')}
                  accessibilityRole="button"
                  accessibilityLabel={`Archived, ${archivedCount}`}
                  className="min-h-[52px] flex-row items-center gap-3 pl-4 pr-3 active:bg-muted/40"
                >
                  <ArchiveIcon size={20} className="text-secondary-foreground" />
                  <Text className="text-foreground text-[15px] font-medium flex-1">Archived</Text>
                  <Text className="text-muted-foreground text-[14px]">{archivedCount}</Text>
                  <ChevronRightIcon size={16} className="text-muted-foreground" />
                </Pressable>
              ) : null}
              {deleted.length > 0 ? (
                <Pressable
                  onPress={() => router.push('/workspaces/deleted')}
                  accessibilityRole="button"
                  accessibilityLabel={`Recently deleted, ${deleted.length}`}
                  className={`min-h-[52px] flex-row items-center gap-3 pl-4 pr-3 active:bg-muted/40 ${
                    archivedCount > 0 ? 'border-t border-border/30' : ''
                  }`}
                >
                  <Trash2Icon size={20} className="text-secondary-foreground" />
                  <Text className="text-foreground text-[15px] font-medium flex-1">Recently deleted</Text>
                  <Text className="text-muted-foreground text-[14px]">{deleted.length}</Text>
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
