import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  Share,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
// expo-image rather than RN Image: it decodes AVIF (and HEIC) on OS
// versions where the RN one silently renders nothing.
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as WebBrowser from 'expo-web-browser';
import {
  ArrowDownUpIcon,
  ArrowLeftIcon,
  CheckIcon,
  DownloadIcon,
  FileIcon,
  FolderInputIcon,
  HeartIcon,
  ImageIcon,
  LinkIcon,
  MoreHorizontalIcon,
  MusicIcon,
  PlayIcon,
  PlusIcon,
  ShieldIcon,
  Trash2Icon,
  UploadIcon,
  VideoIcon,
  XIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  kindOf,
  useAlbum,
  useAlbumFiles,
  useAlbumSections,
  useAssignSection,
  useAuth,
  useCreateSection,
  useDeleteAlbum,
  useDeleteFiles,
  useDeleteSection,
  useRenameSection,
  useReorderSections,
  useSelection,
  useTheme,
  useUpdateAlbum,
  useWorkspace,
} from '@/src/hooks';
import {
  albumShareApi,
  ApiError,
  type ShareMediaKind,
  type StoredFile,
  type StoredMediaKind,
} from '@/src/api';
import { LoadFailed } from '@/components/LoadFailed';
import {
  DEFAULT_DENSITY,
  DENSITIES,
  HAIRLINE,
  clock,
  toSections,
  type MediaRow,
  type MediaSection,
} from '@/src/lib/media-grid';
import { daySpan } from '@/src/lib/media-days';
import { PALETTES } from '@/theme';

const interop = { className: { target: 'style', nativeStyleToProp: { color: true } } } as const;
cssInterop(ArrowDownUpIcon, interop);
cssInterop(ArrowLeftIcon, interop);
cssInterop(CheckIcon, interop);
cssInterop(DownloadIcon, interop);
cssInterop(FileIcon, interop);
cssInterop(FolderInputIcon, interop);
cssInterop(HeartIcon, interop);
cssInterop(ImageIcon, interop);
cssInterop(LinkIcon, interop);
cssInterop(MoreHorizontalIcon, interop);
cssInterop(MusicIcon, interop);
cssInterop(PlayIcon, interop);
cssInterop(PlusIcon, interop);
cssInterop(ShieldIcon, interop);
cssInterop(Trash2Icon, interop);
cssInterop(UploadIcon, interop);
cssInterop(VideoIcon, interop);
cssInterop(XIcon, interop);

/** What the chip row can narrow to: everything, one section, unsorted, or the picks. */
type SectionFilter = 'all' | 'none' | 'picked' | string;
type KindFilter = 'all' | Exclude<StoredMediaKind, 'other'>;

const KINDS: { key: KindFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'image', label: 'Photos' },
  { key: 'video', label: 'Films' },
  { key: 'audio', label: 'Audio' },
];

/** Tokens rather than hex, so both themes and every contrast check hold. */
const STATUS: Record<string, { label: string; className: string; text: string }> = {
  draft: { label: 'Draft', className: 'bg-muted', text: 'text-muted-foreground' },
  review: { label: 'In review', className: 'bg-warning/15', text: 'text-warning' },
  delivered: { label: 'Delivered', className: 'bg-success/15', text: 'text-success' },
};

const LINK_SCOPE_ROWS: {
  kind: ShareMediaKind;
  label: string;
  singular: string;
  plural: string;
  icon: typeof ImageIcon;
}[] = [
  { kind: 'image', label: 'Photos', singular: 'photo', plural: 'photos', icon: ImageIcon },
  { kind: 'video', label: 'Films', singular: 'film', plural: 'films', icon: VideoIcon },
  { kind: 'audio', label: 'Audio', singular: 'file', plural: 'files', icon: MusicIcon },
];

/** A server sentence when there is one; never a stack trace or a status code. */
function problem(error: unknown): string {
  return error instanceof ApiError && error.message ? error.message : 'Please try again.';
}

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

/**
 * One album: its sections, its media by the day it was taken, and what can be
 * done to several files at once.
 *
 * This replaces a front page that previewed eight photographs and sent you to
 * another screen to see the rest, one kind at a time. The grid is here now and
 * mixed — photographs, films and sound together, the way the shoot happened —
 * with kind as a filter rather than three separate rooms, and the album's own
 * sections as the chips across the top.
 */
