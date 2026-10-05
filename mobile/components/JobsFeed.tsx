import {
  View, Text, ScrollView, Pressable, RefreshControl,
  ActivityIndicator, TextInput,
} from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useJobs, useRoles, useTheme } from '@/src/hooks';
import { PALETTES } from '@/theme';
import Animated from 'react-native-reanimated';
import { useChromeScroll } from '@/src/providers/ChromeProvider';
import { budgetLabel, distanceLabel, isRoleFilled, type JobPost, type MyApplication } from '@/src/api';
import { jobDate, postedAgo } from '@/src/lib/jobs-format';
import {
  BriefcaseIcon, CalendarIcon, MapPinIcon, BanknoteIcon,
  UsersIcon, SearchIcon, XIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLACEHOLDER_IMAGE } from '@/src/lib/placeholder';
import { LoadFailed } from '@/components/LoadFailed';
import { FilterChip } from '@/components/FilterChip';
import { EmptyState } from '@/components/EmptyState';
import { PressableScale } from '@/components/PressableScale';
import { CardListSkeleton } from '@/components/Skeleton';
import { useTabObstruction } from '@/components/TabScreen';

for (const Icon of [
  BriefcaseIcon, CalendarIcon, MapPinIcon, BanknoteIcon, UsersIcon, SearchIcon, XIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * The open job board.
 *
 * Extracted so the Home screen's Jobs tab and the standalone /jobs route are
 * the same list rather than two that drift. Takes its own padding rather than
 * assuming a parent, since one host is a tab panel and the other a screen.
 */
export function JobsFeed({ bottomPadding = 40 }: { bottomPadding?: number }) {
  const obstruction = useTabObstruction();
  const onScroll = useChromeScroll();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { roles: allRoles } = useRoles();
  const [role, setRole] = useState<string | null>(null);
  const [place, setPlace] = useState('');
  const [debouncedPlace, setDebouncedPlace] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedPlace(place.trim()), 350);
    return () => clearTimeout(id);
  }, [place]);

  const {
    jobs,
    total,
    isLoading,
    loadFailed,
    isRefiltering,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useJobs({
    roles: role ? [role] : [],
    location: debouncedPlace || undefined,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const filtered = Boolean(place.trim() || role);
  const clearFilters = () => {
    setPlace('');
    setDebouncedPlace('');
    setRole(null);
  };
  const refresher = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
  );

  return (
    <View className="flex-1">
      <View className="px-5 pt-3 pb-2 gap-2.5">
        <View className="bg-card rounded-xl pl-3.5 min-h-[44px] flex-row items-center gap-2">
          <SearchIcon size={15} className="text-muted-foreground" />
          <TextInput
            value={place}
            onChangeText={setPlace}
            placeholder="Anywhere — try Cebu, Manila, Davao"
            placeholderTextColor={palette.mutedForeground}
            accessibilityLabel="Search by place"
            returnKeyType="search"
            className="text-foreground text-[15px] flex-1 py-2.5"
          />
          {/* Lives in the field, not over the list. With keepPreviousData the
              previous results stay on screen while the next ones load, so the
              only thing that should change is this. */}
          {isRefiltering && <ActivityIndicator size="small" color={palette.primary} />}
          {/* There was no way to empty the field but to backspace it out. */}
          {place.length > 0 ? (
            <Pressable
              onPress={() => {
                setPlace('');
                setDebouncedPlace('');
              }}
              accessibilityRole="button"
              accessibilityLabel="Clear the place"
              className="w-11 h-11 items-center justify-center active:opacity-60"
            >
              <XIcon size={16} className="text-muted-foreground" />
            </Pressable>
          ) : (
            <View className="w-2" />
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 8, paddingRight: 20 }}>
          <FilterChip label="All roles" on={!role} onPress={() => setRole(null)} />
          {allRoles.map((r) => (
            <FilterChip key={r} label={r} on={role === r}
              onPress={() => setRole(role === r ? null : r)} />
          ))}
        </ScrollView>
      </View>

      {isLoading && jobs.length === 0 ? (
        <CardListSkeleton />
      ) : loadFailed && jobs.length === 0 ? (
        <LoadFailed what="the job board" onRetry={() => refetch()} />
      ) : jobs.length === 0 ? (
        // Scrolls, so pulling down checks again — an empty board was the one
        // state you could not refresh.
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingBottom: obstruction }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={refresher}
        >
          <EmptyState
            icon={BriefcaseIcon}
            title={
              debouncedPlace
                ? `Nothing in “${debouncedPlace}”`
                : role
                  ? `Nothing open for a ${role.toLowerCase()}`
                  : 'No open jobs right now'
            }
            body={
              debouncedPlace || role
                ? 'Try a wider search, or post the job you need doing.'
                : 'Posts expire when the job does, so this list is always current. Check back, or post the job you need doing.'
            }
            action={
              filtered
                ? { label: 'Clear filters', onPress: clearFilters }
                : { label: 'Post a job', onPress: () => router.push('/jobs/new') }
            }
            secondary={
              filtered ? { label: 'Post a job instead', onPress: () => router.push('/jobs/new') } : undefined
            }
          />
        </ScrollView>
      ) : (
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          // A tap on a card while the search keyboard is up opens the card,
          // rather than only closing the keyboard.
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: bottomPadding, gap: 10 }}
          refreshControl={refresher}
        >
          <View className="flex-row items-center justify-between min-h-[28px]">
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px]">
              {total} open {total === 1 ? 'job' : 'jobs'}
            </Text>
            {filtered && (
              <Pressable
                onPress={clearFilters}
                accessibilityRole="button"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                className="active:opacity-60"
              >
                <Text className="text-primary text-[13px] font-semibold">Clear filters</Text>
              </Pressable>
            )}
          </View>
          {jobs.map((job) => <JobCard key={job.id} job={job} />)}
          {hasNextPage && (
            <Pressable
              onPress={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              accessibilityRole="button"
              className="min-h-11 rounded-xl bg-secondary items-center justify-center active:opacity-80"
            >
              {isFetchingNextPage ? (
                <ActivityIndicator color={palette.primary} />
              ) : (
                <Text className="text-secondary-foreground text-[13px] font-bold">
                  Show more ({jobs.length} of {total})
                </Text>
              )}
            </Pressable>
          )}
        </Animated.ScrollView>
      )}
    </View>
  );
}

