import {
  View, Text, ScrollView, Pressable, Image, RefreshControl,
  ActivityIndicator, TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useJobs, useRoles } from '@/src/hooks';
import { budgetLabel, type JobPost } from '@/src/api';
import { jobDate, postedAgo } from '@/src/lib/jobs-format';
import {
  ArrowLeftIcon, BriefcaseIcon, CalendarIcon, MapPinIcon,
  BanknoteIcon, PlusIcon, UsersIcon, SearchIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLACEHOLDER_IMAGE } from '@/src/lib/placeholder';

for (const Icon of [
  ArrowLeftIcon, BriefcaseIcon, CalendarIcon, MapPinIcon,
  BanknoteIcon, PlusIcon, UsersIcon, SearchIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * The job board on the phone.
 *
 * The same list the public site serves, read through the same endpoint. It
 * needs no session — but this lives inside the authenticated stack anyway,
 * because applying does, and bouncing somebody to sign in *after* they have
 * read a post and decided is worse than doing it before.
 */
export default function JobsBoardScreen() {
  const insets = useSafeAreaInsets();
  const { roles: allRoles } = useRoles();
  const [role, setRole] = useState<string | null>(null);
  const [place, setPlace] = useState('');
  const [debouncedPlace, setDebouncedPlace] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedPlace(place.trim()), 350);
    return () => clearTimeout(id);
  }, [place]);

  const { jobs, total, isLoading, refetch } = useJobs({
    roles: role ? [role] : [],
    location: debouncedPlace || undefined,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-3 px-5 py-3">
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeftIcon size={20} className="text-foreground" />
        </Pressable>
        <Text className="text-foreground text-lg font-bold flex-1">Jobs</Text>
        <Pressable
          className="rounded-xl px-3 py-2 flex-row items-center gap-1.5"
          style={{ backgroundColor: '#B66A40' }}
          onPress={() => router.push('/jobs/new')}
        >
          <PlusIcon size={14} style={{ color: '#fff' }} />
          <Text className="text-white text-[12px] font-bold">Post</Text>
        </Pressable>
      </View>

      <View className="px-5 pb-2 gap-2.5">
        <View className="bg-card rounded-xl px-3.5 py-2.5 flex-row items-center gap-2">
          <SearchIcon size={15} className="text-muted-foreground" />
          <TextInput
            value={place}
            onChangeText={setPlace}
            placeholder="Anywhere — try Cebu, Manila, Davao"
            placeholderTextColor="#9ca3af"
            className="text-foreground text-sm flex-1"
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingRight: 20 }}>
          <Chip label="All roles" active={!role} onPress={() => setRole(null)} />
          {allRoles.map((r) => (
            <Chip key={r} label={r} active={role === r} onPress={() => setRole(role === r ? null : r)} />
          ))}
        </ScrollView>
      </View>

      {isLoading && jobs.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#B66A40" />
        </View>
      ) : jobs.length === 0 ? (
        <View className="flex-1 items-center justify-center px-10">
          <BriefcaseIcon size={30} className="text-muted-foreground" />
          <Text className="text-foreground text-[15px] font-bold mt-3">
            {role ? `Nothing open for a ${role.toLowerCase()}` : 'No open jobs right now'}
          </Text>
          <Text className="text-muted-foreground text-[13px] text-center mt-1.5 leading-5">
            Posts expire when the job does, so this list is always current.
            Check back, or post the job you need doing.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: insets.bottom + 40, gap: 10 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#B66A40" />
          }
        >
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px]">
            {total} open {total === 1 ? 'job' : 'jobs'}
          </Text>
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
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
            {job.postedBy.displayName} · posted {postedAgo(job.createdAt)}
          </Text>
        </View>
      </View>

      <Text className="text-muted-foreground text-[13px] leading-5" numberOfLines={3}>
        {job.description}
      </Text>

      <View className="flex-row flex-wrap gap-1.5">
        {job.rolesWanted.map((r) => (
          <View key={r} className="rounded-full px-2.5 py-0.5"
            style={{ backgroundColor: '#B66A4018' }}>
            <Text className="text-[10px] font-bold" style={{ color: '#B66A40' }}>{r}</Text>
          </View>
        ))}
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
            <BanknoteIcon size={11} style={{ color: '#B66A40' }} />
            <Text className="text-[11px] font-semibold" style={{ color: '#B66A40' }}>{budget}</Text>
          </View>
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
