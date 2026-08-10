import {
  View, Text, ScrollView, Pressable, Image, Alert,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  useApplicants,
  useDeleteJob,
  useBookings,
  useMyApplications,
  useMyJobs,
  useRespondToApplication,
  usePendingApplicants,
  useSetJobStatus,
} from '@/src/hooks';
import { budgetLabel, type JobPost } from '@/src/api';
import { JobsFeed } from '@/components/JobsFeed';
import {
  BriefcaseIcon, CheckIcon, ChevronDownIcon,
  MessageCircleIcon, StarIcon, TrashIcon, XIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLACEHOLDER_IMAGE } from '@/src/lib/placeholder';
import { LoadFailed } from '@/components/LoadFailed';

for (const Icon of [
  BriefcaseIcon, CheckIcon, ChevronDownIcon,
  MessageCircleIcon, StarIcon, TrashIcon, XIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const STATUS_LABEL: Record<JobPost['status'], string> = {
  open: 'Open', filled: 'Filled', closed: 'Closed', expired: 'Expired',
};

export type JobsTab = 'browse' | 'posted' | 'applied';

/**
 * Browse, Posted and My applications — the same three the web screen has.
 *
 * Mobile had Browse as its own route and only two tabs here, so the phone was
 * missing a third of the screen the web has. One component now serves the Home
 * tab, the /jobs route and /jobs/mine, which is also what stops them drifting
 * apart again.
 *
 * No header and no SafeAreaView: the host owns those, because one host is a
 * tab panel inside another screen and the others are screens in their own
 * right.
 */
/** Matches web's APPLICATION_STATE so both clients say the same words. */
const APPLICATION_LABEL: Record<string, string> = {
  new: 'Applied',
  shortlisted: 'Shortlisted',
  accepted: 'Accepted',
  declined: 'Not selected',
};

export function JobsTabs({
  initialTab = 'browse',
  bottomPadding = 40,
}: {
  initialTab?: JobsTab;
  bottomPadding?: number;
}) {
  const [tab, setTab] = useState<JobsTab>(initialTab);
  const { jobs, isLoading, loadFailed, refetch } = useMyJobs();
  const [refreshing, setRefreshing] = useState(false);

  // Summed from posts already loaded, so this costs no extra request.
  //
  // Without it the trail breaks: the tab-bar badge counts applications, this
  // view opens on Browse, and Browse has nothing to show for them — you would
  // be told a number and given nowhere to go and find it.
  const waiting = jobs.reduce((n, job) => n + job.newApplicantCount, 0);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <View className="flex-1">
      <View className="flex-row gap-5 px-5 border-b border-border">
        {([
          ['browse', 'Browse', false],
          ['posted', `Posted (${jobs.length})`, waiting > 0],
          ['applied', 'Applications', false],
        ] as const).map(([key, label, dot]) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={{
              borderBottomWidth: 2,
              borderBottomColor: tab === key ? '#B66A40' : 'transparent',
              paddingVertical: 10,
            }}
          >
            <View className="flex-row items-center gap-1.5">
              <Text
                className="text-[12px] font-bold uppercase tracking-[1.5px]"
                style={{ color: tab === key ? '#B66A40' : '#9ca3af' }}
              >
                {label}
              </Text>
              {dot && (
                <View
                  className="rounded-full"
                  style={{ width: 6, height: 6, backgroundColor: '#B66A40' }}
                />
              )}
            </View>
          </Pressable>
        ))}
      </View>

      {tab === 'browse' ? (
        <JobsFeed bottomPadding={bottomPadding} />
      ) : tab === 'posted' ? (
        isLoading && jobs.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#B66A40" />
          </View>
        ) : loadFailed && jobs.length === 0 ? (
          <LoadFailed what="your posts" onRetry={() => refetch()} />
        ) : jobs.length === 0 ? (
          <Empty
            title="You have not posted a job yet"
            body="Say what you need doing, when, and roughly what you are paying. It goes on the board and the people who do that work can find it."
            cta="Post a job"
            onPress={() => router.push('/jobs/new')}
          />
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: bottomPadding, gap: 10 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#B66A40" />
            }
          >
            {jobs.map((job) => <JobRow key={job.id} job={job} />)}
          </ScrollView>
        )
      ) : (
        <MyApplications bottom={bottomPadding} onBrowse={() => setTab('browse')} />
      )}
    </View>
  );
}

