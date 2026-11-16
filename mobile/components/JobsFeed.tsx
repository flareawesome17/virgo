import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import Animated from 'react-native-reanimated';
import { BriefcaseIcon, ChevronDownIcon, MapPinIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useAuth, useJobs, useRoles, useTheme } from '@/src/hooks';
import { PALETTES } from '@/theme';
import { useChromeScroll } from '@/src/providers/ChromeProvider';
import type { JobPost } from '@/src/api';
import { LoadFailed } from '@/components/LoadFailed';
import { FilterChip } from '@/components/FilterChip';
import { EmptyState } from '@/components/EmptyState';
import { PressableScale } from '@/components/PressableScale';
import { CardListSkeleton } from '@/components/Skeleton';
import { useTabObstruction } from '@/components/TabScreen';
import { BestJobCard, JobCard, isFreshJob, myStanding } from '@/components/jobs/JobCard';
import { JobsFilterSheet, type JobFilters } from '@/components/jobs/JobsFilterSheet';

for (const Icon of [BriefcaseIcon, ChevronDownIcon, MapPinIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** Below this many, the end of the board needs no saying. */
const JOBS_END_AFTER = 6;

const renderJob = ({ item }: { item: JobPost }) => <JobCard job={item} />;
const JobGap = () => <View className="h-3" />;

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((value) => b.includes(value));

/**
 * The post that fits you best of those loaded: one of your roles still open
 * on it, not yours, not applied for, and the nearest of those. Null when none
 * says how far it is, because "closest" is then a guess.
 */
function bestFor(jobs: JobPost[], myRoles: string[]): JobPost | null {
  let best: JobPost | null = null;
  for (const job of jobs) {
    if (job.isMine || myStanding(job) || job.distanceKm == null) continue;
    if (myRoles.length > 0) {
      const open = job.rolesWanted.filter((role) => !job.filledRoles?.includes(role));
      if (!open.some((role) => myRoles.includes(role))) continue;
    }
    if (!best || job.distanceKm < (best.distanceKm as number)) best = job;
  }
  return best;
}

/**
 * The open job board.
 *
 * Extracted so the Home screen's Jobs tab and the standalone /jobs route are
 * the same list rather than two that drift. Takes its own padding rather than
 * assuming a parent, since one host is a tab panel and the other a screen.
 *
 * One row of filters: where, as a chip that opens the sheet, then "For you"
 * and the roles. It was a text field and a second row of chips, which put two
 * bands of controls above the first job.
 */
export function JobsFeed({ bottomPadding = 40 }: { bottomPadding?: number }) {
  const obstruction = useTabObstruction();
  const onScroll = useChromeScroll();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { roles: allRoles } = useRoles();
  const { profile } = useAuth();
  // Only roles the board knows: a profile can carry one that has since gone.
  const myRoles = useMemo(
    () => (profile?.roles ?? []).filter((role) => allRoles.length === 0 || allRoles.includes(role)),
    [profile?.roles, allRoles],
  );
  // "Cebu City, Cebu" is an address; the board is searched by town.
  const myTown = profile?.location?.split(',')[0]?.trim() || null;

  const [filters, setFilters] = useState<JobFilters>({ place: '', roles: [] });
  const [sheet, setSheet] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { place, roles } = filters;

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
  } = useJobs({ roles, location: place || undefined });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const filtered = place.length > 0 || roles.length > 0;
  const clearFilters = () => setFilters({ place: '', roles: [] });
  const forYou = myRoles.length > 0 && sameSet(roles, myRoles);
  const toggleRole = (role: string) =>
    setFilters((current) => ({
      ...current,
      roles: current.roles.includes(role) ? current.roles.filter((r) => r !== role) : [...current.roles, role],
    }));

  const best = useMemo(() => bestFor(jobs, myRoles), [jobs, myRoles]);
  const rest = useMemo(() => (best ? jobs.filter((job) => job.id !== best.id) : jobs), [jobs, best]);
  const fresh = useMemo(() => jobs.filter((job) => isFreshJob(job)).length, [jobs]);

  const refresher = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />;

  const heading =
    roles.length === 1
      ? `${total} ${total === 1 ? 'job' : 'jobs'} for ${/^[aeiou]/i.test(roles[0]) ? 'an' : 'a'} ${roles[0].toLowerCase()}`
      : forYou
        ? `${total} ${total === 1 ? 'job' : 'jobs'} for you`
        : `${total} open ${total === 1 ? 'job' : 'jobs'}`;

  return (
    <View className="flex-1">
      <View className="pt-4 pb-3">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}
        >
          {/* Where: a chip like the rest, dark once a place is set. */}
          <PressableScale
            onPress={() => setSheet(true)}
            scaleTo={0.95}
            hitSlop={{ top: 4, bottom: 4 }}
            accessibilityRole="button"
            accessibilityLabel={place ? `Jobs in ${place}. Change where and which roles` : 'Jobs anywhere. Choose where and which roles'}
            className={`h-9 rounded-full pl-3 pr-2.5 flex-row items-center gap-1.5 ${
              place ? 'bg-foreground' : 'bg-card border border-border'
            }`}
          >
            <MapPinIcon size={15} className={place ? 'text-background' : 'text-secondary-foreground'} />
            <Text
              className={`text-[14px] ${place ? 'text-background font-semibold' : 'text-secondary-foreground font-medium'}`}
              numberOfLines={1}
              style={{ maxWidth: 140 }}
            >
              {place || 'Anywhere'}
            </Text>
            {isRefiltering ? (
              <ActivityIndicator size="small" color={place ? palette.background : palette.primary} />
            ) : (
              <ChevronDownIcon size={14} className={place ? 'text-background' : 'text-muted-foreground'} />
            )}
          </PressableScale>
          {myRoles.length > 0 ? (
            <FilterChip
              label="For you"
              on={forYou}
              accessibilityLabel={`For you: ${myRoles.join(', ')}`}
              onPress={() => setFilters((current) => ({ ...current, roles: forYou ? [] : myRoles }))}
            />
          ) : null}
          {allRoles.map((role) => (
            // Under "For you" the roles are its own, so they are not also lit.
            <FilterChip key={role} label={role} on={!forYou && roles.includes(role)} onPress={() =>
              forYou ? setFilters((current) => ({ ...current, roles: [role] })) : toggleRole(role)
            } />
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
          refreshControl={refresher}
        >
          <EmptyState
            icon={BriefcaseIcon}
            title={
              place && roles.length === 1
                ? `Nothing in ${place} for ${/^[aeiou]/i.test(roles[0]) ? 'an' : 'a'} ${roles[0].toLowerCase()}`
                : place
                  ? `Nothing in ${place}`
                  : roles.length === 1
                    ? `Nothing open for ${/^[aeiou]/i.test(roles[0]) ? 'an' : 'a'} ${roles[0].toLowerCase()}`
                    : roles.length > 1
                      ? 'Nothing open for those roles'
                      : 'No open jobs right now'
            }
            body={
              place
                ? 'There may be jobs in other places. Posts leave the board when the job is done, so what you see is always current.'
                : roles.length > 0
                  ? 'Try other roles, or post the job you need doing.'
                  : 'Posts expire when the job does, so this list is always current. Check back, or post the job you need doing.'
            }
            action={
              place
                ? { label: 'Show jobs anywhere', onPress: () => setFilters((current) => ({ ...current, place: '' })) }
                : filtered
                  ? { label: 'Clear filters', onPress: clearFilters }
                  : { label: 'Post a job', onPress: () => router.push('/jobs/new') }
            }
            secondary={filtered ? { label: 'Post a job instead', onPress: () => router.push('/jobs/new') } : undefined}
          />
        </ScrollView>
      ) : (
        // A list that draws the jobs near the screen and lets go of the rest,
        // and fetches the next page as its end comes up. It was a ScrollView
        // with every loaded job in it, and a "Show more" button: each tap kept
        // another page of cards mounted for good, and the further somebody
        // read, the slower every touch got.
        <Animated.FlatList
          data={rest}
          keyExtractor={(job) => job.id}
          renderItem={renderJob}
          onScroll={onScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: bottomPadding }}
          ItemSeparatorComponent={JobGap}
          refreshControl={refresher}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={7}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          onEndReachedThreshold={0.6}
          ListHeaderComponent={
            <View className="gap-3 pb-3">
              {best ? (
                <View className="mb-2">
                  <BestJobCard
                    job={best}
                    reason={myRoles.length > 0 ? 'Closest to you, and one of your roles' : 'Closest to you'}
                  />
                </View>
              ) : null}
              <View className="flex-row items-baseline justify-between gap-3 min-h-[28px]">
                <Text className="flex-1 text-foreground text-[17px] leading-6 font-bold" accessibilityRole="header" numberOfLines={1}>
                  {heading}
                </Text>
                {filtered ? (
                  <Pressable onPress={clearFilters} accessibilityRole="button" hitSlop={10} className="active:opacity-60">
                    <Text className="text-primary text-[15px] font-semibold">Clear</Text>
                  </Pressable>
                ) : fresh > 0 ? (
                  <Text className="text-muted-foreground text-[13px] leading-[18px]">{fresh} new since yesterday</Text>
                ) : null}
              </View>
            </View>
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <View className="py-5 items-center gap-2" accessibilityLiveRegion="polite">
                <ActivityIndicator color={palette.primary} />
                <Text className="text-muted-foreground text-[13px] leading-[18px]">
                  Loading more jobs ({jobs.length} of {total})
                </Text>
              </View>
            ) : !hasNextPage && jobs.length > JOBS_END_AFTER ? (
              // Said only once there was enough to scroll through: under a few
              // cards it is plain to see that the list has ended.
              <Text className="text-muted-foreground text-[13px] leading-[18px] text-center py-6">
                That is every open job{filtered ? ' that matches' : ''}.
              </Text>
            ) : null
          }
        />
      )}

      <JobsFilterSheet
        visible={sheet}
        filters={filters}
        allRoles={allRoles}
        myRoles={myRoles}
        myTown={myTown}
        onApply={setFilters}
        onClose={() => setSheet(false)}
      />
    </View>
  );
}
