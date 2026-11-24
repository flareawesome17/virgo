import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeftIcon, ChevronRightIcon, ImagesIcon, MusicIcon, PlayIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  describeAlbumCount,
  MAX_CARD_FILES,
  type Album,
  type StoredFile,
} from '@/src/api';
import {
  kindOf,
  useAlbumFiles,
  useAlbumSections,
  useAuth,
  useConversation,
  useInfiniteAlbums,
  useParticipants,
  useTheme,
  type MediaKind,
} from '@/src/hooks';
import { EmptyState } from '@/components/EmptyState';
import { LoadFailed } from '@/components/LoadFailed';
import { RemoteImage } from '@/components/RemoteImage';
import { firstNameOf } from '@/components/chat/chat-words';
import { useChatToast } from '@/components/chat/ChatToast';
import { useCardSender } from '@/components/chat/cards/useCardSender';
import { PALETTES } from '@/theme';

for (const Icon of [ArrowLeftIcon, ChevronRightIcon, ImagesIcon, MusicIcon, PlayIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** The space between tiles, as on the album's own grid. */
const GAP = 2;
const COLUMNS = 3;

/** Over a photograph: dark in either theme. */
const RING_EMPTY = `${PALETTES.light.foreground}1F`;
const BADGE = `${PALETTES.light.foreground}B3`;

/** "12 photos", "2 films", "14 files" for a mix — the server names the card the same way. */
function countWords(kinds: Iterable<MediaKind>, n: number): string {
  const list = [...kinds];
  const noun = list.every((k) => k === 'image')
    ? n === 1 ? 'photo' : 'photos'
    : list.every((k) => k === 'video')
      ? n === 1 ? 'film' : 'films'
      : n === 1 ? 'file' : 'files';
  return `${n} ${noun}`;
}

/**
 * Album photos for a chat: an album you manage, then the photos in it to
 * send. They go as a client link to just those — nothing is copied, so the
 * sender's storage does not change — and the card lands in the thread.
 */
export default function ShareAlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { participants } = useParticipants(id);
  const { conversation } = useConversation(id);
  const [album, setAlbum] = useState<Album | null>(null);

  const others = participants.filter((p) => p.id !== user?.id);
  const isGroup = conversation?.isGroup ?? participants.length > 2;
  const first = others[0]?.name ?? conversation?.title ?? '';
  const audience = isGroup ? null : first ? firstNameOf(first) : null;

  // Android's back button on the photos goes back to the albums, as the
  // arrow does, rather than out with the choice.
  useEffect(() => {
    if (!album) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setAlbum(null);
      return true;
    });
    return () => sub.remove();
  }, [album]);

  if (!id) return null;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      {album ? (
        <PhotoPicker
          key={album.id}
          conversationId={id}
          album={album}
          audience={audience}
          onBack={() => setAlbum(null)}
        />
      ) : (
        <AlbumChooser userId={user?.id} onPick={setAlbum} />
      )}
    </SafeAreaView>
  );
}

