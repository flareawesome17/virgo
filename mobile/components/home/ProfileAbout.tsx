import { useEffect, useRef, useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
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
import { ProfileDetails, type ProfileDetailRow } from '@/components/ProfileParts';
import { useAuth, useProfileSettings } from '@/src/hooks';
import { profileUrl } from '@/src/api';
import { SITE, SITE_HOST } from '@/src/lib/profile-media';

// Every icon drawn here, including the ones handed to ProfileDetails: it draws
// them by class, which only works once registered.
for (const Icon of [
  AtSignIcon, Building2Icon, CalendarCheckIcon, CalendarIcon, CopyIcon,
  GlobeIcon, MapPinIcon, PencilIcon, Share2Icon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const LABEL = 'text-muted-foreground text-[11px] font-bold uppercase tracking-[2px]';

/**
 * The About tab of the Dashboard: what "Your profile" showed under the header.
 *
 * Edit and Share lead, since this is where you check how you come across.
 * Share only once the profile is published — an unpublished address answers
 * "not found" to everybody else, so the card under it offers publishing
 * instead. The details and the bio are the session's, so a save shows here
 * the moment it lands.
 */
export function ProfileAbout() {
  const { user, profile } = useAuth();
  const { settings } = useProfileSettings();
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  if (!profile || !user) return null;

  const handle = settings?.handle ?? null;
  const published = Boolean(settings?.published && handle);
  const name = profile.displayName?.trim() || user.email.split('@')[0];

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

  const bio = profile.bio?.trim() || null;

  return (
    <View className="px-5 pt-4">
      <View className="flex-row gap-2.5">
        <Pressable
          onPress={() => router.push('/settings/profile')}
          accessibilityRole="button"
          className="flex-1 min-h-12 rounded-2xl flex-row items-center justify-center gap-2 bg-muted active:opacity-80"
        >
          <PencilIcon size={16} className="text-foreground" />
          <Text className="text-foreground text-[15px] font-bold">Edit profile</Text>
        </Pressable>
        {published && handle && (
          <Pressable
            onPress={() => Share.share({ message: `${name} on Virgo — ${profileUrl(handle, SITE)}` })}
            accessibilityRole="button"
            className="flex-1 min-h-12 rounded-2xl flex-row items-center justify-center gap-2 bg-muted active:opacity-80"
          >
            <Share2Icon size={16} className="text-foreground" />
            <Text className="text-foreground text-[15px] font-bold">Share profile</Text>
          </Pressable>
        )}
      </View>

      {settings && !published && (
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
            <Text className="text-action-foreground text-[14px] font-bold">Set up public profile</Text>
          </Pressable>
        </View>
      )}

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

      <View className="mt-5">
        <ProfileDetails rows={rows} />
      </View>
    </View>
  );
}
