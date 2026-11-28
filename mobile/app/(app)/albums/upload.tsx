import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRightIcon, FolderIcon, ImageIcon, MusicIcon, type LucideIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { formatBytes } from '@/src/api';
import { useAlbum, useAlbums, useAuth, useTheme, useUsage } from '@/src/hooks';
import { FormCard, FormHint, FormNotice, FormRow, FormSection } from '@/components/Form';
import { FormHeader } from '@/components/FormHeader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InsetFrame } from '@/components/InsetFrame';
import { LoadFailed } from '@/components/LoadFailed';
import { ChoiceSheet } from '@/components/WorkspaceBits';
import { useUploadPicker, type UploadSource } from '@/components/upload/useUploadPicker';
import { PALETTES } from '@/theme';

for (const Icon of [ChevronRightIcon, FolderIcon, ImageIcon, MusicIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** What the API lets add files: the owner, and upload or manage access. */
function canUploadTo(access: string | null | undefined): boolean {
  return access === undefined || access === 'owner' || access === 'upload' || access === 'manage';
}

/**
 * Adding files from somewhere that is not an album: the album first, then
 * what to add.
 *
 * Inside an album there is no screen for this at all: Upload opens a short
 * sheet and the phone's picker, and the files start (UploadSourceSheet). This
 * page is for the places that have no album yet to add to, a workspace's
 * Upload or a showcase post, where the album has to be said before anything
 * else can be. Once the files are handed over it goes to that album, which is
 * where their progress is shown.
 *
 * It was the whole of uploading: a list of the chosen files by name, a button
 * to start them, and the running queue underneath. The queue is a sheet over
 * every screen now (UploadsSheet), and the list was the phone's picker shown
 * a second time, worse.
 */
export default function UploadScreen() {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  // `kind` carries the intent of whatever opened this screen. Tapping "Upload
  // audio" inside an album's Audio list used to land here with "Photos &
  // videos" as the primary button, which opens the gallery — and the gallery
  // holds no audio.
  const { albumId: routeAlbumId, kind } = useLocalSearchParams<{ albumId?: string; kind?: UploadSource }>();
  const { user } = useAuth();
  const { storageLimitBytes, storageUsedBytes } = useUsage();

  // Chosen here when we did not arrive from inside an album. Uploading
  // without one is what produced files that used quota and showed in no album.
  const [pickedAlbumId, setPickedAlbumId] = useState<string | null>(null);
  const [choosingAlbum, setChoosingAlbum] = useState(false);
  const albumId = routeAlbumId ?? pickedAlbumId ?? undefined;

  const { data: album } = useAlbum(albumId);
  // Only needed for the picker, so it is not fetched when an album is already
  // fixed by the route.
  const { albums: listed, loadFailed: albumsFailed, isLoading: albumsLoading, refetch: refetchAlbums } = useAlbums(
    { orderBy: 'created_at', direction: 'desc', limit: 100 },
    { enabled: !routeAlbumId },
  );
  // Only the ones you can add to. It listed every album you could see, so a
  // view-only one could be picked and every file failed after you had left.
  const albums = listed.filter((a) => canUploadTo(a.my_access));
  const refused = !!album && !canUploadTo(album.my_access);

  // Only against your own storage when the album is yours: see useUploadPicker.
  const billedToMe = !album || (album.my_access ? album.my_access === 'owner' : album.user_id === user?.id);
  const picker = useUploadPicker({ albumId, albumName: album?.name, billedToMe });

  const add = async (source: UploadSource) => {
    if (!albumId) {
      setChoosingAlbum(true);
      return;
    }
    const sent = await picker.pick(source);
    // To the album, where the files now show as they go up. Replaced, not
    // pushed: Back from the album should not come here again.
    if (sent > 0) router.replace(`/albums/${albumId}`);
  };

  /**
   * Opens the right chooser straight away when the caller said what it wanted
   * and where. Guarded by a ref: once per mount, never again on a re-render.
   */
  const autoOpened = useRef(false);
  useEffect(() => {
    if (!kind || !routeAlbumId || autoOpened.current) return;
    autoOpened.current = true;
    void add(kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, routeAlbumId]);

  const free = storageLimitBytes != null ? Math.max(storageLimitBytes - storageUsedBytes, 0) : null;

  return (
    <InsetFrame edges={['top']}>
      <FormHeader title="Upload" subtitle={album ? `To ${album.name}` : undefined} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: Math.max(40, insets.bottom + 32), gap: 24 }}>
        {refused && (
          <FormNotice
            title={`You can’t add to ${album?.name ?? 'this album'}.`}
            body="It is shared with you to look at. Ask whoever owns it for upload access, or choose another album."
          />
        )}

        {!routeAlbumId && (
          <FormSection title="Where it goes">
            {albumsFailed && albums.length === 0 ? (
              // Offering "Create your first album" to someone who has ten of
              // them, because the list failed, is how duplicates happen.
              <LoadFailed what="your albums" onRetry={() => void refetchAlbums()} compact />
            ) : albumsLoading && albums.length === 0 ? (
              <ActivityIndicator color={palette.primary} style={{ paddingVertical: 12 }} />
            ) : albums.length === 0 ? (
              <FormCard>
                <FormRow
                  first
                  icon={FolderIcon}
                  label="Create your first album"
                  onPress={() => router.push('/albums/create')}
                />
              </FormCard>
            ) : (
              <FormCard>
                <FormRow
                  first
                  icon={FolderIcon}
                  label="Album"
                  value={album?.name ?? 'Choose one'}
                  empty={!album}
                  onPress={() => setChoosingAlbum(true)}
                  accessibilityHint="Choose which album the files go into"
                />
              </FormCard>
            )}
          </FormSection>
        )}

        <FormSection title="What to add">
          {kind !== 'audio' && (
            <Source
              main
              icon={ImageIcon}
              name="Photos and videos"
              detail="From this phone’s library"
              disabled={refused || picker.busy}
              onPress={() => void add('media')}
            />
          )}
          {kind !== 'media' && (
            <Source
              main={kind === 'audio'}
              icon={MusicIcon}
              name="Audio files"
              detail="Vows, speeches, a finished track"
              disabled={refused || picker.busy}
              onPress={() => void add('audio')}
            />
          )}
          {picker.busy ? <FormHint>Checking what the album already has…</FormHint> : null}
        </FormSection>

        {free !== null && storageLimitBytes ? (
          <View className="gap-2">
            <View className="h-1.5 rounded-full bg-muted overflow-hidden">
              <View
                className="h-full rounded-full bg-secondary-foreground"
                style={{ width: `${Math.round(Math.min(storageUsedBytes / storageLimitBytes, 1) * 100)}%` }}
              />
            </View>
            <Text className="text-muted-foreground text-[13px] leading-[18px]">
              <Text className="text-foreground font-semibold">{formatBytes(free)} free</Text> of{' '}
              {formatBytes(storageLimitBytes)}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <ChoiceSheet
        visible={choosingAlbum}
        title="Album"
        hint="The files go into one of your albums."
        options={albums.map((a) => ({ value: a.id, label: a.name }))}
        value={pickedAlbumId}
        onChoose={setPickedAlbumId}
        onClose={() => setChoosingAlbum(false)}
      />
    </InsetFrame>
  );
}

/** One place files come from, as a large row: the filled one is what this screen is for. */
function Source({
  icon: Icon,
  name,
  detail,
  main,
  disabled,
  onPress,
}: {
  icon: LucideIcon;
  name: string;
  detail: string;
  main?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={`${name}. ${detail}`}
      className={`min-h-[76px] rounded-[20px] flex-row items-center gap-3.5 px-[18px] ${
        main ? 'bg-action' : 'bg-card border border-border/40'
      } ${disabled ? 'opacity-50' : 'active:opacity-85'}`}
    >
      <View className={`w-11 h-11 rounded-[14px] items-center justify-center ${main ? 'bg-white/20' : 'bg-muted'}`}>
        <Icon size={21} className={main ? 'text-action-foreground' : 'text-foreground'} />
      </View>
      <View className="flex-1 min-w-0">
        <Text className={`text-[16px] leading-[22px] font-semibold ${main ? 'text-action-foreground' : 'text-foreground'}`}>
          {name}
        </Text>
        <Text className={`text-[13px] leading-[18px] ${main ? 'text-action-foreground/80' : 'text-muted-foreground'}`}>
          {detail}
        </Text>
      </View>
      <ChevronRightIcon size={18} className={main ? 'text-action-foreground' : 'text-muted-foreground/60'} />
    </Pressable>
  );
}