/**
 * Where an accepted application actually leads.
 *
 * Without it "accepted" is a status and nothing else — no role, no date, no
 * rate either side can point at.
 */
function BookingLink({ applicationId }: { applicationId: string }) {
  const { bookings } = useBookings();
  const booking = bookings.find((b) => b.applicationId === applicationId);
  if (!booking) return null;

  return (
    <Pressable
      className="rounded-xl px-3 py-2.5"
      style={{ borderWidth: 1, borderColor: '#B66A40' }}
      onPress={() => router.push(`/bookings/${booking.id}`)}
    >
      <Text className="text-[12px] font-bold" style={{ color: '#B66A40' }}>
        Booking · {booking.cancelledAt
          ? 'cancelled'
          : booking.lockedAt
            ? 'agreed'
            : booking.youConfirmed
              ? 'waiting on them'
              : 'needs you'}
      </Text>
    </Pressable>
  );
}

function JobRow({ job }: { job: JobPost }) {
  const [open, setOpen] = useState(false);
  const setStatus = useSetJobStatus();
  const remove = useDeleteJob();
  const pending = usePendingApplicants();

  /**
   * Ending a post ends other people's applications.
   *
   * The confirmation names how many, fetched at the moment of asking — "are
   * you sure" does not tell somebody they are about to decline four people.
   */
  const end = async (status: 'filled' | 'closed') => {
    let waiting = 0;
    try {
      waiting = (await pending.mutateAsync(job.id)).count;
    } catch {
      // Ask anyway, just without the number.
    }
    Alert.alert(
      status === 'filled' ? 'Mark this filled?' : 'Close this post?',
      waiting
        ? `${waiting} ${waiting === 1 ? 'person is' : 'people are'} still waiting to hear back. They will be told the role is taken.`
        : 'It will stop taking applications.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: status === 'filled' ? 'Mark filled' : 'Close',
          onPress: () =>
            setStatus.mutate({ id: job.id, status }, {
              onError: (e: Error) => Alert.alert('Could not update', e.message),
            }),
        },
      ],
    );
  };
  const budget = budgetLabel(job.budgetMin, job.budgetMax);

  return (
    <View className="bg-card rounded-2xl p-4 gap-2.5">
      <View className="flex-row items-start gap-3">
        <View className="flex-1 min-w-0">
          <Text className="text-foreground text-[14px] font-bold leading-snug">
            {job.title}
          </Text>
          <Text className="text-muted-foreground text-[11px] mt-0.5">
            {[job.location, budget, `${job.applicantCount} applied`].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View className="rounded-full px-2.5 py-1"
          style={{ backgroundColor: job.status === 'open' ? '#B66A4020' : '#9ca3af20' }}>
          <Text className="text-[10px] font-bold"
            style={{ color: job.status === 'open' ? '#B66A40' : '#9ca3af' }}>
            {STATUS_LABEL[job.status]}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center gap-3">
        <Pressable
          className="flex-row items-center gap-1.5"
          disabled={job.applicantCount === 0}
          style={{ opacity: job.applicantCount === 0 ? 0.4 : 1 }}
          onPress={() => setOpen((v) => !v)}
        >
          <ChevronDownIcon size={14} style={{
            color: '#B66A40',
            transform: [{ rotate: open ? '180deg' : '0deg' }],
          }} />
          <Text className="text-[12px] font-semibold" style={{ color: '#B66A40' }}>
            {job.applicantCount === 0
              ? 'No applicants yet'
              : `${job.applicantCount} applicant${job.applicantCount === 1 ? '' : 's'}`}
          </Text>
          {/* The count alone cannot say whether any of them need you: nine
              applicants you have already answered look identical to nine you
              have not. */}
          {job.newApplicantCount > 0 && (
            <View
              className="rounded-full px-1.5 py-0.5"
              style={{ backgroundColor: '#B66A40' }}
            >
              <Text className="text-[10px] font-bold text-white">
                {job.newApplicantCount} new
              </Text>
            </View>
          )}
        </Pressable>

        {job.status === 'open' ? (
          <View className="ml-auto flex-row items-center gap-4">
            <Pressable disabled={setStatus.isPending} onPress={() => end('filled')}>
              <Text className="text-muted-foreground text-[12px] font-semibold">
                Mark filled
              </Text>
            </Pressable>
            <Pressable disabled={setStatus.isPending} onPress={() => end('closed')}>
              <Text className="text-muted-foreground text-[12px] font-semibold">
                Close
              </Text>
            </Pressable>
          </View>
        ) : job.status !== 'expired' ? (
          /* Reopening was never offered, so a misclicked "Mark filled" was
             irreversible from the UI even though the API allows it. */
          <Pressable
            className="ml-auto"
            disabled={setStatus.isPending}
            onPress={() =>
              setStatus.mutate({ id: job.id, status: 'open' }, {
                onError: (e: Error) => Alert.alert('Could not update', e.message),
              })
            }
          >
            <Text className="text-[12px] font-semibold" style={{ color: '#B66A40' }}>
              Reopen
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          hitSlop={8}
          className={job.status === 'open' ? '' : 'ml-auto'}
          onPress={() =>
            Alert.alert('Delete this post?', 'Applicants will lose it too.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete', style: 'destructive',
                onPress: () => remove.mutate(job.id, {
                  onError: (e: Error) => Alert.alert('Could not delete', e.message),
                }),
              },
            ])
          }
        >
          <TrashIcon size={15} style={{ color: '#ef4444' }} />
        </Pressable>
      </View>

      {open && <Applicants postId={job.id} />}
    </View>
  );
}

