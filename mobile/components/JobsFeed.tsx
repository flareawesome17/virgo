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
import { postedAgo } from '@/src/lib/jobs-format';
import {
  BriefcaseIcon, MapPinIcon, XIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLACEHOLDER_IMAGE } from '@/src/lib/placeholder';
import { LoadFailed } from '@/components/LoadFailed';
import { FilterChip } from '@/components/FilterChip';
import { EmptyState } from '@/components/EmptyState';
import { PressableScale } from '@/components/PressableScale';
import { CardListSkeleton } from '@/components/Skeleton';
import { DateTile } from '@/components/DateTile';
import { useTabObstruction } from '@/components/TabScreen';

for (const Icon of [BriefcaseIcon, MapPinIcon, XIcon]) {
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
      <View className="px-5 pt-4 pb-2 gap-3">
        {/* It narrows the board by place, so it wears a pin. It wore a
            magnifier, which promised a search of the jobs themselves. */}
        <View className="bg-muted rounded-[14px] pl-3.5 min-h-[44px] flex-row items-center gap-2.5">
          <MapPinIcon size={18} className="text-muted-foreground" />
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
          contentContainerStyle={{ padding: 20, paddingTop: 4, paddingBottom: bottomPadding, gap: 12 }}
          refreshControl={refresher}
        >
          <View className="flex-row items-center justify-between min-h-[28px]">
            <Text className="text-muted-foreground text-[13px] font-semibold">
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
              className="min-h-11 rounded-[14px] bg-secondary items-center justify-center active:opacity-80"
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

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * "NOV" and 26 from a job's date. Read off the string, not through Date: a
 * date-only value parses as UTC midnight, which is the day before anywhere
 * west of Greenwich.
 */
function jobDay(eventDate: string): { month: string; day: number } | null {
  const [, month, day] = eventDate.slice(0, 10).split('-').map(Number);
  if (!month || !day) return null;
  return { month: MONTHS[month - 1] ?? '', day };
}

/**
 * One job on the board, read in the order somebody decides by: when it is,
 * what it is, what it pays. Then the brief, who it wants, and where.
 *
 * The date leads as a tile, as dated rows do everywhere else. The pay was a
 * 12pt terracotta line among the small print at the foot; it is the second
 * thing anybody looks for, so it has a line of its own.
 */
function JobCard({ job }: { job: JobPost }) {
  const budget = budgetLabel(job.budgetMin, job.budgetMax);
  // The board never said which posts you had already applied to, so the
  // only way to find out was to open each one.
  const mine = standing(job);
  const when = job.eventDate ? jobDay(job.eventDate) : null;
  const distance = distanceLabel(job.distanceKm, job.location);
  const where = [job.location, distance].filter(Boolean).join(' · ');

  return (
    <PressableScale
      className="bg-card rounded-[20px] border border-border/40 p-4 gap-3"
      onPress={() => router.push(`/jobs/${job.slug}`)}
      accessibilityRole="button"
      accessibilityLabel={[job.title, budget, mine ? APPLICATION_LABEL[mine] : null].filter(Boolean).join(', ')}
      scaleTo={0.98}
    >
      <View className="flex-row items-start gap-3">
        {/* With no date set, the person who posted it stands in. */}
        {when ? (
          <DateTile small={when.month} large={when.day} />
        ) : (
          <RemoteImage
            source={{ uri: job.postedBy.avatarUrl ?? PLACEHOLDER_IMAGE }}
            style={{ width: 44, height: 44, borderRadius: 22 }}
          />
        )}
        <View className="flex-1 min-w-0">
          <Text className="text-foreground text-[16px] leading-[22px] font-semibold" numberOfLines={2}>
            {job.title}
          </Text>
          <Text className="text-muted-foreground text-[13px] leading-[18px] mt-0.5" numberOfLines={1}>
            {job.isMine ? 'Your post' : job.postedBy.displayName} · posted{' '}
            {postedAgo(job.createdAt)}
          </Text>
        </View>
      </View>

      {(budget || mine) && (
        <View className="flex-row items-center justify-between gap-3">
          <Text
            className="flex-1 text-foreground text-[17px] leading-6 font-bold tracking-tight"
            style={{ fontVariant: ['tabular-nums'] }}
            numberOfLines={1}
          >
            {budget ?? ''}
          </Text>
          {mine && (
            <View className={`rounded-full px-2.5 py-1 ${mine === 'accepted' ? 'bg-success/15' : 'bg-muted'}`}>
              <Text
                className={`text-[13px] leading-[18px] font-semibold ${
                  mine === 'accepted' ? 'text-success' : 'text-secondary-foreground'
                }`}
              >
                {APPLICATION_LABEL[mine]}
              </Text>
            </View>
          )}
        </View>
      )}

      <Text className="text-secondary-foreground text-[14px] leading-5" numberOfLines={2}>
        {job.description}
      </Text>

      {/* A filled role stays on the card, struck through, rather than
          disappearing: a post that wanted three people and has two left is a
          different thing from one that only ever wanted one, and the card
          should not make those look identical.

          Plain chips: terracotta is kept for what can be pressed. */}
      <View className="flex-row flex-wrap gap-2">
        {job.rolesWanted.map((r) => {
          const filled = isRoleFilled(job, r);
          return (
            <View key={r} className="rounded-full px-2.5 py-1 bg-muted">
              <Text
                className={`text-[13px] leading-[18px] font-medium ${
                  filled ? 'text-muted-foreground line-through' : 'text-secondary-foreground'
                }`}
                accessibilityLabel={filled ? `${r}, filled` : r}
              >
                {r}
              </Text>
            </View>
          );
        })}
      </View>

      {(where || job.applicantCount > 0) && (
        <View className="flex-row items-center gap-3 border-t border-border/30 pt-3">
          {where ? (
            <View className="flex-1 min-w-0 flex-row items-center gap-1.5">
              <MapPinIcon size={14} className="text-muted-foreground" />
              <Text className="flex-1 text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
                {where}
              </Text>
            </View>
          ) : (
            <View className="flex-1" />
          )}
          {job.applicantCount > 0 && (
            <Text className="text-muted-foreground text-[13px] leading-[18px]">
              {job.applicantCount} applied
            </Text>
          )}
        </View>
      )}
    </PressableScale>
  );
}
