import {
  View, Text, ScrollView, Pressable, TextInput, Switch,
  ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform, Share,
} from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  usePortfolio,
  usePortfolioActions,
  useProfileSettings,
  useSetHandle,
  useSetPublished,
  useAlbums,
  useTheme,
  // On mobile `kindOf` lives with the album-file helpers, not in the api
  // barrel — storage.ts is one of the platform-specific modules.
  kindOf,
} from '@/src/hooks';
import { profilesApi, storageApi, profileUrl } from '@/src/api';
import {
  ArrowLeftIcon, AlertCircleIcon, CheckIcon, ExternalLinkIcon,
  ImagePlusIcon, LayersIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon, Share2Icon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { LoadFailed } from '@/components/LoadFailed';
import { SITE } from '@/src/lib/profile-media';
import { PALETTES } from '@/theme';

for (const Icon of [
  ArrowLeftIcon, AlertCircleIcon, CheckIcon, ExternalLinkIcon,
  ImagePlusIcon, LayersIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon, Share2Icon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const MAX_IMAGES = 24;
const MAX_ALBUMS = 12;

/**
 * A profile photo or a cover. They are the account's own uploads too, but a
 * portfolio tile of your own avatar is not work, and the server refuses both.
 */
const PROFILE_PICTURE_KEY = /^users\/[^/]+\/(avatars|covers)\//;

/**
 * The public profile controls.
 *
 * Its own screen rather than another section on Profile: publishing yourself to
 * the open web is a different decision from editing your bio, and it deserves
 * the room to say what it actually does.
 */
export default function PublicProfileScreen() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { settings, isLoading } = useProfileSettings();
  const setPublished = useSetPublished();
  const { items, images, albums, loadFailed, refetch } = usePortfolio();
  const { remove, reorder } = usePortfolioActions();

  const [picking, setPicking] = useState<'images' | 'albums' | null>(null);

  if (isLoading || !settings) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color={palette.primary} />
      </SafeAreaView>
    );
  }

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    reorder.mutate(next.map((i) => i.id));
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-3 px-5 py-3">
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeftIcon size={20} className="text-foreground" />
        </Pressable>
        <Text className="text-foreground text-lg font-bold">Public profile</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, gap: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="bg-card rounded-2xl p-4 gap-3">
          <View className="flex-row items-start gap-3">
            <View className="flex-1">
              <Text className="text-foreground text-[15px] font-bold">
                Show my profile publicly
              </Text>
              <Text className="text-muted-foreground text-xs mt-1 leading-5">
                A page anyone can see, so people looking to hire can find you and
                send work. Off unless you turn it on.
              </Text>
            </View>
            <Switch
              value={settings.published}
              disabled={setPublished.isPending || (!settings.published && !settings.canPublish)}
              trackColor={{ true: palette.primary, false: palette.muted }}
              ios_backgroundColor={palette.muted}
              onValueChange={(next) =>
                setPublished.mutate(next, {
                  onError: (error: Error) => Alert.alert('Not yet', error.message),
                })
              }
            />
          </View>

          {!settings.canPublish && settings.blockers.length > 0 && (
            <View className="flex-row gap-2.5 rounded-xl bg-warning/15 p-3">
              <AlertCircleIcon size={15} className="text-warning" style={{ marginTop: 1 }} />
              <View className="flex-1">
                <Text className="text-warning text-[12px] font-bold">
                  Before you can publish
                </Text>
                {settings.blockers.map((blocker) => (
                  <Text key={blocker} className="text-muted-foreground text-[12px] mt-0.5">
                    · {blocker}
                  </Text>
                ))}
              </View>
            </View>
          )}

          {settings.published && settings.handle && (
            <View className="flex-row items-center gap-5">
              {/* Their own page, in the app — the same view a signed-in visitor
                  gets, so there is no need to leave to check it. */}
              <Pressable
                className="flex-row items-center gap-1.5"
                onPress={() => router.push(`/u/${settings.handle}`)}
              >
                <ExternalLinkIcon size={13} className="text-primary" />
                <Text className="text-primary text-[12px] font-semibold">
                  View my profile
                </Text>
              </Pressable>
              {/* Sharing is the one case that genuinely wants the public URL:
                  it is going into somebody's Instagram bio, not the app. */}
              <Pressable
                className="flex-row items-center gap-1.5"
                onPress={() =>
                  Share.share({ message: profileUrl(settings.handle!, SITE) })
                }
              >
                <Share2Icon size={13} className="text-muted-foreground" />
                <Text className="text-muted-foreground text-[12px] font-semibold">
                  Share link
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        <HandleCard current={settings.handle} changedAt={settings.handleChangedAt} />

        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-foreground text-[15px] font-bold">Portfolio</Text>
              <Text className="text-muted-foreground text-[11px] mt-0.5">
                {images.length}/{MAX_IMAGES} photos · {albums.length}/{MAX_ALBUMS} galleries
              </Text>
            </View>
            <View className="flex-row gap-2">
              <Pressable
                className="bg-card rounded-xl px-3 py-2 flex-row items-center gap-1.5"
                disabled={images.length >= MAX_IMAGES}
                style={{ opacity: images.length >= MAX_IMAGES ? 0.4 : 1 }}
                onPress={() => setPicking('images')}
              >
                <ImagePlusIcon size={14} className="text-primary" />
                <Text className="text-foreground text-[12px] font-semibold">Photos</Text>
              </Pressable>
              <Pressable
                className="bg-card rounded-xl px-3 py-2 flex-row items-center gap-1.5"
                disabled={albums.length >= MAX_ALBUMS}
                style={{ opacity: albums.length >= MAX_ALBUMS ? 0.4 : 1 }}
                onPress={() => setPicking('albums')}
              >
                <LayersIcon size={14} className="text-primary" />
                <Text className="text-foreground text-[12px] font-semibold">Gallery</Text>
              </Pressable>
            </View>
          </View>

          {loadFailed && items.length === 0 ? (
            <View className="rounded-2xl border border-dashed border-border">
              <LoadFailed what="your portfolio" onRetry={() => refetch()} compact />
            </View>
          ) : items.length === 0 ? (
            <View className="rounded-2xl border border-dashed border-border py-8 px-5">
              <Text className="text-muted-foreground text-[12px] text-center leading-5">
                Nothing here yet. Add a few of your best photographs — this is
                what someone judges before they get in touch.
              </Text>
            </View>
          ) : (
            <View className="gap-2">
              {items.map((item, index) => (
                <View key={item.id} className="bg-card rounded-2xl p-2.5 flex-row items-center gap-3">
                  {item.kind === 'image' ? (
                    <RemoteImage
                      source={{ uri: item.url }}
                      style={{ width: 44, height: 44, borderRadius: 8 }}
                    />
                  ) : item.coverUrl ? (
                    <RemoteImage
                      source={{ uri: item.coverUrl }}
                      style={{ width: 44, height: 44, borderRadius: 8 }}
                    />
                  ) : (
                    <View
                      className="bg-primary/10 items-center justify-center"
                      style={{ width: 44, height: 44, borderRadius: 8 }}
                    >
                      <LayersIcon size={16} className="text-primary" />
                    </View>
                  )}

                  <View className="flex-1 min-w-0">
                    <Text className="text-foreground text-[13px] font-semibold" numberOfLines={1}>
                      {item.kind === 'album' ? item.name : (item.caption ?? 'Photo')}
                    </Text>
                    <Text className="text-muted-foreground text-[11px]">
                      {item.kind === 'album'
                        ? `Gallery · ${item.itemCount} ${item.itemCount === 1 ? 'photo' : 'photos'}`
                        : 'Photo'}
                    </Text>
                    {/* Explicitly false only: an older API sends no flag, and
                        that says nothing about whether the photo shows. */}
                    {item.kind === 'image' && item.publiclyShown === false && (
                      <Text className="text-warning text-[11px] leading-4 mt-0.5">
                        Not shown on your profile. Remove it, or add a JPEG copy instead.
                      </Text>
                    )}
                  </View>

                  {/* Arrows, not drag: a long-press reorder inside a ScrollView
                      fights the scroll gesture on a phone. */}
                  <Pressable onPress={() => move(index, -1)} hitSlop={6} disabled={index === 0}
                    style={{ opacity: index === 0 ? 0.25 : 1 }}>
                    <ArrowUpIcon size={16} className="text-muted-foreground" />
                  </Pressable>
                  <Pressable onPress={() => move(index, 1)} hitSlop={6}
                    disabled={index === items.length - 1}
                    style={{ opacity: index === items.length - 1 ? 0.25 : 1 }}>
                    <ArrowDownIcon size={16} className="text-muted-foreground" />
                  </Pressable>
                  <Pressable
                    hitSlop={6}
                    onPress={() =>
                      remove.mutate(item.id, {
                        onError: (error: Error) => Alert.alert('Could not remove', error.message),
                      })
                    }
                  >
                    <TrashIcon size={16} className="text-destructive" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <PickerModal
        mode={picking}
        onClose={() => setPicking(null)}
        chosenKeys={new Set(images.flatMap((i) => (i.kind === 'image' && i.fileKey ? [i.fileKey] : [])))}
        chosenAlbums={new Set(albums.flatMap((a) => (a.kind === 'album' && a.albumId ? [a.albumId] : [])))}
        roomForImages={MAX_IMAGES - images.length}
        roomForAlbums={MAX_ALBUMS - albums.length}
      />
    </SafeAreaView>
  );
}

/** Claim or change the handle, with live availability. */
function HandleCard({
  current, changedAt,
}: {
  current: string | null;
  changedAt: string | null;
}) {
  const [value, setValue] = useState(current ?? '');
  const [debounced, setDebounced] = useState('');
  const setHandle = useSetHandle();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;

  useEffect(() => setValue(current ?? ''), [current]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value.trim().toLowerCase()), 350);
    return () => clearTimeout(id);
  }, [value]);

  const check = useQuery({
    queryKey: ['handle-available', debounced],
    queryFn: () => profilesApi.checkHandle(debounced),
    enabled: debounced.length >= 3 && debounced !== current,
  });

  const lockedUntil = useMemo(() => {
    if (!current || !changedAt) return null;
    const next = new Date(changedAt);
    next.setDate(next.getDate() + 30);
    return next > new Date() ? next : null;
  }, [current, changedAt]);

  const unchanged = value.trim().toLowerCase() === (current ?? '');

  return (
    <View className="bg-card rounded-2xl p-4 gap-2.5">
      <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px]">
        Your address
      </Text>
      <View className="flex-row items-center gap-2">
        <View className="flex-1 flex-row items-center bg-background rounded-xl px-3 py-2.5">
          <Text className="text-muted-foreground text-sm">virgo.ph/@</Text>
          <TextInput
            value={value}
            editable={!lockedUntil}
            onChangeText={(v) => setValue(v.replace(/[^A-Za-z0-9_]/g, '').toLowerCase())}
            placeholder="yourname"
            placeholderTextColor={palette.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={30}
            className="text-foreground text-sm flex-1"
          />
        </View>
        <Pressable
          className="rounded-xl px-4 py-3 bg-action"
          style={{
            opacity:
              unchanged || lockedUntil || value.trim().length < 3 ||
              setHandle.isPending || check.data?.available === false
                ? 0.4 : 1,
          }}
          disabled={
            unchanged || Boolean(lockedUntil) || value.trim().length < 3 ||
            setHandle.isPending || check.data?.available === false
          }
          onPress={() =>
            setHandle.mutate(value.trim().toLowerCase(), {
              onError: (error: Error) => Alert.alert('Could not save', error.message),
            })
          }
        >
          <Text className="text-action-foreground text-[13px] font-bold">
            {current ? 'Change' : 'Claim'}
          </Text>
        </Pressable>
      </View>

      {lockedUntil ? (
        <Text className="text-muted-foreground text-[11px] leading-4">
          You can change this again on{' '}
          {lockedUntil.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}.
        </Text>
      ) : unchanged ? (
        <Text className="text-muted-foreground text-[11px] leading-4">
          {current
            ? 'Changing this breaks every link you have already shared — the old address is not kept or redirected.'
            : 'Letters, numbers and underscores. This becomes your public link.'}
        </Text>
      ) : check.isFetching ? (
        <Text className="text-muted-foreground text-[11px]">Checking…</Text>
      ) : check.data ? (
        <Text
          className={`text-[11px] ${check.data.available ? 'text-success' : 'text-destructive'}`}
        >
          {check.data.available ? 'Available' : check.data.reason}
        </Text>
      ) : null}
    </View>
  );
}

/** Picking photos or galleries to add. */
function PickerModal({
  mode, onClose, chosenKeys, chosenAlbums, roomForImages, roomForAlbums,
}: {
  mode: 'images' | 'albums' | null;
  onClose: () => void;
  chosenKeys: Set<string>;
  chosenAlbums: Set<string>;
  roomForImages: number;
  roomForAlbums: number;
}) {
  const { addImage, addAlbum } = usePortfolioActions();
  const { albums } = useAlbums();
  const [selected, setSelected] = useState<string[]>([]);
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;

  const files = useQuery({
    queryKey: ['storage', 'files', 'all'],
    queryFn: () => storageApi.listFiles({ limit: 200 }),
    enabled: mode === 'images',
  });

  useEffect(() => {
    if (!mode) setSelected([]);
  }, [mode]);

  const availableImages = (files.data?.data ?? []).filter(
    (f) =>
      kindOf(f.contentType) === 'image' &&
      f.url &&
      !chosenKeys.has(f.key) &&
      !PROFILE_PICTURE_KEY.test(f.key),
  );
  const availableAlbums = albums.filter((a) => !chosenAlbums.has(a.id));

  const saveImages = async () => {
    // Sequential: each add re-checks the cap, so parallel writes race it.
    for (const key of selected) {
      try {
        await addImage.mutateAsync({ fileKey: key });
      } catch (error) {
        Alert.alert('Could not add', (error as Error).message);
        break;
      }
    }
    onClose();
  };

  return (
    <Modal visible={mode !== null} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-row items-center justify-between px-5 py-3">
          <Pressable onPress={onClose} hitSlop={10}>
            <Text className="text-muted-foreground text-[15px]">Cancel</Text>
          </Pressable>
          <Text className="text-foreground text-[15px] font-bold">
            {mode === 'albums' ? 'Showcase a gallery' : 'Add work'}
          </Text>
          {mode === 'images' ? (
            <Pressable onPress={saveImages} disabled={selected.length === 0} hitSlop={10}>
              <Text
                className="text-primary text-[15px] font-bold"
                style={{ opacity: selected.length === 0 ? 0.4 : 1 }}
              >
                Add {selected.length || ''}
              </Text>
            </Pressable>
          ) : (
            <View style={{ width: 56 }} />
          )}
        </View>

        {mode === 'images' ? (
          files.isLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color={palette.primary} />
            </View>
          ) : availableImages.length === 0 ? (
            <Text className="text-muted-foreground text-center text-[13px] mt-16 px-8">
              No images left to add. Upload some to an album first.
            </Text>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {availableImages.map((file) => {
                const isOn = selected.includes(file.key);
                return (
                  <Pressable
                    key={file.key}
                    onPress={() =>
                      setSelected((current) =>
                        current.includes(file.key)
                          ? current.filter((k) => k !== file.key)
                          : current.length >= roomForImages
                            ? current
                            : [...current, file.key],
                      )
                    }
                    style={{
                      width: '31.5%', aspectRatio: 1, borderRadius: 10, overflow: 'hidden',
                      borderWidth: 2, borderColor: isOn ? palette.primary : 'transparent',
                    }}
                  >
                    <RemoteImage source={{ uri: file.url as string }} style={{ flex: 1 }} />
                    {isOn && (
                      <View
                        className="bg-primary items-center justify-center"
                        style={{
                          position: 'absolute', top: 6, right: 6, width: 20, height: 20,
                          borderRadius: 10,
                        }}
                      >
                        <CheckIcon size={12} className="text-primary-foreground" />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          )
        ) : (
          <ScrollView contentContainerStyle={{ padding: 20, gap: 8 }}>
            <Text className="text-muted-foreground text-[12px] leading-5 mb-1">
              A separate public link is created for your profile — the link your
              client already has stays private and untouched.
            </Text>
            {availableAlbums.length === 0 ? (
              <Text className="text-muted-foreground text-center text-[13px] mt-10">
                No albums left to showcase.
              </Text>
            ) : (
              availableAlbums.map((album) => (
                <Pressable
                  key={album.id}
                  disabled={roomForAlbums <= 0 || addAlbum.isPending}
                  className="bg-card rounded-2xl p-3.5 flex-row items-center gap-3"
                  onPress={() =>
                    addAlbum.mutate(
                      { albumId: album.id },
                      {
                        onSuccess: onClose,
                        onError: (error: Error) => Alert.alert('Could not add', error.message),
                      },
                    )
                  }
                >
                  <LayersIcon size={16} className="text-primary" />
                  <View className="flex-1">
                    <Text className="text-foreground text-[14px] font-semibold" numberOfLines={1}>
                      {album.name}
                    </Text>
                    <Text className="text-muted-foreground text-[11px]">
                      {album.item_count ?? 0} items
                    </Text>
                  </View>
                </Pressable>
              ))
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}
