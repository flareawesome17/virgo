import {
  View, Text, ScrollView, Pressable, Image, RefreshControl,
  ActivityIndicator, TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useAuth, useJobs, useRoles } from '@/src/hooks';
import { budgetLabel, distanceLabel, isRoleFilled, type JobPost } from '@/src/api';
import { jobDate, postedAgo } from '@/src/lib/jobs-format';
import {
  BriefcaseIcon, CalendarIcon, MapPinIcon, BanknoteIcon,
  UsersIcon, SearchIcon, PlusIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLACEHOLDER_IMAGE } from '@/src/lib/placeholder';
import { LoadFailed } from '@/components/LoadFailed';

for (const Icon of [
  BriefcaseIcon, CalendarIcon, MapPinIcon, BanknoteIcon, UsersIcon, SearchIcon, PlusIcon,
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
  const { roles: allRoles } = useRoles();
  const [role, setRole] = useState<string | null>(null);
  const [place, setPlace] = useState('');
  const [debouncedPlace, setDebouncedPlace] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedPlace(place.trim()), 350);
    return () => clearTimeout(id);
  }, [place]);

  const { jobs, total, isLoading, loadFailed, isRefiltering, refetch } = useJobs({
    roles: role ? [role] : [],
    location: debouncedPlace || undefined,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <View className="flex-1">
      <View className="px-5 pt-3 pb-2 gap-2.5">
        <View className="bg-card rounded-xl px-3.5 py-2.5 flex-row items-center gap-2">
          <SearchIcon size={15} className="text-muted-foreground" />
          <TextInput
            value={place}
            onChangeText={setPlace}
            placeholder="Anywhere — try Cebu, Manila, Davao"
            placeholderTextColor="#9ca3af"
            className="text-foreground text-sm flex-1"
          />
          {/* Lives in the field, not over the list. With keepPreviousData the
              previous results stay on screen while the next ones load, so the
              only thing that should change is this. */}
          {isRefiltering && <ActivityIndicator size="small" color="#B66A40" />}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingRight: 20 }}>
          <Chip label="All roles" active={!role} onPress={() => setRole(null)} />
          {allRoles.map((r) => (
            <Chip key={r} label={r} active={role === r}
              onPress={() => setRole(role === r ? null : r)} />
          ))}
        </ScrollView>
      </View>

      {isLoading && jobs.length === 0 ? (
        <View className="flex-1 items-center justify-center py-16">
          <ActivityIndicator color="#B66A40" />
        </View>
      ) : loadFailed && jobs.length === 0 ? (
        <LoadFailed what="the job board" onRetry={() => refetch()} />
      ) : jobs.length === 0 ? (
        <View className="flex-1 items-center justify-center px-10 py-16">
          <BriefcaseIcon size={30} className="text-muted-foreground" />
          <Text className="text-foreground text-[15px] font-bold mt-3 text-center">
            {debouncedPlace
              ? `Nothing in “${debouncedPlace}”`
              : role
                ? `Nothing open for a ${role.toLowerCase()}`
                : 'No open jobs right now'}
          </Text>
          <Text className="text-muted-foreground text-[13px] text-center mt-1.5 leading-5">
            {debouncedPlace || role
              ? 'Try a wider search, or post the job you need doing.'
              : 'Posts expire when the job does, so this list is always current. Check back, or post the job you need doing.'}
          </Text>
          <Pressable
            className="mt-5 rounded-xl px-5 py-3"
            style={{ backgroundColor: '#B66A40' }}
            onPress={() => router.push('/jobs/new')}
          >
            <Text className="text-white text-[13px] font-bold">Post a job</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: bottomPadding, gap: 10 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#B66A40" />
          }
        >
          <Composer />
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px]">
            {total} open {total === 1 ? 'job' : 'jobs'}
          </Text>
          {jobs.map((job) => <JobCard key={job.id} job={job} />)}
        </ScrollView>
      )}
    </View>
  );
}