function Header({
  title,
  subtitle,
  backLabel,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  backLabel: string;
  onBack: () => void;
  right?: ReactNode;
}) {
  return (
    <View className="min-h-14 flex-row items-center gap-1 px-1">
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        className="w-11 h-11 items-center justify-center active:opacity-60"
      >
        <ArrowLeftIcon size={22} className="text-foreground" />
      </Pressable>
      <View className="flex-1 min-w-0">
        <Text accessibilityRole="header" className="text-foreground text-[16px] leading-5 font-bold" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-muted-foreground text-[12px] leading-4" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

// ─── Choosing the album ──────────────────────────────────────────────────────

/** Only albums you own or manage: the server makes a client link for no one else. */
function canShare(album: Album, userId: string | undefined): boolean {
  if (album.my_access === 'owner' || album.my_access === 'manage') return true;
  // An API older than my_access: your own, as far as can be told.
  return album.my_access === undefined && !!userId && album.user_id === userId;
}

function AlbumChooser({ userId, onPick }: { userId: string | undefined; onPick: (album: Album) => void }) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const query = useInfiniteAlbums({ orderBy: 'updated_at', direction: 'desc' }, { enabled: !!userId });
  const { albums: listed, isLoading, loadFailed, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  const albums = useMemo(() => listed.filter((a) => canShare(a, userId)), [listed, userId]);

  // A page with none of yours on it — all shared with you to view — is not
  // the end of the list: keep reading until one is, or there are no more.
  const searching = albums.length === 0 && !!hasNextPage && !loadFailed;
  useEffect(() => {
    if (searching && !isFetchingNextPage) void fetchNextPage();
  }, [searching, isFetchingNextPage, fetchNextPage]);

  const renderItem = useCallback(
    ({ item }: { item: Album }) => {
      const counts = item.counts ? describeAlbumCount(item.counts) : `${item.item_count} files`;
      return (
        <Pressable
          onPress={() => onPick(item)}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${counts}`}
          accessibilityHint="Choose photos from it"
          className="min-h-[72px] px-5 py-2.5 flex-row items-center gap-3 active:bg-muted/60"
        >
          <View className="w-14 h-14 rounded-xl bg-muted overflow-hidden items-center justify-center">
            {item.cover_url ? (
              <RemoteImage source={{ uri: item.cover_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (
              <ImagesIcon size={20} className="text-muted-foreground" />
            )}
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={2}>
              {item.name}
            </Text>
            <Text className="text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
              {counts}
            </Text>
          </View>
          <ChevronRightIcon size={16} className="text-muted-foreground/60" />
        </Pressable>
      );
    },
    [onPick],
  );

  let body;
  if (albums.length === 0 && (isLoading || searching)) {
    body = (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="small" color={palette.primary} />
      </View>
    );
  } else if (albums.length === 0 && loadFailed) {
    body = <LoadFailed what="your albums" onRetry={() => void refetch()} />;
  } else if (albums.length === 0) {
    body = (
      <EmptyState
        icon={ImagesIcon}
        title="No albums to share yet"
        body="Albums you own or manage show here. Their photos go as a link, so nothing is copied."
      />
    );
  } else {
    body = (
      <FlatList
        data={albums}
        keyExtractor={(a) => a.id}
        renderItem={renderItem}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListHeaderComponent={
          <Text className="text-muted-foreground text-[13px] leading-[18px] px-5 pb-2">
            {"Albums you own or manage. Their photos go as a link, so your storage doesn't change."}
          </Text>
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="py-4 items-center">
              <ActivityIndicator size="small" color={palette.primary} />
            </View>
          ) : null
        }
      />
    );
  }

  return (
    <View className="flex-1">
      <Header title="Album photos" subtitle="Choose an album" backLabel="Back to the chat" onBack={() => router.back()} />
      {body}
    </View>
  );
}

// ─── Choosing the photos ─────────────────────────────────────────────────────

function PhotoPicker({
  conversationId,
  album,
  audience,
  onBack,
}: {
  conversationId: string;
  album: Album;
  /** In a direct chat, the other person's first name; null in a group. */
  audience: string | null;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const [section, setSection] = useState<string>('all');
  const { sections } = useAlbumSections(album.id);
  const files = useAlbumFiles(album.id, section === 'all' ? {} : { section });
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = files;
  const [chosen, setChosen] = useState<Map<string, MediaKind>>(() => new Map());
  const [gathering, setGathering] = useState(false);
  const sender = useCardSender(conversationId);
  const toast = useChatToast(12);
  const showToast = toast.show;

  const tile = Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS);
  const order = useMemo(() => new Map([...chosen.keys()].map((key, i) => [key, i])), [chosen]);
  const shown = files.files;
  const allShownChosen = shown.length > 0 && !hasNextPage && shown.every((f) => chosen.has(f.key));

  const toggle = useCallback(
    (file: StoredFile) => {
      setChosen((prev) => {
        const next = new Map(prev);
        if (next.has(file.key)) {
          next.delete(file.key);
          return next;
        }
        if (next.size >= MAX_CARD_FILES) {
          showToast(`You can send up to ${MAX_CARD_FILES} at a time.`);
          return prev;
        }
        next.set(file.key, kindOf(file.contentType));
        return next;
      });
    },
    [showToast],
  );

  /** Everything in what is shown — the section, or the whole album — up to the limit. */
  const selectAll = async () => {
    if (gathering) return;
    let list = shown;
    if (hasNextPage) {
      setGathering(true);
      try {
        let result = await fetchNextPage();
        while (
          result.hasNextPage &&
          !result.isFetchNextPageError &&
          (result.data?.pages.reduce((n, p) => n + p.data.length, 0) ?? 0) < MAX_CARD_FILES + chosen.size
        ) {
          result = await fetchNextPage();
        }
        list = result.data?.pages.flatMap((p) => p.data) ?? list;
        if (result.isFetchNextPageError) showToast("Couldn't load all of them. The ones here are chosen.");
      } finally {
        setGathering(false);
      }
    }
    let capped = false;
    setChosen((prev) => {
      const next = new Map(prev);
      for (const f of list) {
        if (next.has(f.key)) continue;
        if (next.size >= MAX_CARD_FILES) {
          capped = true;
          break;
        }
        next.set(f.key, kindOf(f.contentType));
      }
      return next;
    });
    if (capped) showToast(`The first ${MAX_CARD_FILES} are chosen. That's the most one card can send.`);
  };

  const clearShown = () => {
    setChosen((prev) => {
      const next = new Map(prev);
      for (const f of shown) next.delete(f.key);
      return next;
    });
  };

  const n = chosen.size;
  const words = n > 0 ? countWords(chosen.values(), n) : '';
  const send = () => {
    if (n === 0 || sender.isPending) return;
    sender.send(
      { kind: 'album-photos', albumId: album.id, keys: [...chosen.keys()] },
      { onSuccess: () => router.back(), onError: showToast },
    );
  };

  const renderItem = useCallback(
    ({ item, index }: { item: StoredFile; index: number }) => (
      <PickTile file={item} index={index} size={tile} position={order.get(item.key)} onPress={toggle} />
    ),
    [tile, order, toggle],
  );

  let grid;
  if (shown.length === 0 && files.isLoading) {
    grid = (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="small" color={palette.primary} />
      </View>
    );
  } else if (shown.length === 0 && files.loadFailed) {
    grid = <LoadFailed what="the photos" onRetry={() => void files.refetch()} />;
  } else if (shown.length === 0) {
    grid = (
      <EmptyState
        icon={ImagesIcon}
        title={section === 'all' ? 'Nothing in this album yet' : 'Nothing in this section yet'}
      />
    );
  } else {
    grid = (
      <FlatList
        data={shown}
        keyExtractor={(f) => f.key}
        renderItem={renderItem}
        numColumns={COLUMNS}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ gap: GAP, paddingTop: GAP, paddingBottom: GAP }}
        extraData={order}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
        }}
        onEndReachedThreshold={0.6}
        removeClippedSubviews
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="py-4 items-center">
              <ActivityIndicator size="small" color={palette.primary} />
            </View>
          ) : null
        }
      />
    );
  }

  const tabs = [{ id: 'all', name: 'All' }, ...sections.map((s) => ({ id: s.id, name: s.name }))];

  return (
    <View className="flex-1">
      <Header
        title={album.name}
        subtitle={audience ? `Choose what ${audience} sees` : 'Choose what everyone here sees'}
        backLabel="Back to albums"
        onBack={onBack}
        right={
          shown.length > 0 ? (
            <Pressable
              onPress={allShownChosen ? clearShown : () => void selectAll()}
              disabled={gathering}
              accessibilityRole="button"
              accessibilityState={{ busy: gathering }}
              className="h-11 px-3 flex-row items-center justify-center gap-1.5 active:opacity-60"
            >
              {gathering ? <ActivityIndicator size="small" color={palette.primary} /> : null}
              <Text className="text-primary text-[15px] font-semibold">{allShownChosen ? 'Clear' : 'Select all'}</Text>
            </Pressable>
          ) : null
        }
      />

      {sections.length > 0 ? (
        <View className="border-b border-border/60">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 24 }}
            accessibilityRole="tablist"
            accessibilityLabel="Album sections"
          >
            {tabs.map((t) => {
              const active = section === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setSection(t.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  className={`h-11 justify-center ${active ? 'border-b-2 border-primary' : 'border-b-2 border-transparent'}`}
                >
                  <Text
                    className={`text-[15px] ${active ? 'text-foreground font-bold' : 'text-muted-foreground font-medium'}`}
                    numberOfLines={1}
                  >
                    {t.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <View className="flex-1">
        {grid}
        {toast.element}
      </View>

      <View
        className="px-5 pt-3 bg-card border-t border-border/60 gap-2.5"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      >
        <View>
          <Text className="text-foreground text-[15px] leading-5 font-semibold" accessibilityLiveRegion="polite">
            {n > 0 ? `${n} chosen` : 'Nothing chosen yet'}
          </Text>
          <Text className="text-muted-foreground text-[13px] leading-[18px]">
            {`${audience ? `${audience} gets` : 'Everyone here gets'} a link to just these. Nothing is copied, so your storage doesn't change.`}
          </Text>
        </View>
        <Pressable
          onPress={send}
          disabled={n === 0 || sender.isPending}
          accessibilityRole="button"
          accessibilityState={{ disabled: n === 0, busy: sender.isPending }}
          className={`h-[52px] rounded-[14px] flex-row items-center justify-center gap-2 ${
            n === 0 ? 'bg-muted' : 'bg-action active:opacity-85'
          }`}
        >
          {sender.isPending ? <ActivityIndicator size="small" color={palette.actionForeground} /> : null}
          <Text className={`text-[15px] font-semibold ${n === 0 ? 'text-muted-foreground' : 'text-action-foreground'}`}>
            {n === 0 ? 'Send' : `Send ${words}`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** One photo, film or recording in the grid; its number once chosen, in the order chosen. */
function PickTile({
  file,
  index,
  size,
  position,
  onPress,
}: {
  file: StoredFile;
  index: number;
  size: number;
  /** Where it is in the choice, or undefined when not chosen. */
  position: number | undefined;
  onPress: (file: StoredFile) => void;
}) {
  const kind = kindOf(file.contentType);
  const still = kind === 'video' ? file.posterUrl : kind === 'image' ? (file.thumbnailUrl ?? file.blurDataUrl) : null;
  const chosen = position !== undefined;
  const what = kind === 'image' ? 'Photo' : kind === 'video' ? 'Film' : kind === 'audio' ? 'Recording' : 'File';

  return (
    <Pressable
      onPress={() => onPress(file)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: chosen }}
      accessibilityLabel={`${what} ${index + 1}${chosen ? `, chosen, number ${position + 1}` : ''}`}
      className="bg-muted overflow-hidden items-center justify-center active:opacity-80"
      style={{ width: size, height: size }}
    >
      {still ? (
        <RemoteImage
          source={{ uri: still }}
          placeholder={file.blurDataUrl ? { uri: file.blurDataUrl } : undefined}
          placeholderContentFit="cover"
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={120}
          recyclingKey={file.key}
        />
      ) : kind === 'audio' ? (
        <MusicIcon size={24} className="text-muted-foreground" />
      ) : (
        <ImagesIcon size={24} className="text-muted-foreground" />
      )}
      {kind === 'video' ? (
        <View
          className="absolute bottom-1.5 left-1.5 w-6 h-6 rounded-full items-center justify-center"
          style={{ backgroundColor: BADGE }}
        >
          <PlayIcon size={11} className="text-action-foreground" fill={PALETTES.light.actionForeground} />
        </View>
      ) : null}
      <View
        className={`absolute top-1.5 right-1.5 w-[26px] h-[26px] rounded-full items-center justify-center border-2 border-action-foreground ${
          chosen ? 'bg-action' : ''
        }`}
        style={chosen ? undefined : { backgroundColor: RING_EMPTY }}
      >
        {chosen ? (
          <Text className="text-action-foreground text-[12px] font-bold" allowFontScaling={false}>
            {position + 1}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
