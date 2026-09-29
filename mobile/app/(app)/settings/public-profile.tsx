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
import { ScreenHeader } from '@/components/ScreenHeader';
import { SITE, profileActionMessage } from '@/src/lib/profile-media';
import { PALETTES } from '@/theme';

for (const Icon of [
  ArrowLeftIcon, AlertCircleIcon, CheckIcon, ExternalLinkIcon,
  ImagePlusIcon, LayersIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon, Share2Icon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}


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
  const { settings, isLoading, loadFailed, refetch } = useProfileSettings();
  const setPublished = useSetPublished();

  // It spun for as long as the settings were missing — forever, offline.
  if (!settings && loadFailed) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <ScreenHeader title="Public profile" />
        <LoadFailed what="your public profile" onRetry={() => void refetch()} />
      </SafeAreaView>
    );
  }

  if (isLoading || !settings) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color={palette.primary} />
      </SafeAreaView>
    );
  }


  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-3 px-5 py-3">
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} hitSlop={10}>
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

        {/* No portfolio here any more. Work goes on a profile by being
            posted to the feed, which is one act rather than two — there is
            nothing to set up, and nothing that can be in one place and not
            the other. */}
      </ScrollView>

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
