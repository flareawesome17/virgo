import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {
  ArrowLeftIcon,
  UploadIcon,
  ImageIcon,
  VideoIcon,
  MusicIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  XIcon,
  PlusIcon,
  FolderIcon,
  ChevronDownIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { contentTypeForAsset, formatBytes, storageApi } from '@/src/api';
import { albumFilesQueryKey, useAlbum, useAlbums, useUsage, useTheme } from '@/src/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { LoadFailed } from '@/components/LoadFailed';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UploadIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ImageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(VideoIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MusicIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckCircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(AlertCircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(XIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(FolderIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronDownIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

type ItemStatus = 'queued' | 'uploading' | 'done' | 'failed';

interface UploadItem {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** 0-1, reported by the upload task. Never synthesised. */
  progress: number;
  status: ItemStatus;
  error?: string;
}

function kindOf(mime: string): 'image' | 'video' | 'audio' | 'other' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'other';
}

function ProgressBar({ fraction, status }: { fraction: number; status: ItemStatus }) {
  const color =
    status === 'failed' ? '#C76B4A' : status === 'done' ? '#6B8E4E' : '#B66A40';
  return (
    <View className="h-1.5 bg-muted rounded-full overflow-hidden">
      <View
        className="h-full rounded-full"
        style={{ width: `${Math.round(Math.min(fraction, 1) * 100)}%`, backgroundColor: color }}
      />
    </View>
  );
}

/**
 * Uploads media to object storage.
 *
 * This screen used to be entirely simulated: a hardcoded list of invented
 * filenames (IMG_4821.CR3 and friends) with setInterval faking the progress
 * bars. Nothing was ever sent anywhere. It now picks real files, sizes them
 * from disk, and reports real byte progress from the upload task.
 */
