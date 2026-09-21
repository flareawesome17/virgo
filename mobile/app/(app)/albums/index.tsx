import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  Text,
  TextInput,
  View,
} from 'react-native';
// expo-image rather than RN Image: it decodes AVIF (and HEIC) on OS
// versions where the RN one silently renders nothing.
import { RemoteImage } from '@/components/RemoteImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeftIcon,
  ImageIcon,
  LayersIcon,
  MusicIcon,
  PlusIcon,
  SearchIcon,
  VideoIcon,
  XIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  useAuth,
  useInfiniteAlbums,
  usePlanLimits,
  useTheme,
  useWorkspaces,
} from '@/src/hooks';
import type { Album, AlbumStatus } from '@/src/api';
import { LoadFailed } from '@/components/LoadFailed';
import { PALETTES } from '@/theme';

const interop = { className: { target: 'style', nativeStyleToProp: { color: true } } } as const;
cssInterop(ArrowLeftIcon, interop);
cssInterop(ImageIcon, interop);
cssInterop(LayersIcon, interop);
cssInterop(MusicIcon, interop);
cssInterop(PlusIcon, interop);
cssInterop(SearchIcon, interop);
cssInterop(VideoIcon, interop);
cssInterop(XIcon, interop);

const STATUSES: { key: AlbumStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'review', label: 'In review' },
  { key: 'delivered', label: 'Delivered' },
];

/** The same tokens the album screen uses, so a status reads the same everywhere. */
const STATUS_PILL: Record<AlbumStatus, { label: string; className: string; text: string }> = {
  draft: { label: 'Draft', className: 'bg-card/90', text: 'text-muted-foreground' },
  review: { label: 'In review', className: 'bg-card/90', text: 'text-warning' },
  delivered: { label: 'Delivered', className: 'bg-card/90', text: 'text-success' },
};

