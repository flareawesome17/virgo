import { View, Text, FlatList, ScrollView, RefreshControl, Pressable, Image, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppTopBar } from '@/components';
import { useAuth, useCollaborators, useTheme, useWorkspaces,
  usePlanLimits,
} from '@/src/hooks';
import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import {
  SearchIcon,
  PlusIcon,
  ImageIcon,
  UsersIcon,
  FolderPlusIcon,
  WifiIcon,
  ClockIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { LoadFailed } from '@/components/LoadFailed';
import { WorkspaceInvitations } from '@/components/WorkspaceInvitations';
import { PALETTES } from '@/theme';

cssInterop(SearchIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ImageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UsersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(FolderPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(WifiIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ClockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const CATEGORIES = ['All', 'Shared', 'Private'];

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function AvatarStack({ urls, count, borderColor, fillColor }: { urls: string[]; count: number; borderColor: string; fillColor: string }) {
  const display = urls.slice(0, 4);
  const extra = count - display.length;
  return (
    <View className="flex-row">
      {display.map((url, i) => (
        <Image
          key={i}
          source={{ uri: url }}
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            marginLeft: i > 0 ? -9 : 0,
            borderWidth: 2,
            borderColor,
          }}
        />
      ))}
      {extra > 0 && (
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            marginLeft: -9,
            borderWidth: 2,
            borderColor,
            backgroundColor: fillColor,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text className="text-[11px] font-bold text-muted-foreground">+{extra}</Text>
        </View>
      )}
    </View>
  );
}

export default function WorkspacesScreen() {
  const { guardWorkspaceCreate } = usePlanLimits();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [query, setQuery] = useState('');

  // The API scopes every row to the authenticated user, so there is no longer
  // a user_id filter to pass — the JWT is the filter.
  const {
    workspaces,
    isLoading,
    loadFailed,
    refetch: refetchWorkspaces,
  } = useWorkspaces(
    { orderBy: 'updated_at', direction: 'desc', limit: 50 },
    { enabled: !!user?.id },
  );

  // Fetch all collaborators for avatar stacks. Limit is explicit because the
  // API defaults to 50, and these span every workspace rather than one.
  const { collaborators, refetch: refetchCollaborators } = useCollaborators(
    { limit: 100 },
    { enabled: !!user?.id },
  );

  // Build avatar map per workspace
  const avatarMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const c of collaborators) {
      if (!map[c.workspace_id]) map[c.workspace_id] = [];
      if (c.avatar_url) map[c.workspace_id].push(c.avatar_url);
    }
    return map;
  }, [collaborators]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchWorkspaces(), refetchCollaborators()]);
    setRefreshing(false);
  };

  /*
   * The search box and the pills filter the list, which they did not before.
   *
   * All three controls up there were decorative: the search box was a <Text>
   * rather than a TextInput, the pills set state nothing read, and the button
   * beside them had no onPress at all. The list rendered `workspaces` raw.
   *
   * The old pills were All / Active / Archived / Shared, and two of those can
   * never work — a workspace has no archived flag and no notion of active, so
   * there was nothing to filter on even if the wiring had existed. These three
   * come straight off the data: a workspace is shared when somebody else can
   * see it, and private when nobody can.
   */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workspaces.filter((w) => {
      if (activeCategory === 'Shared' && (w.collaborator_count || 0) === 0) return false;
      if (activeCategory === 'Private' && (w.collaborator_count || 0) > 0) return false;
      if (!q) return true;
      return (
        w.name.toLowerCase().includes(q) ||
        (w.description ?? '').toLowerCase().includes(q)
      );
    });
  }, [workspaces, query, activeCategory]);

  // Totals describe everything you have, not the current filter — they sit in
  // a summary card that should not change as you type.
  const totalAssets = workspaces.reduce((s, w) => s + (w.media_count || 0), 0);
  const totalCollabs = workspaces.reduce((s, w) => s + (w.collaborator_count || 0), 0);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <AppTopBar />
      <FlatList
        data={visible}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.primary}
          />
        }
        ListHeaderComponent={
          <View>
            {/* Header */}
            <View className="px-5 pt-4 pb-1 flex-row items-center justify-between">
              <View>
                <Text className="text-foreground text-[28px] font-bold tracking-tight">
                  Workspaces
                </Text>
                <Text className="text-muted-foreground text-sm mt-1">
                  {workspaces.length} spaces · {totalAssets.toLocaleString()} assets · {totalCollabs}{' '}
                  collaborators
                </Text>
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

            {/* Under the title, above the list it will join: an invitation is
                the one thing on this screen waiting on somebody else. */}
            <WorkspaceInvitations />

            {/* Search. The sliders button that sat beside this opened nothing
                and is gone — the pills below are the filter, and two controls
                for one job, one of them inert, is worse than one that works. */}
            <View className="px-5 pt-3 pb-2">
              <View
                className="flex-row items-center bg-secondary rounded-xl px-4 h-12 gap-3"
              >
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
                />
              </View>
            </View>

            {/* Category pills */}
            <ScrollViewPills
              categories={CATEGORIES}
              active={activeCategory}
              onSelect={setActiveCategory}
            />

            {/* Summary card */}
            <View
              className="mx-5 mb-4 bg-secondary rounded-2xl p-4 flex-row items-center gap-4"
            >
              <View className="w-11 h-11 rounded-2xl bg-primary/10 items-center justify-center">
                <ImageIcon size={20} className="text-primary" />
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-base font-bold">
                  {totalAssets.toLocaleString()}
                </Text>
                <Text className="text-muted-foreground text-xs">Total assets</Text>
              </View>
              <View className="w-11 h-11 rounded-2xl bg-primary/10 items-center justify-center">
                <UsersIcon size={20} className="text-primary" />
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-base font-bold">{totalCollabs}</Text>
                <Text className="text-muted-foreground text-xs">Collaborators</Text>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          // "No workspaces yet" on a failed request tells someone their own
          // work is gone. It is not, and saying so is the worst kind of wrong.
          loadFailed ? (
            <View className="pt-8">
              <LoadFailed
                what="your workspaces"
                onRetry={() => refetchWorkspaces()}
                compact
              />
            </View>
          ) : workspaces.length > 0 ? (
            /*
             * Filtered down to nothing, which is not the same as having none.
             *
             * Now that the search and the pills actually filter, the empty
             * state below became reachable with a full account behind it —
             * somebody searching for a name they mistyped would be told they
             * have no workspaces and invited to create their first. That is
             * the same lie the loadFailed branch above exists to prevent.
             */
            <View className="px-5 pt-8 items-center gap-3">
              <View className="w-16 h-16 rounded-full bg-muted items-center justify-center">
                <SearchIcon size={26} className="text-muted-foreground" />
              </View>
              <Text className="text-foreground text-lg font-bold">Nothing matches</Text>
              <Text className="text-muted-foreground text-sm text-center px-8">
                {query.trim()
                  ? `No workspace matches “${query.trim()}”.`
                  : `You have no ${activeCategory.toLowerCase()} workspaces.`}
              </Text>
              <Pressable
                onPress={() => {
                  setQuery('');
                  setActiveCategory('All');
                }}
                className="bg-card rounded-2xl px-5 py-3 active:scale-[0.96]"
                style={{ borderWidth: 1, borderColor: palette.border }}
              >
                <Text className="text-foreground text-sm font-semibold">Clear filters</Text>
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
                Create your first workspace to organize shoots, edits, and deliveries
              </Text>
            </View>
            <Pressable
              onPress={guardWorkspaceCreate(() => router.push('/workspaces/create'))}
              className="bg-action rounded-2xl px-6 py-3.5 flex-row items-center gap-2 active:scale-[0.96]"
            >
              <PlusIcon size={18} className="text-white" />
              <Text className="text-white text-sm font-semibold">Create Workspace</Text>
            </Pressable>
          </View>
          )
        }
        renderItem={({ item }) => {
          const avatars = avatarMap[item.id] || [];
          return (
            <Pressable
              onPress={() => router.push(`/workspaces/${item.id}`)}
              className="mx-5 mb-3 bg-card rounded-2xl p-4 border border-border/30 active:scale-[0.98]"
            >
              {/* Top row: icon + info + sync badge */}
              <View className="flex-row items-center gap-4">
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 16,
                    backgroundColor: item.accent_color
                      ? `${item.accent_color}18`
                      : `${palette.primary}18`,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: '700',
                      color: item.accent_color || palette.primary,
                    }}
                  >
                    {item.name.charAt(0)}
                  </Text>
                </View>
                <View className="flex-1 min-w-0">
                  <View className="flex-row items-center gap-2">
                    <Text
                      className="text-foreground text-base font-semibold"
                      numberOfLines={1}
                      style={{ flexShrink: 1 }}
                    >
                      {item.name}
                    </Text>
                    {/* Offline sync badge */}
                    <View
                      style={{
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 5,
                        backgroundColor: '#6B8E4E18',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 3,
                      }}
                    >
                      <WifiIcon size={11} color="#6B8E4E" />
                      <Text style={{ color: '#6B8E4E', fontSize: 11, fontWeight: '600' }}>
                        Synced
                      </Text>
                    </View>
                  </View>
                  {item.description ? (
                    <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                      {item.description}
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* Bottom row: stats + avatars + time */}
              <View className="flex-row items-center justify-between mt-3 pl-[68px]">
                <View className="flex-row items-center gap-3">
                  <View className="flex-row items-center gap-1">
                    <ImageIcon size={11} className="text-muted-foreground" />
                    <Text className="text-muted-foreground text-xs font-medium">
                      {item.media_count.toLocaleString()} assets
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <UsersIcon size={11} className="text-muted-foreground" />
                    <Text className="text-muted-foreground text-xs font-medium">
                      {item.collaborator_count}
                    </Text>
                  </View>
                </View>
                <View className="flex-row items-center gap-2">
                  {avatars.length > 0 && (
                    <AvatarStack urls={avatars} count={item.collaborator_count} borderColor={palette.card} fillColor={palette.secondary} />
                  )}
                  <View className="flex-row items-center gap-0.5">
                    <ClockIcon size={10} className="text-muted-foreground" />
                    <Text className="text-muted-foreground text-xs font-medium">
                      {timeAgo(item.updated_at)}
                    </Text>
                  </View>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

function ScrollViewPills({
  categories,
  active,
  onSelect,
}: {
  categories: string[];
  active: string;
  onSelect: (c: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingVertical: 8 }}
    >
      {categories.map((cat) => (
        <Pressable
          key={cat}
          onPress={() => onSelect(cat)}
          accessibilityRole="tab"
          accessibilityState={{ selected: cat === active }}
          className={`min-h-11 rounded-full px-4 py-2 justify-center active:scale-[0.98] ${
            cat === active ? 'bg-action' : 'bg-secondary'
          }`}
        >
          <Text
            className={`text-sm font-semibold ${
              cat === active ? 'text-white' : 'text-foreground'
            }`}
          >
            {cat}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