export default function UploadScreen() {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  // `kind` carries the intent of whatever opened this screen. Tapping "Upload
  // audio" inside an album's Audio tab used to land here with "Photos &
  // videos" as the primary button, which opens the gallery — and the gallery
  // holds no audio.
  const { albumId: routeAlbumId, kind } = useLocalSearchParams<{
    albumId?: string;
    kind?: 'media' | 'audio';
  }>();

  const [items, setItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  // Chosen on this screen when we did not arrive from inside an album — the
  // home and workspace quick actions both land here with no album. Previously
  // this screen only warned about that, so those uploads stored fine and then
  // appeared in no album at all.
  const [pickedAlbumId, setPickedAlbumId] = useState<string | null>(null);
  const [showAlbumPicker, setShowAlbumPicker] = useState(false);

  const albumId = routeAlbumId ?? pickedAlbumId ?? undefined;

  const queryClient = useQueryClient();
  const { data: album } = useAlbum(albumId);
  // Only needed for the picker, so it is not fetched when an album is already
  // fixed by the route.
  const { albums, loadFailed: albumsFailed, refetch: refetchAlbums } = useAlbums(
    { orderBy: 'created_at', direction: 'desc', limit: 100 },
    { enabled: !routeAlbumId },
  );
  const { usage, storageLimitBytes, storageUsedBytes, refetch: refetchUsage } = useUsage();

  const patch = useCallback((id: string, next: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...next } : it)));
  }, []);

  const addPicked = (picked: UploadItem[]) =>
    setItems((prev) => [...prev, ...picked]);

  /** Photos and videos come from the media library. */
  const pickMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to choose files.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (result.canceled) return;

    const picked: UploadItem[] = [];
    for (const asset of result.assets) {
      // Real size from disk, not a label.
      const info = await FileSystem.getInfoAsync(asset.uri);
      const sizeBytes = info.exists ? (info.size ?? 0) : 0;
      picked.push({
        id: `${asset.assetId ?? asset.uri}-${picked.length}-${items.length}`,
        uri: asset.uri,
        name: asset.fileName ?? asset.uri.split('/').pop() ?? 'file',
        mimeType: contentTypeForAsset({ uri: asset.uri, mimeType: asset.mimeType }),
        sizeBytes,
        progress: 0,
        status: 'queued',
      });
    }

    addPicked(picked);
  };

  /**
   * Audio comes from the document picker.
   *
   * expo-image-picker only exposes the photo library, so asking it for audio
   * opened the gallery — there is no audio in there to choose. The document
   * picker opens the system file browser, which is where audio actually lives.
   */
  const pickAudio = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;

    const picked: UploadItem[] = result.assets.map((asset, i) => ({
      id: `${asset.uri}-${i}-${items.length}`,
      uri: asset.uri,
      name: asset.name ?? asset.uri.split('/').pop() ?? 'audio',
      mimeType: contentTypeForAsset({ uri: asset.uri, mimeType: asset.mimeType }),
      // DocumentPicker reports size directly; fall back to 0 if absent.
      sizeBytes: asset.size ?? 0,
      progress: 0,
      status: 'queued',
    }));

    addPicked(picked);
  };

  /**
   * Opens the right chooser straight away when the caller said what it wanted.
   *
   * Guarded by a ref rather than an empty dep array alone: the effect must
   * fire exactly once per mount, never again on a re-render or a state change.
   */
  const autoOpened = useRef(false);
  useEffect(() => {
    if (!kind || autoOpened.current) return;
    autoOpened.current = true;
    if (kind === 'audio') pickAudio();
    else pickMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((it) => it.id !== id));

  const queued = items.filter((i) => i.status === 'queued' || i.status === 'failed');
  const completed = items.filter((i) => i.status === 'done');
  const totalBytes = items.reduce((s, i) => s + i.sizeBytes, 0);
  const sentBytes = items.reduce((s, i) => s + i.sizeBytes * i.progress, 0);
  const overall = totalBytes > 0 ? sentBytes / totalBytes : 0;

  const queuedBytes = queued.reduce((s, i) => s + i.sizeBytes, 0);
  const wouldExceed =
    storageLimitBytes != null && storageUsedBytes + queuedBytes > storageLimitBytes;

  const startUpload = async () => {
    if (queued.length === 0 || isUploading) return;
    setIsUploading(true);

    let succeeded = 0;
    // Sequential rather than parallel: several large videos at once compete for
    // bandwidth and make every progress bar crawl.
    for (const item of queued) {
      patch(item.id, { status: 'uploading', progress: 0, error: undefined });
      try {
        await storageApi.uploadFile(item.uri, {
          contentType: item.mimeType,
          scope: 'albums',
          // Without this the object is stored but linked to no album, so it
          // uploads "successfully" and then appears nowhere.
          albumId,
          onProgress: (fraction) => patch(item.id, { progress: fraction }),
        });
        patch(item.id, { status: 'done', progress: 1 });
        succeeded++;
      } catch (err) {
        patch(item.id, {
          status: 'failed',
          error: err instanceof Error ? err.message : 'Upload failed',
        });
      }
    }

    setIsUploading(false);
    await refetchUsage();

    // The album screens read a cached file list; without this the gallery keeps
    // showing the pre-upload state until it happens to refetch.
    if (succeeded > 0) {
      await queryClient.invalidateQueries({
        queryKey: albumFilesQueryKey(albumId),
      });
    }

    // item_count is no longer incremented here: the API now derives it by
    // counting the files attached to the album, so a counter maintained from
    // the client could only drift away from the truth.
    if (succeeded > 0) {
      await queryClient.invalidateQueries({ queryKey: ['albums'] });
    }
  };

  // An album is required. Uploading without one is what produced files that
  // consumed quota but showed up in no album.
  const canUpload = !isUploading && queued.length > 0 && !wouldExceed && !!albumId;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 160 }}
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
          >
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <View className="flex-1 min-w-0">
            <Text className="text-foreground text-[22px] font-bold tracking-tight">
              {kind === 'audio' ? 'Upload audio' : kind === 'media' ? 'Upload media' : 'Upload'}
            </Text>
            <Text className="text-muted-foreground text-sm mt-0.5" numberOfLines={1}>
              {album ? `To ${album.name}` : 'Not linked to an album'}
            </Text>
          </View>
        </View>

        {/* Overall progress */}
        {items.length > 0 && (
          <View
            className="mx-5 mt-4 bg-card rounded-2xl p-4"
            style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 }}
          >
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-foreground text-sm font-bold">
                {completed.length} of {items.length} uploaded
              </Text>
              <Text className="text-muted-foreground text-xs font-semibold">
                {formatBytes(sentBytes)} / {formatBytes(totalBytes)}
              </Text>
            </View>
            <ProgressBar fraction={overall} status={isUploading ? 'uploading' : 'queued'} />
          </View>
        )}

        {/* Reaching this screen without an album is possible from the home and
            workspace quick actions, so the album is chosen here instead. */}
        {!routeAlbumId && (
          <View className="px-5 mt-4">
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
              Album
            </Text>
            <Pressable
              onPress={() => setShowAlbumPicker((v) => !v)}
              disabled={isUploading}
              className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3 active:scale-[0.98]"
              style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
            >
              <FolderIcon size={16} className={pickedAlbumId ? 'text-primary' : 'text-muted-foreground'} />
              <Text className={`text-sm flex-1 ${pickedAlbumId ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                {albums.find((a) => a.id === pickedAlbumId)?.name ?? 'Choose an album'}
              </Text>
              <ChevronDownIcon size={14} className="text-muted-foreground" />
            </Pressable>

            {showAlbumPicker && (
              <View className="mt-2 bg-card rounded-2xl overflow-hidden" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                {albumsFailed && albums.length === 0 ? (
                  // Offering "Create your first album" to someone who has ten
                  // of them, because the list failed, is how duplicates happen.
                  <LoadFailed what="your albums" onRetry={() => refetchAlbums()} compact />
                ) : albums.length === 0 ? (
                  <Pressable
                    onPress={() => { setShowAlbumPicker(false); router.push('/albums/create'); }}
                    className="px-4 py-3.5 active:bg-muted/30 flex-row items-center gap-2"
                  >
                    <PlusIcon size={14} className="text-primary" />
                    <Text className="text-primary text-sm font-semibold">Create your first album</Text>
                  </Pressable>
                ) : (
                  albums.map((a, i) => (
                    <Pressable
                      key={a.id}
                      onPress={() => { setPickedAlbumId(a.id); setShowAlbumPicker(false); }}
                      className="px-4 py-3 active:bg-muted/30 flex-row items-center gap-3"
                      style={i < albums.length - 1 ? { borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' } : undefined}
                    >
                      <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: '#B66A4022', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#B66A40' }}>{a.name.charAt(0)}</Text>
                      </View>
                      <Text className="text-foreground text-sm flex-1">{a.name}</Text>
                      {a.id === pickedAlbumId && <CheckCircleIcon size={15} className="text-primary" />}
                    </Pressable>
                  ))
                )}
              </View>
            )}

            {!albumId && items.length > 0 && (
              <Text className="text-[#C17745] text-xs mt-2 ml-1">
                Pick an album first — otherwise these files upload but appear in
                no album.
              </Text>
            )}
          </View>
        )}

        {/* Quota warning */}
        {wouldExceed && (
          <View className="mx-5 mt-4 rounded-2xl p-4" style={{ backgroundColor: '#C76B4A18' }}>
            <Text className="text-[#C76B4A] text-sm font-bold">Not enough storage</Text>
            <Text className="text-[#C76B4A] text-xs mt-1">
              These files need {formatBytes(queuedBytes)} but only{' '}
              {formatBytes(Math.max((storageLimitBytes ?? 0) - storageUsedBytes, 0))} is free.
              Remove some, or free up space.
            </Text>
          </View>
        )}

        {items.length === 0 ? (
          <View className="px-5 mt-10 items-center">
            <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-5">
              <UploadIcon size={32} className="text-primary" />
            </View>
            <Text className="text-foreground text-lg font-bold">Nothing selected</Text>
            <Text className="text-muted-foreground text-sm text-center mt-2 px-6">
              {kind === 'audio'
                ? 'Choose audio files from your device'
                : 'Choose photos or videos to upload'}
              {usage?.storage.limitBytes
                ? ` — ${formatBytes(Math.max(usage.storage.limitBytes - usage.storage.usedBytes, 0))} free`
                : ''}
            </Text>
            {/* Each source is offered only where it makes sense: photos and
                videos come from the gallery, audio from the file browser. When
                the caller named a kind, the other chooser is not shown. */}
            <View className="mt-7 gap-3 w-full px-4">
              {kind !== 'audio' && (
                <Pressable
                  onPress={pickMedia}
                  className="bg-primary rounded-2xl py-3.5 flex-row items-center justify-center gap-2 active:scale-[0.96]"
                  style={{ shadowColor: '#B66A40', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}
                >
                  <ImageIcon size={17} className="text-white" />
                  <Text className="text-white text-base font-bold">Photos & videos</Text>
                </Pressable>
              )}
              {kind !== 'media' && (
                <Pressable
                  onPress={pickAudio}
                  className={`rounded-2xl py-3.5 flex-row items-center justify-center gap-2 active:scale-[0.96] ${kind === 'audio' ? 'bg-primary' : 'bg-card'}`}
                  style={kind === 'audio'
                    ? { shadowColor: '#B66A40', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 }
                    : { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
                >
                  <MusicIcon size={17} className={kind === 'audio' ? 'text-white' : 'text-primary'} />
                  <Text className={`text-base font-bold ${kind === 'audio' ? 'text-white' : 'text-foreground'}`}>
                    Audio files
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        ) : (
          <View className="px-5 mt-5 gap-2">
            {items.map((item) => {
              const kind = kindOf(item.mimeType);
              const Icon = kind === 'video' ? VideoIcon : kind === 'audio' ? MusicIcon : ImageIcon;
              return (
                <View
                  key={item.id}
                  className="bg-card rounded-2xl p-3.5"
                  style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
                >
                  <View className="flex-row items-center gap-3">
                    <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: '#B66A4018', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={16} className="text-primary" />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text className="text-muted-foreground text-[11px] mt-0.5" numberOfLines={1}>
                        {formatBytes(item.sizeBytes)}
                        {item.status === 'failed' && item.error ? ` · ${item.error}` : ''}
                      </Text>
                    </View>

                    {item.status === 'done' ? (
                      <CheckCircleIcon size={18} className="text-[#6B8E4E]" />
                    ) : item.status === 'failed' ? (
                      <AlertCircleIcon size={18} className="text-[#C76B4A]" />
                    ) : item.status === 'uploading' ? (
                      <Text className="text-primary text-xs font-bold">
                        {Math.round(item.progress * 100)}%
                      </Text>
                    ) : (
                      <Pressable
                        onPress={() => removeItem(item.id)}
                        className="w-7 h-7 rounded-full bg-muted items-center justify-center active:scale-[0.9]"
                      >
                        <XIcon size={13} className="text-muted-foreground" />
                      </Pressable>
                    )}
                  </View>

                  {(item.status === 'uploading' || item.status === 'done') && (
                    <View className="mt-2.5">
                      <ProgressBar fraction={item.progress} status={item.status} />
                    </View>
                  )}
                </View>
              );
            })}

            <View className="mt-2 flex-row gap-2">
              {kind !== 'audio' && (
                <Pressable
                  onPress={pickMedia}
                  disabled={isUploading}
                  className="flex-1 rounded-2xl py-3 items-center active:scale-[0.98]"
                  style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: '#D9C2B7' }}
                >
                  <Text className="text-muted-foreground text-sm font-semibold">+ Photos</Text>
                </Pressable>
              )}
              {kind !== 'media' && (
                <Pressable
                  onPress={pickAudio}
                  disabled={isUploading}
                  className="flex-1 rounded-2xl py-3 items-center active:scale-[0.98]"
                  style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: '#D9C2B7' }}
                >
                  <Text className="text-muted-foreground text-sm font-semibold">+ Audio</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {items.length > 0 && (
        <View
          className="absolute bottom-0 left-0 right-0 px-5 pt-3 bg-background flex-row gap-3"
          style={{ paddingBottom: insets.bottom + 16 }}
        >
          <Pressable
            onPress={() => router.back()}
            disabled={isUploading}
            className="flex-1 rounded-2xl py-3.5 items-center bg-card active:scale-[0.97]"
          >
            <Text className="text-foreground text-base font-bold">
              {completed.length === items.length ? 'Done' : 'Cancel'}
            </Text>
          </Pressable>
          <Pressable
            onPress={startUpload}
            disabled={!canUpload}
            className={`flex-[2] rounded-2xl py-3.5 items-center flex-row justify-center gap-2 active:scale-[0.97] ${canUpload ? 'bg-primary' : 'bg-muted'}`}
          >
            {isUploading && <ActivityIndicator size="small" color="#FFFFFF" />}
            <Text className={`text-base font-bold ${canUpload ? 'text-white' : 'text-muted-foreground'}`}>
              {isUploading
                ? 'Uploading…'
                : queued.length === 0
                  ? 'All uploaded'
                  : !albumId
                    ? 'Choose an album'
                    : `Upload ${queued.length} file${queued.length > 1 ? 's' : ''}`}
            </Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