/** Matches web's APPLICATION_STATE so both clients say the same words. */
const APPLICATION_LABEL: Record<string, string> = {
  new: 'Applied',
  shortlisted: 'Shortlisted',
  accepted: 'Accepted',
  declined: 'Not selected',
};

/** Where you stand on a post, the furthest along of your applications. */
const STANDING: MyApplication['status'][] = ['accepted', 'shortlisted', 'new', 'declined'];
function standing(job: JobPost): MyApplication['status'] | null {
  const mine = job.myApplications ?? [];
  return STANDING.find((st) => mine.some((a) => a.status === st)) ?? null;
}

function JobCard({ job }: { job: JobPost }) {
  const budget = budgetLabel(job.budgetMin, job.budgetMax);
  // The board never said which posts you had already applied to, so the
  // only way to find out was to open each one.
  const mine = standing(job);
  return (
    // It had no press feedback at all. It gives a little now.
    <PressableScale
      className="bg-card rounded-2xl p-4 gap-2.5"
      onPress={() => router.push(`/jobs/${job.slug}`)}
      accessibilityRole="button"
      accessibilityLabel={mine ? `${job.title}, ${APPLICATION_LABEL[mine]}` : job.title}
      scaleTo={0.98}
    >
      <View className="flex-row items-start gap-2.5">
        <RemoteImage
          source={{ uri: job.postedBy.avatarUrl ?? PLACEHOLDER_IMAGE }}
          style={{ width: 32, height: 32, borderRadius: 16 }}
        />
        <View className="flex-1 min-w-0">
          <Text className="text-foreground text-[15px] font-bold leading-snug">
            {job.title}
          </Text>
          <Text className="text-muted-foreground text-[12px] mt-0.5">
            {job.isMine ? 'Your post' : job.postedBy.displayName} · posted{' '}
            {postedAgo(job.createdAt)}
          </Text>
        </View>
        {mine && (
          <View className={`rounded-full px-2.5 py-1 ${mine === 'accepted' ? 'bg-success/15' : 'bg-muted'}`}>
            <Text
              className={`text-[11px] font-bold ${mine === 'accepted' ? 'text-success' : 'text-muted-foreground'}`}
            >
              {APPLICATION_LABEL[mine]}
            </Text>
          </View>
        )}
      </View>

      <Text className="text-muted-foreground text-[13px] leading-5" numberOfLines={3}>
        {job.description}
      </Text>

      {/* A filled role stays on the card, struck through, rather than
          disappearing: a post that wanted three people and has two left is a
          different thing from one that only ever wanted one, and the card
          should not make those look identical. */}
      <View className="flex-row flex-wrap gap-1.5">
        {job.rolesWanted.map((r) => {
          const filled = isRoleFilled(job, r);
          return (
            <View
              key={r}
              className={`rounded-full px-2.5 py-0.5 ${filled ? 'bg-muted' : 'bg-primary/10'}`}
            >
              <Text
                className={`text-[11px] font-bold ${filled ? 'text-muted-foreground line-through' : 'text-primary'}`}
                accessibilityLabel={filled ? `${r}, filled` : r}
              >
                {r}
              </Text>
            </View>
          );
        })}
      </View>

      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        {job.eventDate && (
          <View className="flex-row items-center gap-1">
            <CalendarIcon size={12} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-[12px]">{jobDate(job.eventDate)}</Text>
          </View>
        )}
        {job.location && (
          <View className="flex-row items-center gap-1">
            <MapPinIcon size={12} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-[12px]">{job.location}</Text>
          </View>
        )}
        {budget && (
          <View className="flex-row items-center gap-1">
            <BanknoteIcon size={12} className="text-primary" />
            <Text className="text-primary text-[12px] font-semibold">{budget}</Text>
          </View>
        )}
        {/* What makes a job feel takeable. Only when we actually know. */}
        {distanceLabel(job.distanceKm, job.location) && (
          <Text className="text-primary text-[12px] font-semibold">
            {distanceLabel(job.distanceKm, job.location)}
          </Text>
        )}
        {job.applicantCount > 0 && (
          <View className="flex-row items-center gap-1 ml-auto">
            <UsersIcon size={12} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-[12px]">{job.applicantCount} applied</Text>
          </View>
        )}
      </View>
    </PressableScale>
  );
}