function Applicants({ postId }: { postId: string }) {
  const { applications, isLoading, loadFailed, refetch } = useApplicants(postId);
  const respond = useRespondToApplication();
  const [acting, setActing] = useState<string | null>(null);

  if (isLoading) {
    return <ActivityIndicator color="#B66A40" style={{ marginVertical: 12 }} />;
  }

  if (loadFailed) {
    return <LoadFailed what="the applicants" onRetry={() => refetch()} compact />;
  }

  const answer = (id: string, status: 'shortlisted' | 'accepted' | 'declined') => {
    setActing(id);
    respond.mutate({ id, status }, {
      onSuccess: (result) => {
        if (status === 'accepted' && result.conversationId) {
          router.push(`/chat/${result.conversationId}`);
        }
      },
      onError: (e: Error) => Alert.alert('Could not respond', e.message),
      onSettled: () => setActing(null),
    });
  };

  return (
    <View className="gap-2 border-t border-border pt-3">
      {applications.map((app) => (
        <View key={app.id} className="bg-background rounded-xl p-3 gap-2">
          <View className="flex-row items-start gap-2.5">
            <Image
              source={{ uri: app.personAvatarUrl ?? PLACEHOLDER_IMAGE }}
              style={{ width: 30, height: 30, borderRadius: 15 }}
            />
            <View className="flex-1 min-w-0">
              {app.personHandle ? (
                <Pressable onPress={() => router.push(`/u/${app.personHandle}`)}>
                  <Text className="text-[13px] font-semibold" style={{ color: '#B66A40' }}>
                    {app.personName}
                  </Text>
                </Pressable>
              ) : (
                <Text className="text-foreground text-[13px] font-semibold">
                  {app.personName}
                </Text>
              )}
              <Text className="text-muted-foreground text-[11px]">
                {app.personRoles.join(', ') || 'No roles listed'}
              </Text>
            </View>
            {app.status !== 'new' && (
              <Text className="text-[10px] font-bold uppercase"
                style={{ color: app.status === 'accepted' ? '#10b981' : '#9ca3af' }}>
                {app.status}
              </Text>
            )}
          </View>

          <Text className="text-muted-foreground text-[12px] leading-5">{app.message}</Text>

          {app.status !== 'accepted' && app.status !== 'declined' && (
            <View className="flex-row items-center gap-2">
              <Pressable
                className="rounded-lg px-3 py-2 flex-row items-center gap-1.5"
                style={{ backgroundColor: '#B66A40' }}
                disabled={respond.isPending}
                onPress={() => answer(app.id, 'accepted')}
              >
                {acting === app.id
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <CheckIcon size={13} style={{ color: '#fff' }} />}
                <Text className="text-white text-[12px] font-bold">Accept</Text>
              </Pressable>
              {app.status !== 'shortlisted' && (
                <Pressable
                  className="flex-row items-center gap-1.5"
                  disabled={respond.isPending}
                  onPress={() => answer(app.id, 'shortlisted')}
                >
                  <StarIcon size={13} className="text-muted-foreground" />
                  <Text className="text-muted-foreground text-[12px] font-semibold">Shortlist</Text>
                </Pressable>
              )}
              <Pressable
                className="flex-row items-center gap-1.5 ml-auto"
                disabled={respond.isPending}
                onPress={() => answer(app.id, 'declined')}
              >
                <XIcon size={13} className="text-muted-foreground" />
                <Text className="text-muted-foreground text-[12px]">Decline</Text>
              </Pressable>
            </View>
          )}

          {app.status === 'accepted' && <BookingLink applicationId={app.id} />}
          {app.status === 'accepted' && app.conversationId && (
            <Pressable
              className="flex-row items-center gap-1.5"
              onPress={() => router.push(`/chat/${app.conversationId}`)}
            >
              <MessageCircleIcon size={13} style={{ color: '#B66A40' }} />
              <Text className="text-[12px] font-semibold" style={{ color: '#B66A40' }}>
                Open chat
              </Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

function MyApplications({ bottom, onBrowse }: { bottom: number; onBrowse: () => void }) {
  const { applications, isLoading, loadFailed, refetch } = useMyApplications();
  // Every other tab pulls to refresh; this one did not, which reads as broken
  // on the screen most likely to be checked repeatedly for an answer.
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (isLoading && applications.length === 0) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color="#B66A40" />
      </View>
    );
  }

  if (loadFailed && applications.length === 0) {
    return <LoadFailed what="your applications" onRetry={() => refetch()} />;
  }

  if (applications.length === 0) {
    return (
      <Empty
        title="You have not applied to anything yet"
        body="The board is public — browse what people are hiring for and apply in a couple of lines."
        cta="Browse jobs"
        onPress={onBrowse}
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: bottom, gap: 10 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#B66A40"
        />
      }
    >
      {applications.map((app) => (
        <View key={app.id} className="bg-card rounded-2xl p-4 gap-2">
          <View className="flex-row items-start gap-3">
            <Pressable className="flex-1 min-w-0" onPress={() => router.push(`/jobs/${app.postSlug}`)}>
              <Text className="text-foreground text-[14px] font-bold leading-snug">
                {app.postTitle}
              </Text>
              <Text className="text-muted-foreground text-[11px] mt-0.5">
                Applied {new Date(app.createdAt).toLocaleDateString()}
              </Text>
            </Pressable>
            <Text className="text-[10px] font-bold uppercase"
              style={{ color: app.status === 'accepted' ? '#10b981' : '#9ca3af' }}>
              {APPLICATION_LABEL[app.status]}
            </Text>
          </View>

          <Text className="text-muted-foreground text-[12px] leading-5">{app.message}</Text>

          {app.status === 'accepted' && <BookingLink applicationId={app.id} />}
          {app.status === 'accepted' && app.conversationId && (
            <Pressable
              className="flex-row items-center gap-1.5"
              onPress={() => router.push(`/chat/${app.conversationId}`)}
            >
              <MessageCircleIcon size={13} style={{ color: '#B66A40' }} />
              <Text className="text-[12px] font-semibold" style={{ color: '#B66A40' }}>
                Open chat
              </Text>
            </Pressable>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

function Empty({
  title, body, cta, onPress,
}: {
  title: string; body: string; cta: string; onPress: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center px-10">
      <BriefcaseIcon size={30} className="text-muted-foreground" />
      <Text className="text-foreground text-[15px] font-bold mt-3 text-center">{title}</Text>
      <Text className="text-muted-foreground text-[13px] text-center mt-1.5 leading-5">
        {body}
      </Text>
      <Pressable
        className="mt-5 rounded-xl px-5 py-3"
        style={{ backgroundColor: '#B66A40' }}
        onPress={onPress}
      >
        <Text className="text-white text-[13px] font-bold">{cta}</Text>
      </Pressable>
    </View>
  );
}