function timeAgo(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

type Row = { key: string; albums: Album[] };
type Group = { key: string; title: string | null; count: number; data: Row[] };

/**
 * Every album, grouped under the workspace it belongs to.
 *
 * Grouped because a photographer thinks "Reyes Studio's albums" long before
 * "the album I touched fourth most recently", and a flat grid of two hundred
 * cards gave them no other way to find one. Searchable for the same reason,
 * and paged, because the old list asked for a hundred and stopped there with
 * nothing on screen to say so.
 */
export default function AlbumsListScreen() {
  const { guardAlbumCreate } = usePlanLimits();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { workspaceId } = useLocalSearchParams<{ workspaceId?: string }>();

  const [status, setStatus] = useState<AlbumStatus | 'all'>('all');
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // A request per settled word, not per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), 250);
    return () => clearTimeout(timer);
  }, [typed]);

  const albumsQuery = useInfiniteAlbums(
    {
      workspace_id: workspaceId,
      status: status === 'all' ? undefined : status,
      search: search || undefined,
      orderBy: 'updated_at',
      direction: 'desc',
    },
    { enabled: !!user?.id },
  );
  const { workspaces, refetch: refetchWorkspaces } = useWorkspaces({ limit: 100 }, { enabled: !!user?.id });
  const workspaceName = useMemo(
    () => new Map(workspaces.map((w) => [w.id, w.name])),
    [workspaces],
  );

  const groups = useMemo<Group[]>(() => {
    const pairs = (list: Album[]): Row[] => {
      const rows: Row[] = [];
      for (let i = 0; i < list.length; i += 2) {
        rows.push({ key: list[i].id, albums: list.slice(i, i + 2) });
      }
      return rows;
    };
    // Inside one workspace there is nothing to group by.
    if (workspaceId) {
      return [{ key: 'only', title: null, count: albumsQuery.albums.length, data: pairs(albumsQuery.albums) }];
    }
    // Buckets in order of each workspace's most recent album, which is the
    // order the server sent them in.
    const buckets = new Map<string, Album[]>();
    for (const album of albumsQuery.albums) {
      const list = buckets.get(album.workspace_id) ?? [];
      list.push(album);
      buckets.set(album.workspace_id, list);
    }
    return [...buckets].map(([id, list]) => ({
      key: id,
      title: workspaceName.get(id) ?? 'Shared with you',
      count: list.length,
      data: pairs(list),
    }));
  }, [albumsQuery.albums, workspaceId, workspaceName]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([albumsQuery.refetch(), refetchWorkspaces()]);
    setRefreshing(false);
  }, [albumsQuery, refetchWorkspaces]);

  const create = guardAlbumCreate(() =>
    router.push(`/albums/create${workspaceId ? `?workspaceId=${workspaceId}` : ''}`),
  );

  const renderRow = useCallback(
    ({ item }: { item: Row }) => (
      <View className="flex-row gap-3 px-5 mb-3">
        {item.albums.map((album) => (
          <AlbumCard key={album.id} album={album} />
        ))}
        {item.albums.length === 1 && <View className="flex-1" />}
      </View>
    ),
    [],
  );

  const renderGroup = useCallback(
    ({ section }: { section: Group }) =>
      section.title ? (
        <View className="bg-background px-5 pt-3 pb-2 flex-row items-baseline gap-2">
          <View className="w-1.5 h-1.5 rounded-full bg-primary self-center" />
          <Text className="text-foreground text-xs font-bold uppercase tracking-widest" accessibilityRole="header">
            {section.title}
          </Text>
          <Text className="text-muted-foreground text-xs">
            {section.count} album{section.count === 1 ? '' : 's'}
          </Text>
        </View>
      ) : null,
    [],
  );

  const shown = albumsQuery.albums.length;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <SectionList
        sections={groups}
        keyExtractor={(row) => row.key}
        renderItem={renderRow}
        renderSectionHeader={renderGroup}
        stickySectionHeadersEnabled
        contentContainerStyle={{ paddingBottom: 120 }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (albumsQuery.hasNextPage && !albumsQuery.isFetchingNextPage) {
            void albumsQuery.fetchNextPage();
          }
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.primary} />
        }
        ListHeaderComponent={
          <View className="gap-3 pt-4 pb-1">
            <View className="px-5 flex-row items-start justify-between gap-3">
              <View className="flex-row items-center gap-3 flex-1 min-w-0">
                {workspaceId && (
                  <Pressable
                    onPress={() => router.back()}
                    accessibilityRole="button"
                    accessibilityLabel="Back"
                    className="w-10 h-10 rounded-2xl bg-card border border-border items-center justify-center active:opacity-70"
                  >
                    <ArrowLeftIcon size={18} className="text-foreground" />
                  </Pressable>
                )}
                <View className="flex-1 min-w-0">
                  <Text className="text-foreground text-[28px] font-bold tracking-tight" accessibilityRole="header">
                    Albums
                  </Text>
                  <Text className="text-muted-foreground text-sm mt-0.5" numberOfLines={1}>
                    {albumsQuery.total.toLocaleString()} album{albumsQuery.total === 1 ? '' : 's'}
                    {!workspaceId && groups.length > 1 ? ` · ${groups.length} workspaces` : ''}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={create}
                accessibilityRole="button"
                accessibilityLabel="Create an album"
                className="w-11 h-11 rounded-2xl bg-action items-center justify-center active:opacity-85"
              >
                <PlusIcon size={20} className="text-action-foreground" />
              </Pressable>
            </View>

            <View className="px-5">
              <View className="flex-row items-center gap-2 rounded-2xl border border-border bg-card px-3.5 h-11">
                <SearchIcon size={16} className="text-muted-foreground" />
                <TextInput
                  value={typed}
                  onChangeText={setTyped}
                  placeholder="Album, client or workspace"
                  placeholderTextColor={palette.mutedForeground}
                  returnKeyType="search"
                  autoCorrect={false}
                  accessibilityLabel="Search albums"
                  className="flex-1 text-foreground text-[15px]"
                />
                {typed.length > 0 && (
                  <Pressable onPress={() => setTyped('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                    <XIcon size={16} className="text-muted-foreground" />
                  </Pressable>
                )}
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingBottom: 4 }}
            >
              {STATUSES.map((option) => {
                const active = status === option.key;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setStatus(option.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    className={`rounded-full px-4 py-2 ${active ? 'bg-foreground' : 'bg-card border border-border'}`}
                  >
                    <Text className={`text-sm font-semibold ${active ? 'text-background' : 'text-foreground'}`}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        }
        ListFooterComponent={
          albumsQuery.isFetchingNextPage ? (
            <View className="py-6">
              <ActivityIndicator color={palette.primary} />
            </View>
          ) : shown > 0 && !albumsQuery.hasNextPage && albumsQuery.total > 100 ? (
            <Text className="text-muted-foreground text-xs text-center py-4">
              All {albumsQuery.total.toLocaleString()} albums
            </Text>
          ) : null
        }
        ListEmptyComponent={
          albumsQuery.isLoading ? (
            <View className="py-16">
              <ActivityIndicator color={palette.primary} />
            </View>
          ) : albumsQuery.loadFailed ? (
            // Never claim someone has no albums because the request failed.
            <View className="pt-12">
              <LoadFailed what="your albums" onRetry={() => void albumsQuery.refetch()} compact />
            </View>
          ) : search || status !== 'all' ? (
            <View className="px-10 pt-12 items-center">
              <Text className="text-foreground text-base font-semibold">No albums match</Text>
              <Text className="text-muted-foreground text-sm text-center mt-1">
                {search ? `Nothing called or described as “${search}”.` : 'Try another status.'}
              </Text>
            </View>
          ) : (
            <View className="px-5 pt-12 items-center gap-4">
              <View className="w-16 h-16 rounded-full bg-muted items-center justify-center">
                <LayersIcon size={28} className="text-muted-foreground" />
              </View>
              <View className="items-center gap-1">
                <Text className="text-foreground text-lg font-bold">No albums yet</Text>
                <Text className="text-muted-foreground text-sm text-center px-8">
                  Create your first album to organise and deliver your work.
                </Text>
              </View>
              <Pressable
                onPress={create}
                className="bg-action rounded-2xl px-6 py-3.5 flex-row items-center gap-2 active:opacity-85"
              >
                <PlusIcon size={18} className="text-action-foreground" />
                <Text className="text-action-foreground text-sm font-semibold">Create album</Text>
              </Pressable>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

function AlbumCard({ album }: { album: Album }) {
  const pill = STATUS_PILL[album.status] ?? STATUS_PILL.draft;
  // Older APIs send only the total; show it as photographs, which is what it
  // said before counts by kind existed.
  const counts = album.counts ?? { image: album.item_count, video: 0, audio: 0 };
  const parts = [
    { n: counts.image, Icon: ImageIcon, label: 'photos' },
    { n: counts.video, Icon: VideoIcon, label: 'films' },
    { n: counts.audio, Icon: MusicIcon, label: 'recordings' },
  ].filter((part) => part.n > 0);

  return (
    <Pressable
      onPress={() => router.push(`/albums/${album.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${album.name}, ${pill.label}, ${parts.map((p) => `${p.n} ${p.label}`).join(', ') || 'empty'}`}
      className="flex-1 bg-card rounded-2xl overflow-hidden border border-border active:opacity-85"
    >
      <View style={{ width: '100%', aspectRatio: 4 / 3 }} className="bg-muted">
        {album.cover_url ? (
          <RemoteImage source={{ uri: album.cover_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} />
        ) : (
          <View className="flex-1 items-center justify-center">
            <ImageIcon size={22} className="text-muted-foreground" />
          </View>
        )}
        <View className={`absolute left-2 top-2 rounded-md px-1.5 py-0.5 ${pill.className}`}>
          <Text className={`text-[10px] font-bold uppercase tracking-wide ${pill.text}`}>{pill.label}</Text>
        </View>
      </View>
      <View className="p-3 gap-1.5">
        <Text className="text-foreground text-sm font-bold" numberOfLines={1}>
          {album.name}
        </Text>
        <View className="flex-row items-center gap-2.5 flex-wrap">
          {parts.length > 0 ? (
            parts.map(({ n, Icon, label }) => (
              <View key={label} className="flex-row items-center gap-1">
                <Icon size={11} className="text-muted-foreground" />
                <Text className="text-muted-foreground text-[11px] font-medium">{n.toLocaleString()}</Text>
              </View>
            ))
          ) : (
            <Text className="text-muted-foreground text-[11px]">Empty</Text>
          )}
          <Text className="text-muted-foreground text-[11px] ml-auto">{timeAgo(album.updated_at)}</Text>
        </View>
      </View>
    </Pressable>
  );
}