/**
 * The composer row, at the top of the feed.
 *
 * Facebook's arrangement, and for its reason: a feed with no way to add to it
 * is a feed you only ever consume. Posting used to live in the header of the
 * standalone /jobs screen and in My jobs — neither of which is where the Home
 * tab lands you, so once the board had anything on it there was no way to post
 * at all without knowing another route.
 *
 * It looks like an input and is not one. Tapping opens the real composer,
 * because a job post needs a role, a date and a budget, and pretending
 * otherwise would mean a half-filled post or a form that grows out of a
 * one-line box.
 */
function Composer() {
  const { profile } = useAuth();
  const firstName = profile?.displayName?.trim().split(' ')[0];

  return (
    <Pressable
      className="bg-card rounded-2xl p-3.5 flex-row items-center gap-3"
      onPress={() => router.push('/jobs/new')}
    >
      <Image
        source={{ uri: profile?.avatarUrl ?? PLACEHOLDER_IMAGE }}
        style={{ width: 36, height: 36, borderRadius: 18 }}
      />
      <View
        className="flex-1 rounded-full px-4 py-2.5"
        style={{ backgroundColor: '#B66A400F' }}
      >
        <Text className="text-muted-foreground text-[13px]">
          {firstName ? `${firstName}, who do you need?` : 'Who do you need?'}
        </Text>
      </View>
      <View
        className="rounded-full p-2"
        style={{ backgroundColor: '#B66A40' }}
      >
        <PlusIcon size={16} color="#fff" />
      </View>
    </Pressable>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-full px-3.5 py-2"
      style={{
        backgroundColor: active ? '#B66A40' : 'transparent',
        borderWidth: 1,
        borderColor: active ? '#B66A40' : '#B66A4040',
      }}
    >
      <Text className="text-[12px] font-semibold" style={{ color: active ? '#fff' : '#B66A40' }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Matches web's APPLICATION_STATE so both clients say the same words. */
const APPLICATION_LABEL: Record<string, string> = {
  new: 'Applied',
  shortlisted: 'Shortlisted',
  accepted: 'Accepted',
  declined: 'Not selected',
};

function JobCard({ job }: { job: JobPost }) {
  const budget = budgetLabel(job.budgetMin, job.budgetMax);
  return (
    <Pressable
      className="bg-card rounded-2xl p-4 gap-2.5"
      onPress={() => router.push(`/jobs/${job.slug}`)}
    >
      <View className="flex-row items-start gap-2.5">
        <Image
          source={{ uri: job.postedBy.avatarUrl ?? PLACEHOLDER_IMAGE }}
          style={{ width: 32, height: 32, borderRadius: 16 }}
        />
        <View className="flex-1 min-w-0">
          <Text className="text-foreground text-[15px] font-bold leading-snug">
            {job.title}
          </Text>
          <Text className="text-muted-foreground text-[11px] mt-0.5">
            {job.isMine ? 'Your post' : job.postedBy.displayName} · posted{' '}
            {postedAgo(job.createdAt)}
          </Text>
        </View>
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
              className="rounded-full px-2.5 py-0.5"
              style={{ backgroundColor: filled ? '#8881' : '#B66A4018' }}
            >
              <Text
                className="text-[10px] font-bold"
                style={{
                  color: filled ? '#9ca3af' : '#B66A40',
                  textDecorationLine: filled ? 'line-through' : 'none',
                }}
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
            <CalendarIcon size={11} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-[11px]">{jobDate(job.eventDate)}</Text>
          </View>
        )}
        {job.location && (
          <View className="flex-row items-center gap-1">
            <MapPinIcon size={11} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-[11px]">{job.location}</Text>
          </View>
        )}
        {budget && (
          <View className="flex-row items-center gap-1">
            <BanknoteIcon size={11} color="#B66A40" />
            <Text className="text-[11px] font-semibold" style={{ color: '#B66A40' }}>{budget}</Text>
          </View>
        )}
        {/* What makes a job feel takeable. Only when we actually know. */}
        {distanceLabel(job.distanceKm, job.location) && (
          <Text className="text-[11px] font-semibold" style={{ color: '#B66A40' }}>
            {distanceLabel(job.distanceKm, job.location)}
          </Text>
        )}
        {job.applicantCount > 0 && (
          <View className="flex-row items-center gap-1 ml-auto">
            <UsersIcon size={11} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-[11px]">{job.applicantCount} applied</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
