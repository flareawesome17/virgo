import { useState } from 'react';
import { Pressable, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { ProfileAvatar, ProfileCover } from '@/components/ProfileParts';
import { useAvatarEditor, useCoverEditor } from '@/components/ProfilePhotoEditors';
import { ActionSheet } from '@/components/WorkspaceBits';
import { useAuth, useMyJobs, useProfilePage } from '@/src/hooks';
import { profileBanner, titleFromRoles } from '@/src/api';
import { goToTab } from '@/src/lib/navigation';

const AVATAR = 96;

/**
 * The top of the Dashboard: you, as your profile shows you.
 *
 * Your cover, your photo, your name and what you do, then three counts. The
 * cover and the photo change where they sit, as they did on "Your profile",
 * which this replaced. It scrolls away; the tabs under it stay.
 *
 * The counts were tiles at the foot of the old Dashboard. Up here they say
 * who you are on Virgo rather than how the account is doing. Connections and
 * jobs done come from your page, the same figures a visitor sees; until it
 * has loaded they show a dash, not a zero that would be untrue.
 */
export function ProfileHero({ onLayout }: { onLayout?: (event: LayoutChangeEvent) => void }) {
  const { width } = useWindowDimensions();
  const { user, profile } = useAuth();
  const { page } = useProfilePage();
  const { jobs: myJobs, isLoading: jobsLoading } = useMyJobs();
  const cover = useCoverEditor();
  const avatar = useAvatarEditor();
  const [coverMenuOpen, setCoverMenuOpen] = useState(false);

  const name = profile?.displayName?.trim() || user?.email.split('@')[0] || '';
  const title = profile ? profile.title?.trim() || titleFromRoles(profile.roles) : '';
  const coverUrl = profile?.coverUrl ?? null;
  const banner = profileBanner({ coverUrl, portfolio: page?.portfolio ?? [] });
  const stats = page?.stats ?? null;

  return (
    <View onLayout={onLayout}>
      <ProfileCover
        banner={banner}
        width={width}
        edit={{
          label: coverUrl ? 'Edit cover' : 'Add cover',
          busy: cover.busy,
          onPress: () => (coverUrl ? setCoverMenuOpen(true) : cover.choose()),
        }}
      />

      <View className="items-center px-5" style={{ marginTop: -AVATAR / 2 }}>
        <ProfileAvatar
          url={profile?.avatarUrl ?? null}
          name={name}
          size={AVATAR}
          onEdit={avatar.choose}
          busy={avatar.busy}
        />
        <Text
          accessibilityRole="header"
          className="text-foreground text-[22px] font-extrabold tracking-tight mt-3 text-center"
          numberOfLines={2}
        >
          {name}
        </Text>
        {title ? (
          <Text className="text-muted-foreground text-[14px] font-medium mt-0.5 text-center" numberOfLines={1}>
            {title}
          </Text>
        ) : null}
      </View>

      <View className="flex-row px-5 pt-4 pb-5">
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
        />
        {/* Nothing lists finished work yet, so this one only reports. */}
        <Count value={stats?.jobsDone} one="Job done" many="Jobs done" />
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

function Count({
  value,
  one,
  many,
  onPress,
}: {
  value: number | undefined;
  one: string;
  many: string;
  onPress?: () => void;
}) {
  const label = value === 1 ? one : many;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={value === undefined ? label : `${value} ${label.toLowerCase()}`}
      className="flex-1 items-center min-h-11 justify-center active:opacity-70"
    >
      <Text className="text-foreground text-[18px] font-bold tracking-tight">
        {value === undefined ? '—' : value > 999 ? '999+' : value}
      </Text>
      <Text className="text-muted-foreground text-[12px] font-medium mt-0.5">{label}</Text>
    </Pressable>
  );
}
