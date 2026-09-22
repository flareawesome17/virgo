import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
  Share, useWindowDimensions,
} from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { profilesApi, profileUrl, queryKeys } from '@/src/api';
import { useProfileSettings } from '@/src/hooks';
import {
  ArrowLeftIcon, BriefcaseIcon, EllipsisIcon, GlobeIcon, LayersIcon,
  MapPinIcon, PencilIcon, Share2Icon, UserSearchIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLACEHOLDER_IMAGE } from '@/src/lib/placeholder';
import { PersonSafetySheet } from '@/components/PersonSafetySheet';

for (const Icon of [
  ArrowLeftIcon, BriefcaseIcon, EllipsisIcon, GlobeIcon, LayersIcon,
  MapPinIcon, PencilIcon, Share2Icon, UserSearchIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const SITE = process.env.EXPO_PUBLIC_SITE_ORIGIN ?? 'https://virgo.ph';

/**
 * Somebody's profile, on the phone.
 *
 * The same content virgo.ph/@handle serves a stranger, rendered natively. A
 * signed-in person who taps a name should not be handed off to a browser —
 * that is the moment they are deciding whether to trust somebody with a
 * booking, and leaving the app is the worst thing to do to that decision.
 */
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { handle } = useLocalSearchParams<{ handle: string }>();

  const profile = useQuery({
    queryKey: queryKeys.publicProfiles.detail(handle as string),
    queryFn: () => profilesApi.publicProfile(handle as string),
    enabled: Boolean(handle),
    retry: false,
  });
  // Settings > View profile opens your own page here, where "Hire <you>"
  // leads to a screen that refuses it.
  const { settings: own } = useProfileSettings();
  const [safetyOpen, setSafetyOpen] = useState(false);

  if (profile.isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#B66A40" />
      </SafeAreaView>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-10">
        <UserSearchIcon size={30} className="text-muted-foreground" />
        <Text className="text-foreground text-[15px] font-bold mt-3">Profile not found</Text>
        <Text className="text-muted-foreground text-[13px] text-center mt-1.5 leading-5">
          This profile is private, or the handle has changed.
        </Text>
        <Pressable className="mt-5" onPress={() => router.back()}>
          <Text className="text-[13px] font-bold" style={{ color: '#B66A40' }}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const person = profile.data;
  const isSelf = !!own?.handle && own.handle.toLowerCase() === person.handle.toLowerCase();
  const images = person.portfolio.filter(
    (i): i is Extract<typeof i, { kind: 'image' }> => i.kind === 'image',
  );
  const albums = person.portfolio.filter(
    (i): i is Extract<typeof i, { kind: 'album' }> =>
      i.kind === 'album' && Boolean(i.url),
  );
  const cover = images[0]?.url ?? albums.find((a) => a.coverUrl)?.coverUrl ?? null;

  // Three across with 2px seams, the same grid the web profile uses. Computed
  // from the real width because a percentage leaves a sub-pixel gap that shows
  // as a hairline between tiles.
  const tile = Math.floor((width - 4) / 3);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-3 px-5 py-3">
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeftIcon size={20} className="text-foreground" />
        </Pressable>
        <Text className="text-foreground text-lg font-bold flex-1" numberOfLines={1}>
          @{person.handle}
        </Text>
        <Pressable
          hitSlop={10}
          onPress={() =>
            Share.share({
              message: `${person.displayName} on Virgo — ${profileUrl(person.handle, SITE)}`,
            })
          }
        >
          <Share2Icon size={18} className="text-muted-foreground" />
        </Pressable>
        {!isSelf && (
          <Pressable
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="More options"
            onPress={() => setSafetyOpen(true)}
          >
            <EllipsisIcon size={18} className="text-muted-foreground" />
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {/* Their own work as the banner. */}
        <View style={{ height: 130, backgroundColor: '#B66A4014' }}>
          {cover && (
            <RemoteImage source={{ uri: cover }} style={{ flex: 1, opacity: 0.5 }} blurRadius={3} />
          )}
        </View>

        <View className="px-5">
          <View className="flex-row items-end gap-3" style={{ marginTop: -44 }}>
            <RemoteImage
              source={{ uri: person.avatarUrl ?? PLACEHOLDER_IMAGE }}
              style={{
                width: 88, height: 88, borderRadius: 44,
                borderWidth: 4, borderColor: '#161311',
              }}
            />
            <View className="flex-1 min-w-0 pb-1">
              <Text className="text-foreground text-[22px] font-extrabold" numberOfLines={1}>
                {person.displayName}
              </Text>
            </View>
          </View>

          {person.title && (
            <Text className="text-foreground text-[15px] font-medium mt-3">
              {person.title}
            </Text>
          )}

          {person.roles.length > 0 && (
            <View className="flex-row flex-wrap gap-1.5 mt-2.5">
              {person.roles.map((role) => (
                <View key={role} className="rounded-full px-3 py-1"
                  style={{ backgroundColor: '#B66A4018' }}>
                  <Text className="text-[11px] font-bold" style={{ color: '#B66A40' }}>
                    {role}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {person.bio && (
            <Text className="text-muted-foreground text-[13px] leading-5 mt-3">
              {person.bio}
            </Text>
          )}

          <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1.5 mt-3">
            {person.location && (
              <View className="flex-row items-center gap-1.5">
                <MapPinIcon size={12} className="text-muted-foreground" />
                <Text className="text-muted-foreground text-[12px]">{person.location}</Text>
              </View>
            )}
            {person.website && (
              <Pressable
                className="flex-row items-center gap-1.5"
                onPress={() =>
                  Linking.openURL(
                    /^https?:\/\//i.test(person.website!)
                      ? person.website!
                      : `https://${person.website}`,
                  )
                }
              >
                <GlobeIcon size={12} color="#B66A40" />
                <Text className="text-[12px]" style={{ color: '#B66A40' }}>
                  {person.website.replace(/^https?:\/\//i, '')}
                </Text>
              </Pressable>
            )}
          </View>

          <View className="flex-row gap-8 border-y border-border py-3.5 mt-4">
            <Stat label="Work" value={images.length} />
            <Stat label="Galleries" value={albums.length} />
            <Stat label="On Virgo" value={person.memberSince} />
          </View>

          {isSelf ? (
            <Pressable
              className="rounded-2xl py-3.5 flex-row items-center justify-center gap-2 mt-4 bg-muted active:opacity-80"
              onPress={() => router.push('/settings/profile')}
              accessibilityRole="button"
            >
              <PencilIcon size={16} className="text-foreground" />
              <Text className="text-foreground text-[15px] font-bold">Edit profile</Text>
            </Pressable>
          ) : (
            <Pressable
              className="rounded-2xl py-3.5 flex-row items-center justify-center gap-2 mt-4"
              style={{ backgroundColor: '#B66A40' }}
              onPress={() => router.push(`/hire/${person.handle}`)}
            >
              <BriefcaseIcon size={16} color="#fff" />
              <Text className="text-white text-[15px] font-bold">
                Hire {person.displayName.split(' ')[0]}
              </Text>
            </Pressable>
          )}
        </View>

        {images.length > 0 && (
          <View className="mt-6">
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] px-5 mb-2">
              Work
            </Text>
            <View className="flex-row flex-wrap" style={{ gap: 2 }}>
              {images.map((item) => (
                <RemoteImage
                  key={item.id}
                  source={{ uri: item.url }}
                  style={{ width: tile, height: tile }}
                />
              ))}
            </View>
          </View>
        )}

        {albums.length > 0 && (
          <View className="mt-6 px-5 gap-2.5">
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px]">
              Galleries
            </Text>
            {albums.map((album) => (
              <Pressable
                key={album.id}
                className="rounded-2xl overflow-hidden bg-card"
                onPress={() => album.url && Linking.openURL(album.url)}
              >
                {album.coverUrl ? (
                  <RemoteImage source={{ uri: album.coverUrl }} style={{ width: '100%', height: 140 }} />
                ) : (
                  <View style={{ height: 140, backgroundColor: '#B66A4014' }}
                    className="items-center justify-center">
                    <LayersIcon size={26} color="#B66A40" />
                  </View>
                )}
                <View className="p-3.5">
                  <Text className="text-foreground text-[14px] font-bold">{album.name}</Text>
                  <Text className="text-muted-foreground text-[11px] mt-0.5">
                    {album.itemCount} {album.itemCount === 1 ? 'photo' : 'photos'}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {images.length === 0 && albums.length === 0 && (
          <View className="items-center px-10 py-12">
            <BriefcaseIcon size={26} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-[13px] text-center mt-3 leading-5">
              {person.displayName.split(' ')[0]} has not added any work yet. You
              can still send an enquiry.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* By handle: the profile never carries the account id. Blocking goes
          back, because across a block this profile no longer exists. */}
      {!isSelf && (
        <PersonSafetySheet
          visible={safetyOpen}
          onClose={() => setSafetyOpen(false)}
          name={person.displayName}
          target={{ handle: person.handle }}
          source="profile"
          onBlocked={() => router.back()}
        />
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <View>
      <Text className="text-muted-foreground text-[10px] uppercase tracking-[1.5px]">
        {label}
      </Text>
      <Text className="text-foreground text-[17px] font-bold mt-0.5">{value}</Text>
    </View>
  );
}