export default function AlbumScreen() {
  const params = useLocalSearchParams<{ albumId: string; picked?: string }>();
  const { albumId } = params;
  const { width } = useWindowDimensions();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { user } = useAuth();

  const { data: album, refetch: refetchAlbum } = useAlbum(albumId);
  const { data: workspace } = useWorkspace(album?.workspace_id);
  const sectionsQuery = useAlbumSections(albumId);

  // A tap on "your client sent their picks" arrives with ?picked=1, and should
  // open on the picks rather than on everything.
  const [chosenSection, setSection] = useState<SectionFilter>(params.picked ? 'picked' : 'all');
  // A section deleted while it was on screen falls back to everything, rather
  // than leaving the grid filtered to something that no longer exists.
  const section: SectionFilter =
    chosenSection === 'all' ||
    chosenSection === 'none' ||
    chosenSection === 'picked' ||
    !sectionsQuery.isSuccess ||
    sectionsQuery.sections.some((s) => s.id === chosenSection)
      ? chosenSection
      : 'all';
  const [kind, setKind] = useState<KindFilter>('all');
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');
  const [density, setDensity] = useState(DEFAULT_DENSITY);
  const [refreshing, setRefreshing] = useState(false);

  const filter = {
    kind: kind === 'all' ? undefined : kind,
    order: order === 'oldest' ? ('oldest' as const) : undefined,
    section: section === 'all' || section === 'picked' ? undefined : section,
    picked: section === 'picked' ? true : undefined,
  };
  const filesQuery = useAlbumFiles(albumId, filter);
  const files = filesQuery.files;

  const selection = useSelection();
  const [selecting, setSelecting] = useState(false);
  const [moving, setMoving] = useState(false);
  const [naming, setNaming] = useState<{ id?: string; initial: string } | null>(null);
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);

  const deleteFiles = useDeleteFiles(albumId);
  const assign = useAssignSection(albumId);
  const createSection = useCreateSection(albumId);
  const renameSection = useRenameSection(albumId);
  const reorderSections = useReorderSections(albumId);
  const deleteSection = useDeleteSection(albumId);
  const updateAlbum = useUpdateAlbum();
  const deleteAlbum = useDeleteAlbum();

  const isOwner = !!album && !!user && album.user_id === user.id;
  const canManage = isOwner || files.some((file) => file.capabilities.manage);
  const canDownload = isOwner || files.some((file) => file.capabilities.download);


  // Selection is of what is on screen. Changing the filter underneath it would
  // otherwise leave invisible files chosen, waiting to be deleted by surprise.
  useEffect(() => {
    selection.keepOnly(files.map((file) => file.key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const columns = DENSITIES[density];
  const tile = (width - HAIRLINE * (columns - 1)) / columns;
  const sections = useMemo(() => toSections(files, columns), [files, columns]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchAlbum(), filesQuery.refetch(), sectionsQuery.refetch()]);
    setRefreshing(false);
  }, [refetchAlbum, filesQuery, sectionsQuery]);

  const changeDensity = useCallback((step: number) => {
    setDensity((current) => {
      const next = Math.min(Math.max(current + step, 0), DENSITIES.length - 1);
      if (next !== current) void Haptics.selectionAsync();
      return next;
    });
  }, []);

  /** Pinch between 2, 3 and 5 across — one step per gesture, decided on release. */
  const pinch = useMemo(
    () =>
      Gesture.Pinch().onEnd((event) => {
        const step = event.scale > 1.15 ? -1 : event.scale < 0.87 ? 1 : 0;
        if (step !== 0) runOnJS(changeDensity)(step);
      }),
    [changeDensity],
  );

  const leaveSelection = useCallback(() => {
    selection.clear();
    setSelecting(false);
  }, [selection]);

  /** The filter the grid is on, for rooms that must read the same pages. */
  const roomQuery = useMemo(() => {
    const parts: string[] = [];
    if (filter.section) parts.push(`section=${encodeURIComponent(filter.section)}`);
    if (filter.order) parts.push(`order=${filter.order}`);
    if (filter.picked) parts.push('picked=1');
    return parts.join('&');
  }, [filter.section, filter.order, filter.picked]);

  const open = useCallback(
    async (file: StoredFile) => {
      const key = encodeURIComponent(file.key);
      const rest = roomQuery ? `&${roomQuery}` : '';
      switch (kindOf(file.contentType)) {
        case 'image': {
          // The viewer asks for exactly this grid's filter, so it reads the
          // pages already loaded instead of starting again at page one.
          const kindParam = filter.kind ? `&kind=${filter.kind}` : '';
          router.push(`/albums/${albumId}/viewer?key=${key}${kindParam}${rest}`);
          return;
        }
        case 'video':
          router.push(`/albums/${albumId}/videos?key=${key}${rest}`);
          return;
        case 'audio':
          router.push(`/albums/${albumId}/audio?key=${key}${rest}`);
          return;
        default:
          if (file.url) await WebBrowser.openBrowserAsync(file.url);
      }
    },
    [albumId, roomQuery, filter.kind],
  );

  const onTile = useCallback(
    (file: StoredFile) => {
      if (selecting) selection.toggle(file.key);
      else void open(file);
    },
    [selecting, selection, open],
  );

  const onLongTile = useCallback(
    (file: StoredFile) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setSelecting(true);
      selection.toggle(file.key);
    },
    [selection],
  );

  const selectedFiles = useMemo(
    () => files.filter((file) => selection.has(file.key)),
    [files, selection],
  );

  // ── Bulk actions ─────────────────────────────────────────────────────────

  const confirmDeleteSelection = () => {
    const count = selection.count;
    Alert.alert(
      `Delete ${plural(count, 'file', 'files')}?`,
      'They are removed from storage for good, along with their previews. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            deleteFiles.mutate(selection.keys(), {
              onSuccess: (result) => {
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                leaveSelection();
                if (result.failed > 0) {
                  Alert.alert(
                    'Some files were not deleted',
                    `${plural(result.deleted, 'file was', 'files were')} deleted. ${plural(result.failed, 'is', 'are')} still there — try those again.`,
                  );
                }
              },
              onError: (error) => Alert.alert('Could not delete', problem(error)),
            }),
        },
      ],
    );
  };

  const moveSelection = (sectionId: string | null) => {
    setMoving(false);
    assign.mutate(
      { keys: selection.keys(), sectionId },
      {
        onSuccess: () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          leaveSelection();
        },
        onError: (error) => Alert.alert('Could not move', problem(error)),
      },
    );
  };

  /**
   * Saves the selection to the phone's photo library, one file at a time.
   *
   * Sequential on purpose: these are originals, often tens of megabytes, on
   * mobile data. Running them in parallel is how every one of them times out.
   */
  const saveSelection = async () => {
    const targets = selectedFiles.filter(
      (file) => file.capabilities.download && (file.downloadUrl ?? file.url),
    );
    if (targets.length === 0) return;
    const permission = await MediaLibrary.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to save to your library.');
      return;
    }
    let saved = 0;
    setSaving({ done: 0, total: targets.length });
    for (const file of targets) {
      try {
        const name = file.originalName.replace(/[^a-z0-9._-]/gi, '_');
        const target = `${FileSystem.cacheDirectory}${Date.now()}-${name}`;
        const result = await FileSystem.downloadAsync(
          (file.downloadUrl ?? file.url) as string,
          target,
        );
        if (result.status >= 200 && result.status < 300) {
          await MediaLibrary.saveToLibraryAsync(result.uri);
          saved += 1;
        }
        await FileSystem.deleteAsync(result.uri, { idempotent: true });
      } catch {
        // Counted below; one failure must not stop the rest.
      }
      setSaving({ done: saved, total: targets.length });
    }
    setSaving(null);
    leaveSelection();
    Alert.alert(
      saved === targets.length ? 'Saved' : 'Saved some',
      saved === targets.length
        ? `${plural(saved, 'file is', 'files are')} in your library.`
        : `${saved} of ${targets.length} saved. The rest could not be downloaded — try them again on a steadier connection.`,
    );
  };

  const setCover = () => {
    const photo = selectedFiles[0];
    if (!photo) return;
    updateAlbum.mutate(
      { id: albumId, cover_key: photo.key },
      {
        onSuccess: () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          leaveSelection();
        },
        onError: (error) => Alert.alert('Could not set the cover', problem(error)),
      },
    );
  };

  // ── Sections ─────────────────────────────────────────────────────────────

  const saveName = (name: string) => {
    const target = naming;
    setNaming(null);
    if (!target || !name.trim()) return;
    if (target.id) {
      renameSection.mutate(
        { id: target.id, name },
        { onError: (error) => Alert.alert('Could not rename', problem(error)) },
      );
    } else {
      createSection.mutate(name, {
        onSuccess: (created) => {
          // Created from the move sheet: file the selection there straight away.
          if (selecting && selection.count > 0) moveSelection(created.id);
          else setSection(created.id);
        },
        onError: (error) => Alert.alert('Could not add the section', problem(error)),
      });
    }
  };

  const nudgeSection = (id: string, step: -1 | 1) => {
    const ids = sectionsQuery.sections.map((s) => s.id);
    const from = ids.indexOf(id);
    const to = from + step;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    reorderSections.mutate(ids, {
      onError: (error) => Alert.alert('Could not reorder', problem(error)),
    });
  };

  const sectionMenu = (id: string) => {
    const current = sectionsQuery.sections.find((s) => s.id === id);
    if (!current || !canManage) return;
    const index = sectionsQuery.sections.indexOf(current);
    const last = sectionsQuery.sections.length - 1;
    void Haptics.selectionAsync();
    Alert.alert(current.name, plural(current.count, 'file', 'files'), [
      { text: 'Rename', onPress: () => setNaming({ id, initial: current.name }) },
      ...(index > 0 ? [{ text: 'Move left', onPress: () => nudgeSection(id, -1) }] : []),
      ...(index < last ? [{ text: 'Move right', onPress: () => nudgeSection(id, 1) }] : []),
      {
        text: 'Delete section',
        style: 'destructive' as const,
        onPress: () =>
          Alert.alert(
            `Delete “${current.name}”?`,
            'Only the section goes. Its files stay in the album, unsorted.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () =>
                  deleteSection.mutate(id, {
                    onError: (error) => Alert.alert('Could not delete', problem(error)),
                  }),
              },
            ],
          ),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ── Album menu, client link ──────────────────────────────────────────────

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkKinds, setLinkKinds] = useState<ShareMediaKind[]>(['image', 'video', 'audio']);
  const [linking, setLinking] = useState(false);

  const openLinkSheet = async () => {
    try {
      const existing = await albumShareApi.get(albumId);
      if (existing?.kinds?.length) setLinkKinds(existing.kinds);
    } catch {
      // No link yet, or the lookup failed: everything ticked is the right start.
    }
    setLinkOpen(true);
  };

  const createLink = async () => {
    if (linking || linkKinds.length === 0) return;
    setLinking(true);
    try {
      const link = await albumShareApi.create(albumId, linkKinds);
      setLinkOpen(false);
      // The URL on screen, not straight into the share sheet: a dismissed
      // sheet gave no sign the link had been made at all.
      Alert.alert('Client link ready', link.url, [
        {
          text: 'Copy link',
          onPress: async () => {
            await Clipboard.setStringAsync(link.url);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
        {
          text: 'Share…',
          // iOS reads `url`; Android has no url field and reads `message`.
          onPress: () =>
            void Share.share(
              Platform.OS === 'ios'
                ? { url: link.url, message: album?.name ?? 'Album' }
                : { message: `${album?.name ?? 'Album'} — ${link.url}` },
            ),
        },
        { text: 'Done', style: 'cancel' },
      ]);
    } catch (error) {
      Alert.alert('Could not create the link', problem(error));
    } finally {
      setLinking(false);
    }
  };

  const revokeLink = () =>
    Alert.alert(
      'Turn off the client link?',
      'Anyone holding it loses access straight away. You can make a new one after.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Turn off',
          style: 'destructive',
          onPress: async () => {
            try {
              const { revoked } = await albumShareApi.revoke(albumId);
              Alert.alert(revoked ? 'Link turned off' : 'No link to turn off');
            } catch (error) {
              Alert.alert('Could not turn it off', problem(error));
            }
          },
        },
      ],
    );

  const setStatus = (status: 'draft' | 'review' | 'delivered') =>
    updateAlbum.mutate(
      { id: albumId, status },
      { onError: (error) => Alert.alert('Could not update the album', problem(error)) },
    );

  const confirmDeleteAlbum = () =>
    Alert.alert(
      'Delete album',
      // Say what survives: the files are billed either way, so implying the
      // delete frees space would be misleading.
      `“${album?.name ?? 'This album'}” will be removed. Uploaded files stay in your storage and can be filed into another album.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            deleteAlbum.mutate(albumId, {
              onSuccess: () => router.replace('/albums'),
              onError: (error) => Alert.alert('Could not delete the album', problem(error)),
            }),
        },
      ],
    );

  const albumMenu = () =>
    Alert.alert(album?.name ?? 'Album', undefined, [
      { text: 'Client link…', onPress: openLinkSheet },
      { text: 'Turn off client link', onPress: revokeLink },
      {
        text: 'Choose cover',
        onPress: () => {
          setSelecting(true);
          Alert.alert('Choose a cover', 'Select one photograph, then tap Cover.');
        },
      },
      {
        text: 'Set status',
        onPress: () =>
          Alert.alert('Set status', 'Where is this album in your workflow?', [
            { text: 'Draft', onPress: () => setStatus('draft') },
            { text: 'In review', onPress: () => setStatus('review') },
            { text: 'Delivered', onPress: () => setStatus('delivered') },
            { text: 'Cancel', style: 'cancel' },
          ]),
      },
      { text: 'Delete album', style: 'destructive', onPress: confirmDeleteAlbum },
      { text: 'Cancel', style: 'cancel' },
    ]);

  // ── Rendering ────────────────────────────────────────────────────────────

  const renderRow = useCallback(
    ({ item: row }: { item: MediaRow }) => (
      <View className="flex-row" style={{ gap: HAIRLINE, marginBottom: HAIRLINE }}>
        {row.items.map((file, column) => (
          <MediaTile
            key={file.key}
            file={file}
            size={tile}
            index={row.firstIndex + column}
            selecting={selecting}
            selected={selection.has(file.key)}
            onPress={onTile}
            onLongPress={onLongTile}
          />
        ))}
        {row.items.length < columns &&
          Array.from({ length: columns - row.items.length }).map((_, index) => (
            <View key={`gap-${index}`} style={{ width: tile, height: tile }} />
          ))}
      </View>
    ),
    [tile, columns, selecting, selection, onTile, onLongTile],
  );

  const renderDay = useCallback(
    ({ section: day }: { section: MediaSection }) => {
      const dayFiles = day.data.flatMap((row) => row.items);
      const span = daySpan(dayFiles);
      const allChosen = dayFiles.every((file) => selection.has(file.key));
      return (
        <View className="bg-background px-4 pt-4 pb-2 flex-row items-center gap-2">
          <Text className="text-foreground text-[15px] font-semibold" accessibilityRole="header">
            {day.title}
          </Text>
          <Text className="text-muted-foreground text-xs flex-1" numberOfLines={1}>
            {plural(dayFiles.length, 'item', 'items')}
            {span ? ` · ${span}` : ''}
          </Text>
          {selecting && (
            <Pressable
              onPress={() => selection.setMany(dayFiles.map((file) => file.key), !allChosen)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${allChosen ? 'Deselect' : 'Select'} everything from ${day.title}`}
              className="px-2.5 py-1 rounded-lg bg-muted active:opacity-70"
            >
              <Text className="text-foreground text-xs font-semibold">
                {allChosen ? 'Clear day' : 'Select day'}
              </Text>
            </Pressable>
          )}
        </View>
      );
    },
    [selecting, selection],
  );

  if (!album) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color={palette.primary} />
      </SafeAreaView>
    );
  }

  const status = STATUS[album.status] ?? STATUS.draft;
  const albumCounts = sectionsQuery.counts;
  const counts = filesQuery.counts;
  const onlyOnePhoto =
    selectedFiles.length === 1 && kindOf(selectedFiles[0].contentType) === 'image';
  const busy = deleteFiles.isPending || assign.isPending || !!saving;

  const chips: { key: SectionFilter; label: string; count: number; icon?: 'heart' }[] = [
    { key: 'all', label: 'All', count: sectionsQuery.total },
    ...sectionsQuery.sections.map((s) => ({ key: s.id, label: s.name, count: s.count })),
    ...(sectionsQuery.sections.length > 0 && sectionsQuery.unsorted > 0
      ? [{ key: 'none', label: 'Unsorted', count: sectionsQuery.unsorted }]
      : []),
    ...(sectionsQuery.picked > 0
      ? [{ key: 'picked', label: 'Client picks', count: sectionsQuery.picked, icon: 'heart' as const }]
      : []),
  ];

  const emptyMessage =
    sectionsQuery.total === 0
      ? null
      : section === 'picked'
        ? 'Nothing picked yet. When your client chooses from the delivery link, their picks appear here.'
        : section !== 'all'
          ? 'Nothing in this section yet. Select files under All and choose Move to file them here.'
          : `No ${KINDS.find((k) => k.key === kind)?.label.toLowerCase() ?? 'files'} here.`;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      {/* ── Header: the album, or the selection when there is one ── */}
      {selecting ? (
        <View className="px-4 pt-2 pb-3 flex-row items-center gap-3 border-b border-border bg-card">
          <Pressable
            onPress={leaveSelection}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Stop selecting"
            className="w-10 h-10 rounded-full bg-muted items-center justify-center active:opacity-70"
          >
            <XIcon size={18} className="text-foreground" />
          </Pressable>
          <View className="flex-1 min-w-0">
            <Text className="text-foreground text-base font-semibold" accessibilityLiveRegion="polite">
              {selection.count === 0 ? 'Select files' : `${selection.count.toLocaleString()} selected`}
            </Text>
            <Text className="text-muted-foreground text-xs" numberOfLines={1}>
              Tap to choose · Select day under each date
            </Text>
          </View>
          <Pressable
            onPress={() => selection.setMany(files.map((file) => file.key), true)}
            accessibilityRole="button"
            accessibilityLabel="Select everything loaded"
            className="px-3 py-2 rounded-full border border-border active:opacity-70"
          >
            <Text className="text-foreground text-sm font-semibold">All</Text>
          </Pressable>
        </View>
      ) : (
        <View className="px-4 pt-2 pb-3 gap-3 border-b border-border bg-card">
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={() => router.back()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Back"
              className="w-10 h-10 rounded-full bg-muted items-center justify-center active:opacity-70"
            >
              <ArrowLeftIcon size={18} className="text-foreground" />
            </Pressable>
            <View className="flex-1 min-w-0">
              {workspace ? (
                <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-widest" numberOfLines={1}>
                  {workspace.name}
                </Text>
              ) : null}
              <Text className="text-foreground text-lg font-bold" numberOfLines={1} accessibilityRole="header">
                {album.name}
              </Text>
            </View>
            <Pressable
              onPress={albumMenu}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Album options"
              className="w-10 h-10 rounded-full bg-muted items-center justify-center active:opacity-70"
            >
              <MoreHorizontalIcon size={18} className="text-foreground" />
            </Pressable>
          </View>

          <View className="flex-row items-center gap-2 flex-wrap">
            <View className={`px-2 py-1 rounded-md ${status.className}`}>
              <Text className={`text-[11px] font-bold uppercase tracking-wide ${status.text}`}>{status.label}</Text>
            </View>
            {album.retention_days ? (
              <View className="px-2 py-1 rounded-md bg-muted flex-row items-center gap-1">
                <ShieldIcon size={11} className="text-muted-foreground" />
                <Text className="text-muted-foreground text-[11px] font-semibold">
                  Files deleted {album.retention_days} days after upload
                </Text>
              </View>
            ) : null}
            <Text className="text-muted-foreground text-xs">
              {[
                albumCounts.image ? plural(albumCounts.image, 'photo', 'photos') : null,
                albumCounts.video ? plural(albumCounts.video, 'film', 'films') : null,
                albumCounts.audio ? plural(albumCounts.audio, 'recording', 'recordings') : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'Empty'}
            </Text>
          </View>

          <View className="flex-row gap-2">
            {isOwner && (
              <Pressable
                onPress={openLinkSheet}
                accessibilityRole="button"
                className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-border py-2.5 active:opacity-70"
              >
                <LinkIcon size={15} className="text-foreground" />
                <Text className="text-foreground text-sm font-semibold">Client link</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => router.push(`/albums/upload?albumId=${albumId}`)}
              accessibilityRole="button"
              className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-action py-2.5 active:opacity-85"
            >
              <UploadIcon size={15} className="text-action-foreground" />
              <Text className="text-action-foreground text-sm font-bold">Upload</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Sections ── */}
      <View className="border-b border-border bg-background">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}
        >
          {chips.map((chip) => {
            const active = section === chip.key;
            const named = chip.key !== 'all' && chip.key !== 'none' && chip.key !== 'picked';
            return (
              <Pressable
                key={chip.key}
                onPress={() => setSection(chip.key)}
                onLongPress={named ? () => sectionMenu(chip.key) : undefined}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${chip.label}, ${plural(chip.count, 'file', 'files')}`}
                accessibilityHint={named && canManage ? 'Hold to rename, reorder or delete' : undefined}
                className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-2 active:opacity-80 ${
                  active ? 'bg-foreground' : 'bg-card border border-border'
                }`}
              >
                {chip.icon === 'heart' && (
                  <HeartIcon size={12} className={active ? 'text-background' : 'text-primary'} fill={active ? palette.background : palette.primary} />
                )}
                <Text className={`text-[13px] font-semibold ${active ? 'text-background' : 'text-foreground'}`}>
                  {chip.label}
                </Text>
                <Text className={`text-[11px] ${active ? 'text-background/70' : 'text-muted-foreground'}`}>
                  {chip.count.toLocaleString()}
                </Text>
              </Pressable>
            );
          })}
          {canManage && (
            <Pressable
              onPress={() => setNaming({ initial: '' })}
              accessibilityRole="button"
              accessibilityLabel="Add a section"
              className="flex-row items-center gap-1 rounded-full px-3.5 py-2 border border-dashed border-border active:opacity-70"
            >
              <PlusIcon size={13} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-[13px] font-semibold">Section</Text>
            </Pressable>
          )}
        </ScrollView>

        <View className="flex-row items-center gap-2 px-4 pb-2.5">
          <View className="flex-row bg-muted rounded-xl p-0.5 flex-1">
            {KINDS.map((option) => {
              const active = kind === option.key;
              const n =
                option.key === 'all'
                  ? counts.image + counts.video + counts.audio + counts.other
                  : counts[option.key];
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setKind(option.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${option.label}, ${n}`}
                  className={`flex-1 items-center py-1.5 rounded-[10px] ${active ? 'bg-card' : ''}`}
                >
                  <Text className={`text-xs font-semibold ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={() => setOrder((current) => (current === 'newest' ? 'oldest' : 'newest'))}
            accessibilityRole="button"
            accessibilityLabel={order === 'newest' ? 'Newest first. Switch to oldest first' : 'Oldest first. Switch to newest first'}
            className="flex-row items-center gap-1 px-2.5 py-2 rounded-xl border border-border active:opacity-70"
          >
            <ArrowDownUpIcon size={13} className="text-foreground" />
            <Text className="text-foreground text-xs font-semibold">
              {order === 'newest' ? 'Newest' : 'Oldest'}
            </Text>
          </Pressable>
          {!selecting && files.length > 0 && (
            <Pressable
              onPress={() => setSelecting(true)}
              accessibilityRole="button"
              accessibilityLabel="Select files"
              className="px-2.5 py-2 rounded-xl border border-border active:opacity-70"
            >
              <CheckIcon size={14} className="text-foreground" />
            </Pressable>
          )}
        </View>
      </View>

      {/* ── The grid, by the day things were taken ── */}
      <GestureDetector gesture={pinch}>
        <View className="flex-1">
          <SectionList
            sections={sections}
            keyExtractor={(row) => `${columns}-${row.firstIndex}`}
            renderItem={renderRow}
            renderSectionHeader={renderDay}
            stickySectionHeadersEnabled
            contentContainerStyle={{ paddingBottom: selecting ? 150 : 40 }}
            onEndReachedThreshold={0.6}
            onEndReached={() => {
              if (filesQuery.hasNextPage && !filesQuery.isFetchingNextPage) {
                void filesQuery.fetchNextPage();
              }
            }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.primary} />
            }
            ListFooterComponent={
              filesQuery.isFetchingNextPage ? (
                <View className="py-8">
                  <ActivityIndicator color={palette.primary} />
                </View>
              ) : null
            }
            ListEmptyComponent={
              filesQuery.isLoading ? (
                <View className="py-16">
                  <ActivityIndicator color={palette.primary} />
                </View>
              ) : filesQuery.loadFailed ? (
                <View className="pt-16">
                  <LoadFailed what="this album" onRetry={() => void filesQuery.refetch()} />
                </View>
              ) : emptyMessage ? (
                <View className="items-center px-10 pt-16">
                  <Text className="text-muted-foreground text-sm text-center leading-5">{emptyMessage}</Text>
                </View>
              ) : (
                <View className="items-center px-8 pt-20">
                  <View className="w-16 h-16 rounded-full bg-muted items-center justify-center">
                    <ImageIcon size={26} className="text-muted-foreground" />
                  </View>
                  <Text className="text-foreground text-lg font-bold mt-4">Nothing here yet</Text>
                  <Text className="text-muted-foreground text-sm text-center mt-1 leading-5">
                    Upload from the shoot and it sorts itself by the day each frame was taken.
                  </Text>
                  <Pressable
                    onPress={() => router.push(`/albums/upload?albumId=${albumId}`)}
                    className="mt-6 bg-action rounded-2xl px-6 py-3.5 flex-row items-center gap-2 active:opacity-85"
                  >
                    <UploadIcon size={17} className="text-action-foreground" />
                    <Text className="text-action-foreground font-semibold">Upload</Text>
                  </Pressable>
                </View>
              )
            }
          />
        </View>
      </GestureDetector>

      {/* ── What to do with the selection ── */}
      {selecting && selection.count > 0 && (
        <SafeAreaView edges={['bottom']} className="absolute left-0 right-0 bottom-0 bg-card border-t border-border">
          <View className="flex-row gap-2 px-3 pt-3 pb-2">
            {canManage && (
              <BulkButton icon={FolderInputIcon} label="Move" disabled={busy} onPress={() => setMoving(true)} />
            )}
            {canDownload && (
              <BulkButton icon={DownloadIcon} label="Save" disabled={busy} onPress={() => void saveSelection()} />
            )}
            {isOwner && onlyOnePhoto && (
              <BulkButton icon={ImageIcon} label="Cover" disabled={busy} onPress={setCover} />
            )}
            {canManage && (
              <BulkButton icon={Trash2Icon} label="Delete" tone="destructive" disabled={busy} onPress={confirmDeleteSelection} />
            )}
          </View>
        </SafeAreaView>
      )}

      {saving && (
        <View className="absolute inset-0 bg-background/80 items-center justify-center" accessibilityLiveRegion="polite">
          <ActivityIndicator color={palette.primary} />
          <Text className="text-foreground text-sm font-semibold mt-3">
            Saving {saving.done + 1 > saving.total ? saving.total : saving.done + 1} of {saving.total}…
          </Text>
        </View>
      )}

      {/* ── Move to section ── */}
      <Sheet visible={moving} onClose={() => setMoving(false)} title={`Move ${plural(selection.count, 'file', 'files')} to`}>
        <View className="gap-2">
          {sectionsQuery.sections.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => moveSelection(s.id)}
              className="flex-row items-center justify-between rounded-2xl border border-border px-4 py-3.5 active:opacity-70"
            >
              <Text className="text-foreground text-[15px] font-semibold">{s.name}</Text>
              <Text className="text-muted-foreground text-xs">{s.count.toLocaleString()}</Text>
            </Pressable>
          ))}
          {sectionsQuery.sections.length > 0 && (
            <Pressable
              onPress={() => moveSelection(null)}
              className="rounded-2xl border border-border px-4 py-3.5 active:opacity-70"
            >
              <Text className="text-muted-foreground text-[15px] font-semibold">No section</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => {
              setMoving(false);
              setNaming({ initial: '' });
            }}
            className="flex-row items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-3.5 active:opacity-70"
          >
            <PlusIcon size={16} className="text-primary" />
            <Text className="text-primary text-[15px] font-semibold">New section…</Text>
          </Pressable>
        </View>
      </Sheet>

      {/* ── Name a section ── */}
      <NameSheet
        // A fresh sheet per opening, so the field starts from `initial`
        // without an effect copying it into state.
        key={naming ? `${naming.id ?? 'new'}:${naming.initial}` : 'closed'}
        visible={!!naming}
        initial={naming?.initial ?? ''}
        title={naming?.id ? 'Rename section' : 'New section'}
        hint={naming?.id ? undefined : 'Prep, Ceremony, Reception — whatever the day was made of.'}
        onCancel={() => setNaming(null)}
        onSave={saveName}
      />

      {/* ── Client link scope ── */}
      <Sheet visible={linkOpen} onClose={() => setLinkOpen(false)} title="Client link">
        <Text className="text-muted-foreground text-sm -mt-2 mb-4">
          Choose what the client sees. Anything unticked is not served by the link at all.
        </Text>
        <View className="gap-2">
          {LINK_SCOPE_ROWS.map((row) => {
            const Icon = row.icon;
            const checked = linkKinds.includes(row.kind);
            const n = albumCounts[row.kind];
            return (
              <Pressable
                key={row.kind}
                onPress={() =>
                  setLinkKinds((current) =>
                    current.includes(row.kind)
                      ? current.filter((k) => k !== row.kind)
                      : [...current, row.kind],
                  )
                }
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                className={`flex-row items-center gap-3 rounded-2xl px-4 py-3.5 border ${
                  checked ? 'bg-primary/10 border-primary/30' : 'border-border'
                }`}
              >
                <View
                  className={`w-[22px] h-[22px] rounded-md items-center justify-center ${
                    checked ? 'bg-action' : 'border-2 border-border'
                  }`}
                >
                  {checked && <CheckIcon size={14} className="text-action-foreground" />}
                </View>
                <Icon size={17} className={checked ? 'text-primary' : 'text-muted-foreground'} />
                <View className="flex-1">
                  <Text className="text-foreground text-sm font-semibold">{row.label}</Text>
                  <Text className="text-muted-foreground text-xs mt-0.5">
                    {plural(n, row.singular, row.plural)}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        {linkKinds.length === 0 && (
          <Text className="text-destructive text-xs mt-3 ml-1">Pick at least one kind of media.</Text>
        )}
        <Pressable
          onPress={() => void createLink()}
          disabled={linkKinds.length === 0 || linking}
          className={`mt-5 rounded-2xl py-3.5 items-center flex-row justify-center gap-2 ${
            linkKinds.length === 0 ? 'bg-muted' : 'bg-action'
          }`}
        >
          {linking && <ActivityIndicator size="small" color={palette.actionForeground} />}
          <Text className={`text-base font-bold ${linkKinds.length === 0 ? 'text-muted-foreground' : 'text-action-foreground'}`}>
            {linking ? 'Making the link…' : 'Make link'}
          </Text>
        </Pressable>
      </Sheet>
    </SafeAreaView>
  );
}

/** One square of the grid: a photograph, a film, a recording or a document. */
function MediaTile({
  file,
  size,
  index,
  selecting,
  selected,
  onPress,
  onLongPress,
}: {
  file: StoredFile;
  size: number;
  index: number;
  selecting: boolean;
  selected: boolean;
  onPress: (file: StoredFile) => void;
  onLongPress: (file: StoredFile) => void;
}) {
  const kind = kindOf(file.contentType);
  const still = kind === 'video' ? file.posterUrl : kind === 'image' ? file.thumbnailUrl ?? file.url : null;
  const what =
    kind === 'image' ? 'Photograph' : kind === 'video' ? 'Film' : kind === 'audio' ? 'Recording' : 'File';

  return (
    <Pressable
      onPress={() => onPress(file)}
      onLongPress={() => onLongPress(file)}
      delayLongPress={280}
      accessibilityRole={selecting ? 'checkbox' : kind === 'image' ? 'imagebutton' : 'button'}
      accessibilityState={selecting ? { checked: selected } : undefined}
      accessibilityLabel={`${what} ${index + 1}, ${file.mediaTitle || file.originalName}${file.picked ? ', picked by your client' : ''}`}
      accessibilityHint={selecting ? undefined : 'Hold to select'}
      style={{ width: size, height: size }}
      className="bg-muted active:opacity-80 overflow-hidden"
    >
      {still ? (
        <Image
          source={{ uri: still }}
          placeholder={file.blurDataUrl ? { uri: file.blurDataUrl } : undefined}
          placeholderContentFit="cover"
          style={{ width: '100%', height: '100%', opacity: selected ? 0.72 : 1 }}
          contentFit="cover"
          transition={140}
          recyclingKey={file.key}
        />
      ) : (
        <View className="flex-1 items-center justify-center px-2 bg-secondary">
          {kind === 'audio' ? (
            <MusicIcon size={22} className="text-muted-foreground" />
          ) : kind === 'video' ? (
            <VideoIcon size={22} className="text-muted-foreground" />
          ) : (
            <FileIcon size={22} className="text-muted-foreground" />
          )}
          {size > 90 && (
            <Text className="text-muted-foreground text-[10px] mt-1.5 text-center" numberOfLines={2}>
              {file.mediaTitle || file.originalName}
            </Text>
          )}
        </View>
      )}

      {kind === 'video' && (
        <View className="absolute right-1 bottom-1 flex-row items-center gap-1 rounded-md bg-foreground/70 px-1.5 py-0.5">
          <PlayIcon size={9} className="text-background" fill="currentColor" />
          {file.durationMs ? (
            <Text className="text-background text-[10px] font-semibold">{clock(file.durationMs / 1000)}</Text>
          ) : null}
        </View>
      )}

      {file.picked && !selecting && (
        <View className="absolute left-1 top-1 w-[18px] h-[18px] rounded-full bg-action items-center justify-center">
          <HeartIcon size={10} className="text-action-foreground" fill="currentColor" />
        </View>
      )}

      {file.processingStatus === 'pending' && (
        <View className="absolute inset-0 items-center justify-center bg-foreground/30">
          {/* White in both themes, over a scrim that darkens either. */}
          <ActivityIndicator size="small" color={PALETTES.light.actionForeground} />
        </View>
      )}

      {selecting && (
        <>
          {selected && <View className="absolute inset-0 border-[3px] border-primary" pointerEvents="none" />}
          <View
            className={`absolute right-1.5 top-1.5 w-[22px] h-[22px] rounded-full items-center justify-center ${
              selected ? 'bg-action' : 'bg-foreground/30 border-2 border-background'
            }`}
            pointerEvents="none"
          >
            {selected && <CheckIcon size={13} className="text-action-foreground" />}
          </View>
        </>
      )}
    </Pressable>
  );
}

function BulkButton({
  icon: Icon,
  label,
  onPress,
  disabled,
  tone,
}: {
  icon: typeof CheckIcon;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'destructive';
}) {
  const color = tone === 'destructive' ? 'text-destructive' : 'text-foreground';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      className={`flex-1 items-center justify-center gap-1 rounded-2xl py-2.5 border ${
        tone === 'destructive' ? 'border-destructive/40 bg-destructive/10' : 'border-border bg-background'
      } ${disabled ? 'opacity-50' : 'active:opacity-70'}`}
    >
      <Icon size={18} className={color} />
      <Text className={`text-[11px] font-semibold ${color}`}>{label}</Text>
    </Pressable>
  );
}

/** A bottom sheet: a scrim that closes it, and a card that does not. */
function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-foreground/40" onPress={onClose} accessibilityLabel="Close" />
      <SafeAreaView edges={['bottom']} className="bg-card rounded-t-3xl">
        <View className="px-5 pt-5 pb-4">
          <Text className="text-foreground text-lg font-bold mb-4" accessibilityRole="header">
            {title}
          </Text>
          {children}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/**
 * A name, typed. Alert.prompt would do, but it exists on iOS only — on
 * Android there is no prompt at all, so this is the one way that works on both.
 */
function NameSheet({
  visible,
  initial,
  title,
  hint,
  onCancel,
  onSave,
}: {
  visible: boolean;
  initial: string;
  title: string;
  hint?: string;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const ready = value.trim().length > 0;

  return (
    <Sheet visible={visible} onClose={onCancel} title={title}>
      <TextInput
        value={value}
        onChangeText={setValue}
        autoFocus
        maxLength={60}
        placeholder="Ceremony"
        returnKeyType="done"
        onSubmitEditing={() => ready && onSave(value)}
        accessibilityLabel="Section name"
        className="rounded-2xl border border-input bg-background px-4 py-3.5 text-foreground text-base"
      />
      {hint ? <Text className="text-muted-foreground text-xs mt-2 ml-1">{hint}</Text> : null}
      <View className="flex-row gap-3 mt-5">
        <Pressable onPress={onCancel} className="flex-1 bg-muted rounded-2xl py-3.5 items-center active:opacity-70">
          <Text className="text-foreground text-base font-semibold">Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => ready && onSave(value)}
          disabled={!ready}
          className={`flex-[2] rounded-2xl py-3.5 items-center ${ready ? 'bg-action active:opacity-85' : 'bg-muted'}`}
        >
          <Text className={`text-base font-bold ${ready ? 'text-action-foreground' : 'text-muted-foreground'}`}>Save</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}
