import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import {
  ArrowLeftIcon,
  AtSignIcon,
  Building2Icon,
  CalendarCheckIcon,
  CalendarIcon,
  CopyIcon,
  GlobeIcon,
  InfoIcon,
  MapPinIcon,
  PencilIcon,
  Share2Icon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { LoadFailed } from '@/components/LoadFailed';
import { ActionSheet } from '@/components/WorkspaceBits';
import {
  PortfolioBlock,
  ProfileAvatar,
  ProfileCover,
  ProfileDetails,
  ProfileStatsLine,
  type ProfileDetailRow,
} from '@/components/ProfileParts';
import { useAvatarEditor, useCoverEditor } from '@/components/ProfilePhotoEditors';
import { useAuth, useProfilePage, useProfileSettings, useTheme } from '@/src/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { profileBanner, profileUrl, queryKeys, titleFromRoles } from '@/src/api';
import { SITE, SITE_HOST } from '@/src/lib/profile-media';
import { PALETTES } from '@/theme';

// Every icon drawn on this screen, including the ones handed to
// ProfileDetails: it draws them by class, which only works once registered.
for (const Icon of [
  ArrowLeftIcon, AtSignIcon, Building2Icon, CalendarCheckIcon, CalendarIcon,
  CopyIcon, GlobeIcon, InfoIcon, MapPinIcon, PencilIcon, Share2Icon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const LABEL = 'text-muted-foreground text-[11px] font-bold uppercase tracking-[2px]';

/**
 * "Your profile": the page as people see it, with the pictures editable where
 * they sit.
 *
 * Built from three sources, so it degrades a piece at a time rather than all
 * at once on an older API:
 * - the header from the session, which updates the moment a save lands and is
 *   never written to disk;
 * - the publish card and the handle from the profile settings;
 * - the stats and the portfolio from GET /me/profile/page, the public
 *   presentation of the account — so what you see here is what a visitor
 *   gets. On an API without that route only this part fails.
 *
 * No tabs, featured row or composer: nothing ships empty. Showcases bring them.
 */
export default function YourProfileScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;

  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const settingsQuery = useProfileSettings();
  const pageQuery = useProfilePage();
  const cover = useCoverEditor();
  const avatar = useAvatarEditor();

  const [coverMenuOpen, setCoverMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  if (!profile || !user) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color={palette.primary} />
      </SafeAreaView>
    );
  }

  const settings = settingsQuery.settings;
  const page = pageQuery.page;
  const handle = settings?.handle ?? null;
  const published = Boolean(settings?.published && handle);

  const name = profile.displayName?.trim() || user.email.split('@')[0];
  const title = profile.title?.trim() || titleFromRoles(profile.roles);
  const coverUrl = profile.coverUrl ?? null;
  const banner = profileBanner({ coverUrl, portfolio: page?.portfolio ?? [] });

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // The header, Details and About come from the session, not the page, so
      // a bio or photo changed on the web only shows once it is refetched too.
      await Promise.all([
        pageQuery.refetch(),
        settingsQuery.refetch(),
        queryClient.refetchQueries({ queryKey: queryKeys.auth.session }),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const copyLink = async () => {
    if (!handle) return;
    await Clipboard.setStringAsync(profileUrl(handle, SITE));
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  const website = profile.website?.trim() || null;
  const studio = profile.studioName?.trim() || null;

  const rows: ProfileDetailRow[] = [];
  if (profile.location?.trim()) rows.push({ icon: MapPinIcon, text: profile.location.trim() });
  if (studio) {
    rows.push({
      icon: Building2Icon,
      text: studio,
      // The studio is private until they choose to show it, and this page is
      // supposed to be what visitors see — so say it is not there for them.
      sub: profile.showStudio ? undefined : 'Hidden from your profile',
    });
  }
  if (handle) {
    rows.push({
      icon: AtSignIcon,
      text: `${SITE_HOST}/@${handle}`,
      // Unpublished, the address answers "not found" to everybody else, so
      // it is not offered for copying — the way forward is to publish.
      sub: published ? undefined : 'Not published yet',
      trailing: published ? (
        <Pressable
          onPress={copyLink}
          accessibilityRole="button"
          accessibilityLabel={copied ? 'Link copied' : 'Copy link to your profile'}
          hitSlop={8}
          className="flex-row items-center gap-1.5 min-h-11 pl-2"
        >
          <CopyIcon size={14} className="text-primary" />
          <Text className="text-primary text-[13px] font-semibold">
            {copied ? 'Copied' : 'Copy'}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => router.push('/settings/public-profile')}
          accessibilityRole="button"
          accessibilityLabel="Publish your profile"
          hitSlop={8}
          className="min-h-11 justify-center pl-2"
        >
          <Text className="text-primary text-[13px] font-semibold">Publish</Text>
        </Pressable>
      ),
    });
  }
  if (profile.availableForBookings) {
    rows.push({ icon: CalendarCheckIcon, text: 'Available for bookings', tone: 'success' });
  }
  if (website) {
    rows.push({
      icon: GlobeIcon,
      text: website.replace(/^https?:\/\//i, ''),
      tone: 'link',
      onPress: () =>
        Linking.openURL(/^https?:\/\//i.test(website) ? website : `https://${website}`),
    });
  }
  rows.push({ icon: CalendarIcon, text: `On Virgo since ${new Date(profile.createdAt).getFullYear()}` });

  const hidden = page?.portfolioHidden ?? 0;
  const bio = profile.bio?.trim() || null;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-3 px-5 py-3">
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeftIcon size={20} className="text-foreground" />
        </Pressable>
        <Text className="text-foreground text-lg font-bold flex-1" numberOfLines={1}>
          Your profile
        </Text>
        {/* Only a published address is worth sending anyone. */}
        {published && handle && (
          <Pressable
            hitSlop={13}
            accessibilityRole="button"
            accessibilityLabel="Share your profile"
            onPress={() => Share.share({ message: `${name} on Virgo — ${profileUrl(handle, SITE)}` })}
          >
            <Share2Icon size={18} className="text-muted-foreground" />
          </Pressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
        }
      >
        <ProfileCover
          banner={banner}
          width={width}
          edit={{
            label: coverUrl ? 'Edit cover' : 'Add cover',
            busy: cover.busy,
            onPress: () => (coverUrl ? setCoverMenuOpen(true) : cover.choose()),
          }}
        />

        <View className="px-5">
          <View style={{ marginTop: -52 }}>
            <ProfileAvatar
              url={profile.avatarUrl}
              name={name}
              size={104}
              onEdit={avatar.choose}
              busy={avatar.busy}
            />
          </View>

          <Text className="text-foreground text-[24px] font-extrabold mt-3" numberOfLines={2}>
            {name}
          </Text>
          {title ? (
            <Text className="text-muted-foreground text-[15px] font-medium mt-0.5">{title}</Text>
          ) : null}

          {/* Hidden while loading and when the page failed: a row of zeros
              would be a claim, not a placeholder. */}
          <ProfileStatsLine stats={page?.stats ?? null} className="mt-2" />

          <Pressable
            onPress={() => router.push('/settings/profile')}
            accessibilityRole="button"
            className="rounded-2xl py-3.5 flex-row items-center justify-center gap-2 mt-4 bg-muted active:opacity-80"
          >
            <PencilIcon size={16} className="text-foreground" />
            <Text className="text-foreground text-[15px] font-bold">Edit profile</Text>
          </Pressable>

          {settings && (!settings.published || !settings.handle) && (
            <View className="bg-card rounded-2xl border border-border/40 p-4 mt-4">
              <View className="flex-row items-center gap-2">
                <GlobeIcon size={18} className="text-primary" />
                <Text className="text-foreground text-[15px] font-bold">Publish your profile</Text>
              </View>
              <Text className="text-muted-foreground text-[13px] leading-5 mt-2">
                {settings.handle
                  ? `Only you can see this page. Publish it so people looking to hire can find you at ${SITE_HOST}/@${settings.handle}.`
                  : 'Only you can see this page. Choose a handle and publish it so people looking to hire can find you.'}
              </Text>
              {settings.blockers.length > 0 && (
                <View className="mt-2">
                  <Text className="text-foreground text-[12px] font-bold">Still to do</Text>
                  {settings.blockers.map((blocker) => (
                    <Text key={blocker} className="text-muted-foreground text-[12px] leading-5 mt-0.5">
                      · {blocker}
                    </Text>
                  ))}
                </View>
              )}
              <Pressable
                onPress={() => router.push('/settings/public-profile')}
                accessibilityRole="button"
                className="bg-action rounded-xl py-3 mt-3 items-center active:opacity-90"
              >
                <Text className="text-action-foreground text-[14px] font-bold">
                  Set up public profile
                </Text>
              </Pressable>
            </View>
          )}

          <View className="mt-4">
            <ProfileDetails rows={rows} />
          </View>

          <View className="mt-6">
            <Text className={LABEL}>About</Text>
            {bio ? (
              <Text className="text-foreground text-[14px] leading-5 mt-2">{bio}</Text>
            ) : (
              <View className="mt-2">
                <Text className="text-muted-foreground text-[14px] leading-5">
                  Add a short bio so people know what you do.
                </Text>
                <Pressable
                  onPress={() => router.push('/settings/profile')}
                  accessibilityRole="button"
                  hitSlop={8}
                  className="mt-1.5 self-start"
                >
                  <Text className="text-primary text-[14px] font-semibold">Add bio</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        <PortfolioBlock
          header="Portfolio"
          width={width}
          action={{ label: 'Manage', onPress: () => router.push('/settings/public-profile') }}
          items={page?.portfolio ?? []}
          emptyState={
            pageQuery.isLoading ? (
              <View className="py-8 items-center">
                <ActivityIndicator color={palette.primary} />
              </View>
            ) : pageQuery.loadFailed ? (
              <View className="rounded-2xl border border-dashed border-border">
                <LoadFailed compact what="your portfolio" onRetry={() => pageQuery.refetch()} />
              </View>
            ) : (
              <View className="rounded-2xl border border-dashed border-border py-8 px-5 items-center">
                <Text className="text-muted-foreground text-[13px] text-center leading-5">
                  Add your best work — it's what people look at before they get in touch.
                </Text>
                <Pressable
                  onPress={() => router.push('/settings/public-profile')}
                  accessibilityRole="button"
                  className="bg-action rounded-xl px-5 py-2.5 mt-4 active:opacity-90"
                >
                  <Text className="text-action-foreground text-[14px] font-bold">Add work</Text>
                </Pressable>
              </View>
            )
          }
          footer={
            hidden > 0 ? (
              <View className="mx-5 mt-3 flex-row items-start gap-2.5 rounded-xl bg-muted px-3.5 py-3">
                <InfoIcon size={15} className="text-muted-foreground" style={{ marginTop: 2 }} />
                <Text className="flex-1 text-muted-foreground text-[12px] leading-5">
                  {`${hidden} photo${hidden === 1 ? '' : 's'} can't be shown on your profile. Remove ${hidden === 1 ? 'it' : 'them'} in Manage, or add a JPEG copy instead.`}
                </Text>
                <Pressable
                  onPress={() => router.push('/settings/public-profile')}
                  accessibilityRole="button"
                  hitSlop={14}
                >
                  <Text className="text-primary text-[12px] font-semibold">Manage</Text>
                </Pressable>
              </View>
            ) : null
          }
        />
      </ScrollView>

      <ActionSheet
        visible={coverMenuOpen}
        title="Cover photo"
        onClose={() => setCoverMenuOpen(false)}
        actions={[
          { label: 'Choose a new photo', onPress: () => void cover.choose() },
          { label: 'Remove cover', destructive: true, onPress: cover.confirmRemove },
        ]}
      />
      {cover.dialog}
    </SafeAreaView>
  );
}
