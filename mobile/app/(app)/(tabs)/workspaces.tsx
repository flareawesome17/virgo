import { View, Text, FlatList, ScrollView, RefreshControl, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  SlidersHorizontalIcon,
  WifiIcon,
  ClockIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { LoadFailed } from '@/components/LoadFailed';
import { WorkspaceInvitations } from '@/components/WorkspaceInvitations';

cssInterop(SearchIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ImageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UsersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(FolderPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(SlidersHorizontalIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(WifiIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ClockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const CATEGORIES = ['All', 'Active', 'Archived', 'Shared'];

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

function AvatarStack({ urls, count }: { urls: string[]; count: number }) {
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
            borderColor: '#FFFFFF',
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
            borderColor: '#FFFFFF',
            backgroundColor: '#FAF2EC',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text className="text-[9px] font-bold text-muted-foreground">+{extra}</Text>
        </View>
      )}
    </View>
  );
}

export default function WorkspacesScreen() {
  const { guardWorkspaceCreate } = usePlanLimits();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');

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

  const totalAssets = workspaces.reduce((s, w) => s + (w.media_count || 0), 0);
  const totalCollabs = workspaces.reduce((s, w) => s + (w.collaborator_count || 0), 0);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <FlatList
        data={workspaces}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={isDark ? '#C17745' : '#B66A40'}
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
                className="w-11 h-11 rounded-2xl bg-primary items-center justify-center active:scale-[0.94]"
                style={{
                  shadowColor: '#B66A40',
                  shadowOpacity: 0.25,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 3 },
                  elevation: 4,
                }}
              >
                <PlusIcon size={20} className="text-white" />
              </Pressable>
            </View>

            {/* Under the title, above the list it will join: an invitation is
                the one thing on this screen waiting on somebody else. */}
            <WorkspaceInvitations />

            {/* Search + Filter */}
            <View className="px-5 pt-3 pb-2 flex-row items-center gap-3">
              <View
                className="flex-1 flex-row items-center bg-card rounded-2xl px-4 h-11 gap-3"
                style={{
                  shadowColor: '#000',
                  shadowOpacity: 0.03,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 2,
                }}
              >
                <SearchIcon size={16} className="text-muted-foreground" />
                <Text className="text-muted-foreground text-sm flex-1">Search workspaces</Text>
              </View>
              <Pressable
                className="w-11 h-11 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
                style={{
                  shadowColor: '#000',
                  shadowOpacity: 0.03,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 2,
                }}
              >
                <SlidersHorizontalIcon size={18} className="text-muted-foreground" />
              </Pressable>
            </View>

            {/* Category pills */}
            <ScrollViewPills
              categories={CATEGORIES}
              active={activeCategory}
              onSelect={setActiveCategory}
            />

            {/* Summary card */}
            <View
              className="mx-5 mb-4 bg-card rounded-2xl p-4 flex-row items-center gap-4"
              style={{
                shadowColor: '#000',
                shadowOpacity: 0.04,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 3 },
                elevation: 3,
              }}
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
              className="bg-primary rounded-2xl px-6 py-3.5 flex-row items-center gap-2 active:scale-[0.96]"
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
              className="mx-5 mb-3 bg-card rounded-2xl p-4 active:scale-[0.98]"
              style={{
                shadowColor: '#000',
                shadowOpacity: 0.04,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 3 },
                elevation: 3,
              }}
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
                      : '#B66A4018',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: '700',
                      color: item.accent_color || '#B66A40',
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
                      <WifiIcon size={9} style={{ color: '#6B8E4E' }} />
                      <Text style={{ color: '#6B8E4E', fontSize: 9, fontWeight: '600' }}>
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
                    <Text className="text-muted-foreground text-[11px] font-medium">
                      {item.media_count.toLocaleString()} assets
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <UsersIcon size={11} className="text-muted-foreground" />
                    <Text className="text-muted-foreground text-[11px] font-medium">
                      {item.collaborator_count}
                    </Text>
                  </View>
                </View>
                <View className="flex-row items-center gap-2">
                  {avatars.length > 0 && (
                    <AvatarStack urls={avatars} count={item.collaborator_count} />
                  )}
                  <View className="flex-row items-center gap-0.5">
                    <ClockIcon size={10} className="text-muted-foreground" />
                    <Text className="text-muted-foreground text-[10px] font-medium">
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
          className={`rounded-full px-4 py-2 active:scale-[0.96] ${
            cat === active ? 'bg-primary' : 'bg-card'
          }`}
          style={
            cat !== active
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
