import { View, Text, ScrollView, RefreshControl, Pressable, Alert, ActivityIndicator, Share, Platform } from 'react-native';
// expo-image rather than RN Image: it decodes AVIF (and HEIC) on OS
// versions where the RN one silently renders nothing.
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  useAlbum,
  useAlbumFiles,
  useTheme,
  useDeleteAlbum,
  useUpdateAlbum,
  useUpload,
  useWorkspace,
  fileNameFromKey,
} from '@/src/hooks';
import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import {
  ArrowLeftIcon,
  ImageIcon,
  VideoIcon,
  MusicIcon,
  ShieldIcon,
  LayersIcon,
  UploadIcon,
  UserPlusIcon,
  MoreHorizontalIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import * as Clipboard from 'expo-clipboard';
import { albumShareApi, formatBytes, type ShareMediaKind } from '@/src/api';
import { PLACEHOLDER_COVER } from '@/src/lib/placeholder';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ImageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(VideoIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MusicIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ShieldIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(LayersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UploadIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MoreHorizontalIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

type MediaTab = 'photos' | 'videos' | 'audio';

const MEDIA_TABS: {
  key: MediaTab;
  label: string;
  /** Plural used in body copy: "No photos yet", "3 videos". */
  noun: string;
  singular: string;
  icon: typeof ImageIcon;
  /** Sub-route holding the full list for this type. */
  route: string;
}[] = [
  { key: 'photos', label: 'Photos', noun: 'photos', singular: 'photo', icon: ImageIcon, route: 'gallery' },
  { key: 'videos', label: 'Videos', noun: 'videos', singular: 'video', icon: VideoIcon, route: 'videos' },
  { key: 'audio', label: 'Audio', noun: 'audio files', singular: 'audio file', icon: MusicIcon, route: 'audio' },
];

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: '#A8948920', text: '#8B7355', label: 'Draft' },
  review: { bg: '#C1774520', text: '#C17745', label: 'In Review' },
  delivered: { bg: '#6B8E4E20', text: '#4A6B3A', label: 'Delivered' },
};

function retentionLabel(days: number | null): string {
  if (days === null || days === undefined) return 'No expiration';
  if (days === 7) return 'Expires in 7 days';
  if (days === 30) return 'Expires in 30 days';
  return `Expires in ${days} days`;
}

function retentionUrgency(days: number | null): { color: string; bg: string } {
  if (!days) return { color: '#6B8E4E', bg: '#6B8E4E18' };
  if (days <= 7) return { color: '#C76B4A', bg: '#C76B4A18' };
  return { color: '#C17745', bg: '#C1774518' };
}

// Placeholder media items per tab
export default function AlbumDetailScreen() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const { isDark } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const { data: album, refetch: refetchAlbum } = useAlbum(albumId);

  // Real stored media. The strip below used to render generated stock photos,
  // so every album looked populated regardless of its contents.
  const { images, videos, audio, refetch: refetchFiles } = useAlbumFiles(albumId);

  const [activeTab, setActiveTab] = useState<MediaTab>('photos');

  const filesFor = (tab: MediaTab) =>
    tab === 'photos' ? images : tab === 'videos' ? videos : audio;

  const activeMeta = MEDIA_TABS.find((t) => t.key === activeTab) ?? MEDIA_TABS[0];
  const ActiveIcon = activeMeta.icon;
  const activeFiles = filesFor(activeTab);

  const { data: workspace } = useWorkspace(album?.workspace_id);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchAlbum(), refetchFiles()]);
    setRefreshing(false);
  };

  const deleteAlbum = useDeleteAlbum();

  /** Moves the album between draft / in review / delivered. */
  const chooseStatus = () => {
    Alert.alert('Set status', 'Where is this album in your workflow?', [
      { text: 'Draft', onPress: () => setStatus('draft') },
      { text: 'In Review', onPress: () => setStatus('review') },
      { text: 'Delivered', onPress: () => setStatus('delivered') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const setStatus = (status: 'draft' | 'review' | 'delivered') => {
    updateAlbum.mutate(
      { id: albumId, status },
      {
        onError: (err: any) =>
          Alert.alert('Could not update album', err?.message || 'Please try again.'),
      },
    );
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete album',
      // Say what survives: the files are billed against storage either way, so
      // implying the delete frees space would be misleading.
      `"${album?.name ?? 'This album'}" will be removed. Uploaded files stay in your storage and can be filed into another album.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            deleteAlbum.mutate(albumId, {
              onSuccess: () => router.replace('/albums'),
              onError: (err: any) =>
                Alert.alert('Could not delete album', err?.message || 'Please try again.'),
            }),
        },
      ],
    );
  };

  const [isLinking, setIsLinking] = useState(false);

  /**
   * Asks what the link should cover before issuing it.
   *
   * Presets rather than a checkbox list: these are the combinations that
   * actually get used — everything, one kind, or stills-and-motion together.
   */
  const chooseLinkScope = () => {
    const options: { label: string; kinds: ShareMediaKind[] }[] = [
      { label: 'All media', kinds: ['image', 'video', 'audio'] },
      { label: 'Photos only', kinds: ['image'] },
      { label: 'Videos only', kinds: ['video'] },
      { label: 'Audio only', kinds: ['audio'] },
      { label: 'Photos & videos', kinds: ['image', 'video'] },
    ];

    Alert.alert(
      'What should the client see?',
      'Anything left out is not served by the link at all.',
      [
        ...options.map((o) => ({
          text: o.label,
          onPress: () => generateClientLink(o.kinds),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  /**
   * Issues (or re-scopes) the album's client link.
   *
   * The server keeps one active link per album: if one already exists its
   * scope is updated and the same URL returns, so a link already sent to a
   * client stays valid.
   */
  const generateClientLink = async (kinds: ShareMediaKind[]) => {
    if (isLinking) return;
    setIsLinking(true);
    try {
      const link = await albumShareApi.create(albumId, kinds);

      // Show the URL rather than firing the share sheet straight away. The
      // sheet gave no feedback at all if it was dismissed, and never showed
      // the link, so there was no way to tell whether it had worked.
      const scope =
        link.kinds.length === 3
          ? 'All media'
          : link.kinds
              .map((k) => (k === 'image' ? 'Photos' : k === 'video' ? 'Videos' : 'Audio'))
              .join(' & ');

      Alert.alert(`Client link ready — ${scope}`, link.url, [
        {
          text: 'Copy link',
          onPress: async () => {
            await Clipboard.setStringAsync(link.url);
            Alert.alert('Copied', 'The link is on your clipboard.');
          },
        },
        {
          text: 'Share…',
          onPress: () => {
            // iOS takes `url` and shows it properly in the sheet; Android has
            // no url field and reads `message`, so both are supplied.
            void Share.share(
              Platform.OS === 'ios'
                ? { url: link.url, message: album?.name ?? 'Album' }
                : { message: `${album?.name ?? 'Album'} — ${link.url}` },
            );
          },
        },
        { text: 'Done', style: 'cancel' },
      ]);
    } catch (err: any) {
      Alert.alert('Could not create link', err?.message || 'Please try again.');
    } finally {
      setIsLinking(false);
    }
  };

  const revokeClientLink = () => {
    Alert.alert(
      'Revoke client link',
      'Anyone holding the current link will lose access immediately. You can generate a new one afterwards.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              const { revoked } = await albumShareApi.revoke(albumId);
              Alert.alert(
                revoked ? 'Link revoked' : 'No active link',
                revoked
                  ? 'The old link no longer works.'
                  : 'This album has no client link to revoke.',
              );
            } catch (err: any) {
              Alert.alert('Could not revoke link', err?.message || 'Please try again.');
            }
          },
        },
      ],
    );
  };

  const openAlbumMenu = () => {
    Alert.alert(album?.name ?? 'Album', undefined, [
      { text: 'Generate client link', onPress: chooseLinkScope },
      { text: 'Revoke client link', onPress: revokeClientLink },
      { text: 'Change cover', onPress: pickAndUploadCover },
      { text: 'Set status', onPress: chooseStatus },
      { text: 'Invite a collaborator', onPress: () => router.push(`/albums/${albumId}/invite`) },
      { text: 'Delete album', style: 'destructive', onPress: confirmDelete },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const upload = useUpload();
  const updateAlbum = useUpdateAlbum();
  const isUploading = upload.isPending || updateAlbum.isPending;

  /**
   * Picks a photo and sets it as the album cover.
   *
   * The file goes device -> Backblaze B2 directly via a presigned URL; only the
   * resulting public URL is written back to the album row.
   */
  const pickAndUploadCover = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        'Allow photo access to set an album cover.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];

    try {
      const uploaded = await upload.mutateAsync({
        uri: asset.uri,
        scope: 'albums',
        mimeType: asset.mimeType,
      });

      if (!uploaded.publicUrl) {
        Alert.alert(
          'Upload succeeded',
          'The file was stored, but no CDN URL is configured to serve it.',
        );
        return;
      }

      await updateAlbum.mutateAsync({
        id: albumId,
        cover_url: uploaded.publicUrl,
      });
    } catch (err) {
      Alert.alert(
        'Upload failed',
        err instanceof Error ? err.message : 'Please try again.',
      );
    }
  };

  if (!album) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted-foreground text-sm">Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const badge = STATUS_BADGES[album.status] || STATUS_BADGES.draft;
  const retention = retentionUrgency(album.retention_days);
  const wsAccent = workspace?.accent_color || '#B66A40';

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
        {/* ── Hero Cover ── */}
        <View className="relative">
          <Image
            source={{
              uri:
                album.cover_url ||
                PLACEHOLDER_COVER,
            }}
            style={{ width: '100%', height: 220 }}
          />
          {/* Back + More */}
          <View className="absolute top-4 left-5 right-5 flex-row items-center justify-between">
            <Pressable
              onPress={() => router.back()}
              className="w-10 h-10 rounded-2xl bg-black/30 items-center justify-center active:scale-[0.94]"
            >
              <ArrowLeftIcon size={18} className="text-white" />
            </Pressable>
            {/* Only the menu here. This used to sit beside an identical upload
                icon that changed the *cover*, while the labelled Upload button
                further down added *media* — same glyph, different action.
                Changing the cover is now a named item in the menu. */}
            <Pressable
              onPress={openAlbumMenu}
              disabled={isUploading}
              className="w-10 h-10 rounded-2xl bg-black/30 items-center justify-center active:scale-[0.94]"
            >
              {isUploading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <MoreHorizontalIcon size={18} className="text-white" />
              )}
            </Pressable>
          </View>
        </View>

        {/* ── Info card ── */}
        <View className="mx-5 -mt-6 bg-card rounded-2xl p-4" style={{ shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}>
          <View className="flex-row items-start justify-between">
            <View className="flex-1 min-w-0 mr-3">
              <Text className="text-foreground text-xl font-bold">{album.name}</Text>
              {album.description ? (
                <Text className="text-muted-foreground text-sm mt-1" numberOfLines={2}>
                  {album.description}
                </Text>
              ) : null}
              {workspace ? (
                <Text className="text-muted-foreground text-xs mt-2">
                  {workspace.name}
                </Text>
              ) : null}
            </View>
            <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: badge.bg }}>
              <Text style={{ color: badge.text, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                {badge.label}
              </Text>
            </View>
          </View>

          {/* Stats + Retention */}
          <View className="flex-row items-center gap-4 mt-4">
            <View className="flex-row items-center gap-1.5">
              <LayersIcon size={12} style={{ color: wsAccent }} />
              <Text className="text-foreground text-sm font-bold">{album.item_count}</Text>
              <Text className="text-muted-foreground text-xs">items</Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 8,
                backgroundColor: retention.bg,
              }}
            >
              <ShieldIcon size={11} style={{ color: retention.color }} />
              <Text style={{ color: retention.color, fontSize: 10, fontWeight: '600' }}>
                {retentionLabel(album.retention_days)}
              </Text>
            </View>
          </View>

          {/* Actions */}
          <View className="flex-row items-center gap-3 mt-4 pt-4 border-t border-border">
            <Pressable
              onPress={() => router.push(`/albums/upload?albumId=${albumId}`)}
              className="flex-1 bg-primary rounded-xl py-2.5 flex-row items-center justify-center gap-2 active:scale-[0.96]"
            >
              <UploadIcon size={15} className="text-white" />
              <Text className="text-white text-sm font-bold">Upload</Text>
            </Pressable>
            {/* Had no onPress. Uses a person-plus rather than the share glyph:
                lucide's ShareIcon is a box with an up arrow, near-identical to
                the UploadIcon directly beside it. This opens the invite flow,
                so a person icon says what it does. */}
            <Pressable
              onPress={() => router.push(`/albums/${albumId}/invite`)}
              className="w-10 h-10 rounded-xl bg-muted items-center justify-center active:scale-[0.92]"
            >
              <UserPlusIcon size={16} className="text-muted-foreground" />
            </Pressable>
          </View>
        </View>

        {/* ── Media type selector ──
            This row looked like a segmented control but behaved as three
            links: nothing was ever marked selected, and the panel underneath
            always showed photos regardless. It now selects, which is what its
            shape promised all along. */}
        <View className="px-5 mt-6">
          <View className="flex-row bg-muted rounded-2xl p-1">
            {MEDIA_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = tab.key === activeTab;
              const count = filesFor(tab.key).length;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  className={`flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl active:scale-[0.96] ${active ? 'bg-card' : ''}`}
                  style={active ? { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 } : undefined}
                >
                  <Icon size={14} className={active ? 'text-primary' : 'text-muted-foreground'} />
                  <Text className={`text-sm font-semibold ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {tab.label}
                  </Text>
                  {/* The count was the missing signal: without it you had to
                      open each section to find out which ones had anything. */}
                  {count > 0 && (
                    <Text className={`text-[11px] font-bold ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                      {count}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Selected media ── */}
        <View className="px-5 mt-4">
          <View
            className="bg-card rounded-2xl overflow-hidden"
            style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 }}
          >
            {activeFiles.length === 0 ? (
              <Pressable
                onPress={() => router.push(`/albums/upload?albumId=${albumId}&kind=${activeTab === 'audio' ? 'audio' : 'media'}`)}
                className="items-center justify-center py-9 bg-muted/30 active:opacity-70"
              >
                <ActiveIcon size={22} className="text-muted-foreground" />
                <Text className="text-muted-foreground text-xs mt-2">
                  No {activeMeta.noun} yet
                </Text>
                <Text className="text-primary text-xs font-bold mt-2">
                  Add {activeMeta.noun}
                </Text>
              </Pressable>
            ) : activeTab === 'photos' ? (
              <View className="flex-row flex-wrap">
                {activeFiles.slice(0, 8).map((file) => (
                  <Pressable
                    key={file.key}
                    onPress={() => router.push(`/albums/${albumId}/gallery`)}
                    style={{ width: '25%', aspectRatio: 1 }}
                    className="active:opacity-70"
                  >
                    <Image source={{ uri: file.url ?? undefined }} style={{ width: '100%', height: '100%' }} />
                  </Pressable>
                ))}
              </View>
            ) : (
              // Videos and audio have no thumbnail — nothing generates one, and
              // a stock image would misrepresent the file. List them by name.
              <View>
                {activeFiles.slice(0, 4).map((file, i) => (
                  <View
                    key={file.key}
                    className="flex-row items-center gap-3 px-4 py-3"
                    style={i > 0 ? { borderTopWidth: 1, borderTopColor: isDark ? '#2A2522' : '#F0E8E2' } : undefined}
                  >
                    <View className="w-10 h-10 rounded-xl bg-muted items-center justify-center">
                      <ActiveIcon size={16} className="text-muted-foreground" />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                        {fileNameFromKey(file.key)}
                      </Text>
                      <Text className="text-muted-foreground text-xs mt-0.5">
                        {formatBytes(file.sizeBytes)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {activeFiles.length > 0 && (
              <Pressable
                onPress={() => router.push(`/albums/${albumId}/${activeMeta.route}`)}
                className="px-4 py-3 flex-row items-center justify-between active:bg-muted/30"
                style={{ borderTopWidth: 1, borderTopColor: isDark ? '#2A2522' : '#F0E8E2' }}
              >
                <View className="flex-row items-center gap-2">
                  <ActiveIcon size={14} className="text-primary" />
                  <Text className="text-foreground text-sm font-semibold">
                    {activeFiles.length} {activeFiles.length === 1 ? activeMeta.singular : activeMeta.noun}
                  </Text>
                </View>
                <View className="bg-primary/10 rounded-lg px-2.5 py-1">
                  <Text className="text-primary text-[11px] font-bold">See all</Text>
                </View>
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
