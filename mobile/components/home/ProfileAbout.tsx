import { useEffect, useRef, useState } from 'react';
import { Pressable, Share, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import {
  AtSignIcon,
  Building2Icon,
  CalendarCheckIcon,
  CalendarIcon,
  CopyIcon,
  GlobeIcon,
  MapPinIcon,
  PencilIcon,
  Share2Icon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  ProfileAvatar,
  ProfileCover,
  ProfileDetails,
  type ProfileDetailRow,
} from '@/components/ProfileParts';
import { useAvatarEditor, useCoverEditor } from '@/components/ProfilePhotoEditors';
import { ActionSheet } from '@/components/WorkspaceBits';
import { useAuth, useMyJobs, useProfilePage, useProfileSettings } from '@/src/hooks';
import { profileBanner, profileUrl, titleFromRoles } from '@/src/api';
import { goToTab } from '@/src/lib/navigation';
import { SITE, SITE_HOST } from '@/src/lib/profile-media';

// Every icon drawn here, including the ones handed to ProfileDetails: it draws
// them by class, which only works once registered.
for (const Icon of [
  AtSignIcon, Building2Icon, CalendarCheckIcon, CalendarIcon, CopyIcon,
  GlobeIcon, MapPinIcon, PencilIcon, Share2Icon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const TITLE = 'text-foreground text-[17px] leading-6 font-bold tracking-tight';
const AVATAR = 72;

/**
 * The About tab of the Dashboard: you, as your profile shows you.
 *
 * It opens with your profile as a card — cover, photo, name, what you do and
 * three counts — which was the top of the whole Dashboard until the day took
 * that place. The cover and the photo change where they sit. Then Edit and
 * Share, since this is where you check how you come across; then your bio and
 * the details.
 *
 * Share only once the profile is published — an unpublished address answers
 * "not found" to everybody else, so the card under it offers publishing
 * instead. The details and the bio are the session's, so a save shows here
 * the moment it lands.
 */
export function ProfileAbout() {
  const { width } = useWindowDimensions();
  const { user, profile } = useAuth();
  const { settings } = useProfileSettings();
  const { page } = useProfilePage();
  const { jobs: myJobs, isLoading: jobsLoading } = useMyJobs();
  const cover = useCoverEditor();
  const avatar = useAvatarEditor();
  const [coverMenuOpen, setCoverMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  if (!profile || !user) return null;

  const handle = settings?.handle ?? null;
  const published = Boolean(settings?.published && handle);
  const name = profile.displayName?.trim() || user.email.split('@')[0];
  const title = profile.title?.trim() || titleFromRoles(profile.roles);
  const coverUrl = profile.coverUrl ?? null;
  const banner = profileBanner({ coverUrl, portfolio: page?.portfolio ?? [] });
  const stats = page?.stats ?? null;
  // Inside the 20pt margins and the card's hairline.
  const cardWidth = width - 40 - 2;

  const copyLink = async () => {
    if (!handle) return;
    await Clipboard.setStringAsync(profileUrl(handle, SITE));
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  const website = profile.website?.trim() || null;
  const studio = profile.studioName?.trim() || null;

  // Whether you are taking work leads: it is the line a visitor acts on.
  const rows: ProfileDetailRow[] = [];
  if (profile.availableForBookings) {
    rows.push({ icon: CalendarCheckIcon, text: 'Available for bookings', tone: 'success' });
  }
  if (profile.location?.trim()) rows.push({ icon: MapPinIcon, text: profile.location.trim() });
  if (studio) {
    rows.push({
      icon: Building2Icon,
      text: studio,
      // The studio is private until they choose to show it, and this is
      // supposed to be what visitors see — so say it is not there for them.
      sub: profile.showStudio ? undefined : 'Hidden from your profile',
    });
  }
  if (handle) {
    rows.push({
      icon: AtSignIcon,
      text: `${SITE_HOST}/@${handle}`,
      sub: published ? undefined : 'Not published yet',
      trailing: published ? (
        <Pressable
          onPress={copyLink}
          accessibilityRole="button"
          accessibilityLabel={copied ? 'Link copied' : 'Copy link to your profile'}
          hitSlop={8}
          className="flex-row items-center gap-1.5 min-h-11 pl-2 active:opacity-60"
        >
          <CopyIcon size={14} className="text-primary" />
          <Text className="text-primary text-[14px] font-semibold">
            {copied ? 'Copied' : 'Copy'}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => router.push('/settings/public-profile')}
          accessibilityRole="button"
          accessibilityLabel="Publish your profile"
          hitSlop={8}
          className="min-h-11 justify-center pl-2 active:opacity-60"
        >
          <Text className="text-primary text-[14px] font-semibold">Publish</Text>
        </Pressable>
      ),
    });
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

  const bio = profile.bio?.trim() || null;

  return (
    <View className="px-5 pt-5 gap-7">
      <View className="gap-3">
        {/* ── Your profile, as a card ── */}
        <View className="bg-card rounded-[20px] border border-border/40 overflow-hidden">
          <ProfileCover
            banner={banner}
            width={cardWidth}
            edit={{
              label: coverUrl ? 'Edit cover' : 'Add cover',
              busy: cover.busy,
              onPress: () => (coverUrl ? setCoverMenuOpen(true) : cover.choose()),
            }}
          />
          <View className="px-4 pb-4" style={{ marginTop: -AVATAR / 2 }}>
            <ProfileAvatar
              url={profile.avatarUrl ?? null}
              name={name}
              size={AVATAR}
              onEdit={avatar.choose}
              busy={avatar.busy}
            />
            <Text
              accessibilityRole="header"
              className="text-foreground text-[20px] leading-[26px] font-bold tracking-tight mt-2.5"
              numberOfLines={2}
            >
              {name}
            </Text>
            {title ? (
              <Text className="text-muted-foreground text-[14px] leading-5" numberOfLines={1}>
                {title}
              </Text>
            ) : null}
          </View>
          <View className="flex-row border-t border-border/30">
            <Count
              value={stats?.connections}
              one="Connection"
              many="Connections"
              onPress={() => goToTab('/(app)/(tabs)/connect?view=people')}
            />
            <Count
              value={jobsLoading ? undefined : myJobs.length}
              one="Job posted"
              many="Jobs posted"
              onPress={() => goToTab('/(app)/(tabs)/jobs?tab=posted')}
              divided
            />
            {/* Nothing lists finished work yet, so this one only reports. */}
            <Count value={stats?.jobsDone} one="Job done" many="Jobs done" divided />
          </View>
        </View>

        <View className="flex-row gap-3">
          <Pressable
            onPress={() => router.push('/settings/profile')}
            accessibilityRole="button"
            className="flex-1 min-h-12 rounded-[14px] flex-row items-center justify-center gap-2 bg-foreground active:opacity-80"
          >
            <PencilIcon size={16} className="text-background" />
            <Text className="text-background text-[15px] font-semibold">Edit profile</Text>
          </Pressable>
          {published && handle && (
            <Pressable
              onPress={() => Share.share({ message: `${name} on Virgo — ${profileUrl(handle, SITE)}` })}
              accessibilityRole="button"
              className="flex-1 min-h-12 rounded-[14px] flex-row items-center justify-center gap-2 bg-card border border-border active:opacity-80"
            >
              <Share2Icon size={16} className="text-foreground" />
              <Text className="text-foreground text-[15px] font-semibold">Share profile</Text>
            </Pressable>
          )}
        </View>

        {settings && !published && (
          <View className="bg-card rounded-[20px] border border-border/40 p-4">
            <View className="flex-row items-center gap-2">
              <GlobeIcon size={18} className="text-primary" />
              <Text className="text-foreground text-[15px] font-semibold">Publish your profile</Text>
            </View>
            <Text className="text-muted-foreground text-[14px] leading-5 mt-2">
              {settings.handle
                ? `Only you can see this page. Publish it so people looking to hire can find you at ${SITE_HOST}/@${settings.handle}.`
                : 'Only you can see this page. Choose a handle and publish it so people looking to hire can find you.'}
            </Text>
            {settings.blockers.length > 0 && (
              <View className="mt-2">
                <Text className="text-foreground text-[13px] font-semibold">Still to do</Text>
                {settings.blockers.map((blocker) => (
                  <Text key={blocker} className="text-muted-foreground text-[13px] leading-5 mt-0.5">
                    · {blocker}
                  </Text>
                ))}
              </View>
            )}
            <Pressable
              onPress={() => router.push('/settings/public-profile')}
              accessibilityRole="button"
              className="bg-action rounded-[14px] min-h-11 mt-3 items-center justify-center active:opacity-90"
            >
              <Text className="text-action-foreground text-[15px] font-semibold">Set up public profile</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View>
        <Text accessibilityRole="header" className={TITLE}>
          Bio
        </Text>
        {bio ? (
          <Text className="text-foreground text-[15px] leading-[22px] mt-2">{bio}</Text>
        ) : (
          <View className="mt-2">
            <Text className="text-muted-foreground text-[15px] leading-[22px]">
              Add a short bio so people know what you do.
            </Text>
            <Pressable
              onPress={() => router.push('/settings/profile')}
              accessibilityRole="button"
              hitSlop={10}
              className="mt-1.5 self-start active:opacity-60"
            >
              <Text className="text-primary text-[15px] font-semibold">Add bio</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View>
        <Text accessibilityRole="header" className={`${TITLE} mb-2.5`}>
          Details
        </Text>
        <ProfileDetails rows={rows} />
      </View>

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
    </View>
  );
}

/**
 * One of the three counts along the foot of the profile card.
 *
 * Connections and jobs done come from your page, the same figures a visitor
 * sees; until it has loaded they show a dash, not a zero that would be
 * untrue.
 */
function Count({
  value,
  one,
  many,
  onPress,
  divided = false,
}: {
  value: number | undefined;
  one: string;
  many: string;
  onPress?: () => void;
  divided?: boolean;
}) {
  const label = value === 1 ? one : many;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={value === undefined ? label : `${value} ${label.toLowerCase()}`}
      className={`flex-1 min-h-[60px] items-center justify-center active:bg-muted/40 ${
        divided ? 'border-l border-border/30' : ''
      }`}
    >
      <Text
        className="text-foreground text-[17px] leading-[22px] font-bold"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {value === undefined ? '—' : value > 999 ? '999+' : value}
      </Text>
      <Text className="text-muted-foreground text-[12px] leading-4">{label}</Text>
    </Pressable>
  );
}
