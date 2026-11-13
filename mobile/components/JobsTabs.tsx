import {
  View, Text, Pressable, Alert,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  useApplicants,
  useDeleteJob,
  useBookings,
  useMyApplications,
  useMyJobs,
  useRespondToApplication,
  usePendingApplicants,
  useSetJobStatus,
  useTheme,
  useWithdrawApplication,
} from '@/src/hooks';
import Animated from 'react-native-reanimated';
import { useChromeScroll } from '@/src/providers/ChromeProvider';
import {
  ApiError,
  budgetLabel,
  isRoleFilled,
  roleBudgetLabel,
  type JobApplication,
  type JobPost,
} from '@/src/api';
import { APPLICATION_LABEL } from '@/src/lib/jobs-format';
import { JobsFeed } from '@/components/JobsFeed';
import { PageTabs } from '@/components/PageTabs';
import { EmptyState } from '@/components/EmptyState';
import { CardListSkeleton } from '@/components/Skeleton';
import { useTabObstruction } from '@/components/TabScreen';
import { BookingsList } from '@/components/BookingsList';
import { PersonSafetySheet } from '@/components/PersonSafetySheet';
import { ActionSheet } from '@/components/WorkspaceBits';
import {
  BriefcaseIcon, CheckIcon, ChevronDownIcon, EllipsisIcon,
  MessageCircleIcon, StarIcon, XIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLACEHOLDER_IMAGE } from '@/src/lib/placeholder';
import { LoadFailed } from '@/components/LoadFailed';
import { PALETTES } from '@/theme';

for (const Icon of [
  BriefcaseIcon, CheckIcon, ChevronDownIcon, EllipsisIcon,
  MessageCircleIcon, StarIcon, XIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const STATUS_LABEL: Record<JobPost['status'], string> = {
  open: 'Open', filled: 'Filled', closed: 'Closed', expired: 'Ended',
};

/** How long a Decline waits, with Undo, before it is sent and they are told. */
const DECLINE_UNDO_MS = 5000;

export type JobsTab = 'browse' | 'posted' | 'applied' | 'bookings';

/**
 * What a failed jobs action says: the server's own sentence where it wrote one
 * for people ("This post has expired — create a new one."), and plain words
 * when there was no answer at all.
 */
function jobError(err: unknown): string {
  if (err instanceof ApiError && err.status === 0) {
    return 'Check your connection and try again.';
  }
  return (err instanceof Error && err.message) || 'Please try again.';
}

/**
 * Browse, Posted, Applied and Bookings.
 *
 * Which one shows belongs to whoever hosts this (the Jobs tab keeps it in the
 * address, so a notification can pick it). Each stays mounted once opened, so
 * moving between them keeps the board's filters, search and scroll — they
 * were thrown away on every switch.
 *
 * No header and no SafeAreaView: the host owns those.
 */
export function JobsTabs({
  tab,
  onTabChange,
  focusPostId,
  bottomPadding = 40,
}: {
  tab: JobsTab;
  onTabChange: (tab: JobsTab) => void;
  /** A post to open with its applicants showing — where a new application lands. */
  focusPostId?: string;
  bottomPadding?: number;
}) {
  const { jobs } = useMyJobs();
  const [visited, setVisited] = useState<Record<JobsTab, boolean>>({
    browse: tab === 'browse',
    posted: tab === 'posted',
    applied: tab === 'applied',
    bookings: tab === 'bookings',
  });
  useEffect(() => {
    setVisited((current) => (current[tab] ? current : { ...current, [tab]: true }));
  }, [tab]);

  // Summed from posts already loaded, so this costs no extra request. Only
  // open posts: an ended post has nobody left to answer.
  const waiting = jobs.reduce((n, job) => n + (job.status === 'open' ? job.newApplicantCount : 0), 0);

  const pane = (key: JobsTab, node: React.ReactNode) =>
    visited[key] ? (
      <View key={key} className="flex-1" style={tab === key ? undefined : { display: 'none' }}>
        {node}
      </View>
    ) : null;

  return (
    <View className="flex-1">
      {/* The screen's pages, as the Dashboard's are: words with a line under
          the one you are on. Posted carries how many applicants are waiting,
          which was a dot that said only that somebody was. */}
      <PageTabs<JobsTab>
        tabs={[
          { key: 'browse', label: 'Browse' },
          {
            key: 'posted',
            label: 'Posted',
            badge: waiting,
            accessibilityLabel: waiting > 0 ? 'Posted' : `Posted, ${jobs.length}`,
          },
          { key: 'applied', label: 'Applied', accessibilityLabel: 'Your applications' },
          // Beside the jobs, as on the web: a booking is where one ends up.
          { key: 'bookings', label: 'Bookings' },
        ]}
        value={tab}
        onChange={onTabChange}
      />

      {pane('browse', <JobsFeed bottomPadding={bottomPadding} />)}
      {pane('posted', <Posted bottom={bottomPadding} focusPostId={focusPostId} />)}
      {pane('applied', <MyApplications bottom={bottomPadding} onBrowse={() => onTabChange('browse')} />)}
      {pane('bookings', <BookingsList bottomPadding={bottomPadding} />)}
    </View>
  );
}

function Posted({ bottom, focusPostId }: { bottom: number; focusPostId?: string }) {
  const onScroll = useChromeScroll();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { jobs, isLoading, loadFailed, refetch } = useMyJobs();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (isLoading && jobs.length === 0) return <CardListSkeleton count={3} />;
  if (loadFailed && jobs.length === 0) return <LoadFailed what="your posts" onRetry={() => refetch()} />;
  if (jobs.length === 0) {
    return (
      <Empty
        title="You have not posted a job yet"
        body="Say what you need doing, when, and roughly what you are paying. It goes on the board and the people who do that work can find it."
        cta="Post a job"
        onPress={() => router.push('/jobs/new')}
      />
    );
  }

  return (
    <Animated.ScrollView
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={{ padding: 20, paddingBottom: bottom, gap: 10 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
      }
    >
      {jobs.map((job) => (
        <JobRow key={job.id} job={job} startOpen={job.id === focusPostId} />
      ))}
    </Animated.ScrollView>
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
      className="rounded-xl px-3.5 min-h-[44px] justify-center border border-primary active:opacity-80"
      onPress={() => router.push(`/bookings/${booking.id}`)}
      accessibilityRole="button"
    >
      <Text className="text-primary text-[13px] font-bold">
        Booking · {booking.cancelledAt
          ? 'cancelled'
          : booking.confirmed
            ? 'agreed'
            : booking.yourSide === 'poster'
              ? 'waiting on them'
              : 'needs you'}
      </Text>
    </Pressable>
  );
}

function JobRow({ job, startOpen }: { job: JobPost; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen && job.applicantCount > 0);
  const [menuOpen, setMenuOpen] = useState(false);
  /** Asking the server how many people an action would answer, before asking you. */
  const [checking, setChecking] = useState(false);
  const setStatus = useSetJobStatus();
  const remove = useDeleteJob();
  const pending = usePendingApplicants();
  // A push for a new application opens this post with its applicants shown.
  useEffect(() => {
    if (startOpen && job.applicantCount > 0) setOpen(true);
  }, [startOpen, job.applicantCount]);

  /**
   * Ending a post ends other people's applications.
   *
   * The confirmation names how many, fetched at the moment of asking — "are
   * you sure" does not tell somebody they are about to decline four people.
   * The tap used to wait on that count with nothing showing, and a second tap
   * stacked a second alert.
   */
  const end = async (status: 'filled' | 'closed') => {
    if (checking) return;
    setChecking(true);
    let waiting = 0;
    try {
      waiting = (await pending.mutateAsync(job.id)).count;
    } catch {
      // Ask anyway, just without the number.
    } finally {
      setChecking(false);
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
              onError: (e) => Alert.alert("Couldn't update it", jobError(e)),
            }),
        },
      ],
    );
  };

  /**
   * Deleting is worse than ending, and asked less.
   *
   * Filling declines the people waiting; deleting erases them — every
   * application at any status, and every booking made from one, by cascade.
   */
  const destroy = async () => {
    if (checking) return;
    setChecking(true);
    let cost = { applications: 0, bookings: 0 };
    try {
      cost = await pending.mutateAsync(job.id);
    } catch {
      // Ask anyway, just without the numbers.
    } finally {
      setChecking(false);
    }

    // A post somebody is booked on is not deleted (the server refuses: it
    // would erase the booking without telling them). Say so, and offer the
    // thing that keeps their booking.
    if (cost.bookings > 0) {
      Alert.alert(
        `Close “${job.title}” instead?`,
        cost.bookings === 1
          ? 'Somebody is booked on this post, and deleting it would delete their booking without telling them. Closing it takes it off the board and keeps the booking. To end the booking, cancel it from Bookings.'
          : `${cost.bookings} people are booked on this post, and deleting it would delete their bookings without telling them. Closing it takes it off the board and keeps the bookings. To end one, cancel it from Bookings.`,
        [
          { text: 'Keep it', style: 'cancel' },
          ...(job.status === 'open' ? [{ text: 'Close the post', onPress: () => void end('closed') }] : []),
        ],
      );
      return;
    }

    Alert.alert(
      `Delete “${job.title}”?`,
      cost.applications
        ? `This also deletes ${cost.applications} application${cost.applications === 1 ? '' : 's'}, for good. The people who applied lose their copy as well.`
        : 'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            remove.mutate(job.id, {
              onError: (e) => Alert.alert("Couldn't delete it", jobError(e)),
            }),
        },
      ],
    );
  };

  const reopen = () =>
    setStatus.mutate({ id: job.id, status: 'open' }, {
      onError: (e) => Alert.alert("Couldn't reopen it", jobError(e)),
    });

  /*
   * The post's actions in one menu. Count, "N new", Edit, Mark filled, Close
   * and the bin came to about 350 pt on a 303 pt card, and the last two were
   * pushed off its edge.
   */
  const actions: { label: string; destructive?: boolean; onPress: () => void }[] = [];
  if (job.status === 'open') {
    // Editing keeps the applications; deleting to fix a typo did not.
    actions.push({ label: 'Edit post', onPress: () => router.push(`/jobs/new?edit=${job.slug}`) });
    actions.push({ label: 'Mark filled', onPress: () => void end('filled') });
    actions.push({ label: 'Close post', onPress: () => void end('closed') });
  } else if (job.status !== 'expired') {
    // Reopening was never offered, so a misclicked "Mark filled" was
    // irreversible from the UI even though the API allows it.
    actions.push({ label: 'Reopen', onPress: reopen });
  }
  actions.push({ label: 'Delete post', destructive: true, onPress: () => void destroy() });

  const budget = budgetLabel(job.budgetMin, job.budgetMax);
  const live = job.status === 'open';

  return (
    <View className="bg-card rounded-2xl p-4 gap-2.5">
      <View className="flex-row items-start gap-3">
        {/* Your own post opens, like anybody else's: it was the one card on
            the board that did nothing when tapped. */}
        <Pressable
          onPress={() => router.push(`/jobs/${job.slug}`)}
          accessibilityRole="button"
          accessibilityLabel={`${job.title}. Open the post.`}
          className="flex-1 min-w-0 active:opacity-70"
        >
          <Text className="text-foreground text-[15px] font-bold leading-snug">{job.title}</Text>
          <Text className="text-muted-foreground text-[12px] mt-0.5">
            {[job.location, budget, `${job.applicantCount} applied`].filter(Boolean).join(' · ')}
          </Text>
        </Pressable>
        <View className={`rounded-full px-2.5 py-1 ${live ? 'bg-primary/10' : 'bg-muted'}`}>
          <Text className={`text-[11px] font-bold ${live ? 'text-primary' : 'text-muted-foreground'}`}>
            {STATUS_LABEL[job.status]}
          </Text>
        </View>
      </View>

      {/* Which roles are still going, on the poster's own row. */}
      {job.rolesWanted.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5">
          {job.rolesWanted.map((r) => {
            const filled = isRoleFilled(job, r);
            return (
              <View
                key={r}
                className={`rounded-full px-2.5 py-0.5 border ${filled ? 'border-border' : 'border-primary/40'}`}
              >
                <Text className={`text-[11px] font-bold ${filled ? 'text-muted-foreground' : 'text-primary'}`}>
                  {r} · {filled ? 'filled' : 'open'}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <View className="flex-row items-center gap-2">
        <Pressable
          className="min-h-[44px] flex-row items-center gap-1.5 pr-2 active:opacity-60"
          disabled={job.applicantCount === 0}
          accessibilityRole="button"
          accessibilityState={{ expanded: open, disabled: job.applicantCount === 0 }}
          accessibilityLabel={
            job.applicantCount === 0
              ? 'No applicants yet'
              : `${job.applicantCount} applicants${job.newApplicantCount > 0 ? `, ${job.newApplicantCount} new` : ''}. ${open ? 'Hide' : 'Show'} them.`
          }
          style={{ opacity: job.applicantCount === 0 ? 0.5 : 1 }}
          onPress={() => setOpen((v) => !v)}
        >
          <ChevronDownIcon
            size={16}
            className="text-primary"
            style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
          />
          <Text className="text-primary text-[13px] font-semibold">
            {job.applicantCount === 0
              ? 'No applicants yet'
              : `${job.applicantCount} applicant${job.applicantCount === 1 ? '' : 's'}`}
          </Text>
          {/* Only on a post still open: an ended one has nobody left to answer. */}
          {live && job.newApplicantCount > 0 && (
            <View className="rounded-full px-2 py-0.5 bg-action">
              <Text className="text-action-foreground text-[11px] font-bold">
                {job.newApplicantCount} new
              </Text>
            </View>
          )}
        </Pressable>

        <Pressable
          onPress={() => setMenuOpen(true)}
          disabled={checking}
          accessibilityRole="button"
          accessibilityLabel={`Actions for ${job.title}`}
          accessibilityState={{ busy: checking }}
          className="ml-auto w-11 h-11 items-center justify-center rounded-full active:opacity-60"
        >
          {checking ? (
            <ActivityIndicator size="small" color="#A85D35" />
          ) : (
            <EllipsisIcon size={18} className="text-muted-foreground" />
          )}
        </Pressable>
      </View>

      {open && <Applicants job={job} />}

      <ActionSheet
        visible={menuOpen}
        title={job.title}
        actions={actions}
        onClose={() => setMenuOpen(false)}
      />
    </View>
  );
}

function Applicants({ job }: { job: JobPost }) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { applications, isLoading, loadFailed, refetch } = useApplicants(job.id);
  const respond = useRespondToApplication();
  const [acting, setActing] = useState<string | null>(null);
  /** The applicant whose More menu is open. */
  const [safetyFor, setSafetyFor] = useState<JobApplication | null>(null);

  /*
   * Declines wait, with Undo. A decline tells somebody they were not chosen,
   * and it went on one tap with no way back. Leaving the list sends any
   * still waiting rather than dropping them.
   */
  const [declining, setDeclining] = useState<Record<string, true>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const send = (id: string, status: 'shortlisted' | 'accepted' | 'declined') => {
    setActing(id);
    respond.mutate({ id, status }, {
      onSuccess: (result) => {
        if (status === 'accepted' && result.conversationId) {
          router.push(`/chat/${result.conversationId}`);
        }
      },
      onError: (e) => Alert.alert("Couldn't answer them", jobError(e)),
      onSettled: () => {
        setActing(null);
        setDeclining((current) => {
          if (!current[id]) return current;
          const next = { ...current };
          delete next[id];
          return next;
        });
      },
    });
  };
  useEffect(() => {
    const pendingTimers = timers.current;
    return () => {
      // Sent now rather than lost.
      pendingTimers.forEach((timer, id) => {
        clearTimeout(timer);
        respond.mutate({ id, status: 'declined' });
      });
      pendingTimers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decline = (id: string) => {
    setDeclining((current) => ({ ...current, [id]: true }));
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        send(id, 'declined');
      }, DECLINE_UNDO_MS),
    );
  };
  const undo = (id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setDeclining((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  /*
   * Accepting asks first, and says what it is agreeing to: Accept made a
   * booking, a connection and a chat on one tap.
   */
  const accept = (app: JobApplication) => {
    const rate = app.role ? roleBudgetLabel(job.roleBudgets, app.role) : budgetLabel(job.budgetMin, job.budgetMax);
    const as = app.role ? ` as ${app.role}` : '';
    Alert.alert(
      `Hire ${app.personName}${as}?`,
      [
        rate ? `At ${rate}, which you can change on the booking.` : 'You set the rate on the booking.',
        `This books them for “${job.title}”, connects you, and opens a chat with them.`,
      ].join(' '),
      [
        { text: 'Not yet', style: 'cancel' },
        { text: 'Hire', onPress: () => send(app.id, 'accepted') },
      ],
    );
  };

  if (isLoading) {
    return <ActivityIndicator color={palette.primary} style={{ marginVertical: 12 }} />;
  }

  // An empty list read as "nobody applied" when the list had failed to load.
  if (loadFailed && applications.length === 0) {
    return <LoadFailed what="the applicants" onRetry={() => refetch()} compact />;
  }

  const live = job.status === 'open';

  return (
    <View className="gap-2 border-t border-border pt-3">
      {applications.map((app) => {
        const waitingOnYou = app.status !== 'accepted' && app.status !== 'declined';
        // Booking a role twice is refused now; offering it was the bug.
        const roleTaken = !!app.role && isRoleFilled(job, app.role);
        const beingDeclined = !!declining[app.id];
        return (
          <View key={app.id} className="bg-background rounded-xl p-3 gap-2">
            <View className="flex-row items-center gap-2.5">
              <Pressable
                onPress={app.personHandle ? () => router.push(`/u/${app.personHandle}`) : undefined}
                disabled={!app.personHandle}
                accessibilityRole={app.personHandle ? 'button' : undefined}
                accessibilityLabel={app.personHandle ? `${app.personName}'s profile` : app.personName}
                className="flex-1 min-w-0 min-h-[44px] flex-row items-center gap-2.5 active:opacity-70"
              >
                <RemoteImage
                  source={{ uri: app.personAvatarUrl ?? PLACEHOLDER_IMAGE }}
                  style={{ width: 36, height: 36, borderRadius: 18 }}
                />
                <View className="flex-1 min-w-0">
                  <Text
                    className={`text-[14px] font-semibold ${app.personHandle ? 'text-primary' : 'text-foreground'}`}
                    numberOfLines={1}
                  >
                    {app.personName}
                  </Text>
                  <Text className="text-muted-foreground text-[12px]" numberOfLines={1}>
                    {app.personRoles.join(', ') || 'No roles listed'}
                  </Text>
                </View>
              </Pressable>
              {/* What they applied for, which on a post wanting three roles is
                  the first thing you need. */}
              {app.role && (
                <View className="rounded-full px-2 py-0.5 border border-border">
                  <Text className="text-muted-foreground text-[11px] font-bold">{app.role}</Text>
                </View>
              )}
              {app.status !== 'new' && (
                <Text
                  className={`text-[11px] font-bold uppercase ${app.status === 'accepted' ? 'text-success' : 'text-muted-foreground'}`}
                >
                  {APPLICATION_LABEL[app.status] ?? app.status}
                </Text>
              )}
              {/* An applicant is usually a stranger, and the application is the
                  only thing on this screen that names them. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`More options for ${app.personName}`}
                onPress={() => setSafetyFor(app)}
                className="w-11 h-11 -mr-2 items-center justify-center active:opacity-60"
              >
                <EllipsisIcon size={16} className="text-muted-foreground" />
              </Pressable>
            </View>

            {/* Older applications carry a message; newer ones lean on the
                portfolio, which says more than the paragraph did. */}
            {app.message ? (
              <Text className="text-muted-foreground text-[13px] leading-5">{app.message}</Text>
            ) : app.personHandle ? (
              <Pressable
                onPress={() => router.push(`/u/${app.personHandle}`)}
                accessibilityRole="button"
                className="self-start min-h-[44px] justify-center active:opacity-60"
              >
                <Text className="text-primary text-[13px] font-semibold">See their work</Text>
              </Pressable>
            ) : (
              <Text className="text-muted-foreground text-[13px] leading-5">
                They have not published a profile yet.
              </Text>
            )}

            {waitingOnYou && beingDeclined ? (
              <View className="flex-row items-center gap-2 rounded-lg bg-muted pl-3">
                <Text className="flex-1 text-foreground text-[13px]">
                  Declined. They will be told in a moment.
                </Text>
                <Pressable
                  onPress={() => undo(app.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Undo declining ${app.personName}`}
                  className="min-h-[44px] px-4 justify-center active:opacity-60"
                >
                  <Text className="text-primary text-[13px] font-bold">Undo</Text>
                </Pressable>
              </View>
            ) : waitingOnYou ? (
              <View className="flex-row items-center gap-2">
                {/* A post that has ended takes no one on: only Decline, which
                    answers them. Nor a role somebody already holds. */}
                {live && !roleTaken && (
                  <Pressable
                    className="rounded-lg px-3.5 min-h-11 flex-row items-center gap-1.5 bg-action active:opacity-90"
                    disabled={respond.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={`Hire ${app.personName}`}
                    onPress={() => accept(app)}
                  >
                    {acting === app.id
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <CheckIcon size={14} className="text-action-foreground" />}
                    <Text className="text-action-foreground text-[13px] font-bold">Accept</Text>
                  </Pressable>
                )}
                {live && roleTaken && (
                  <Text className="text-muted-foreground text-[12px]">
                    {app.role} is booked. Cancel that booking to hire someone else.
                  </Text>
                )}
                {live && !roleTaken && app.status !== 'shortlisted' && (
                  <Pressable
                    className="min-h-11 px-2.5 flex-row items-center gap-1.5 active:opacity-60"
                    disabled={respond.isPending}
                    accessibilityRole="button"
                    onPress={() => send(app.id, 'shortlisted')}
                  >
                    <StarIcon size={14} className="text-muted-foreground" />
                    <Text className="text-foreground text-[13px] font-semibold">Shortlist</Text>
                  </Pressable>
                )}
                <Pressable
                  className="min-h-11 px-2.5 flex-row items-center gap-1.5 ml-auto active:opacity-60"
                  disabled={respond.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={`Decline ${app.personName}`}
                  onPress={() => decline(app.id)}
                >
                  <XIcon size={14} className="text-muted-foreground" />
                  <Text className="text-foreground text-[13px]">Decline</Text>
                </Pressable>
              </View>
            ) : null}

            {app.status === 'accepted' && <BookingLink applicationId={app.id} />}
            {app.status === 'accepted' && app.conversationId && (
              <OpenChat conversationId={app.conversationId} />
            )}
          </View>
        );
      })}

      {/* By application: the row carries no account id. */}
      <PersonSafetySheet
        visible={!!safetyFor}
        onClose={() => setSafetyFor(null)}
        name={safetyFor?.personName ?? ''}
        target={safetyFor ? { applicationId: safetyFor.id } : null}
        source="applicants"
      />
    </View>
  );
}

function OpenChat({ conversationId }: { conversationId: string }) {
  return (
    <Pressable
      className="self-start min-h-[44px] flex-row items-center gap-1.5 active:opacity-60"
      onPress={() => router.push(`/chat/${conversationId}`)}
      accessibilityRole="button"
    >
      <MessageCircleIcon size={15} className="text-primary" />
      <Text className="text-primary text-[13px] font-semibold">Open chat</Text>
    </Pressable>
  );
}

function MyApplications({ bottom, onBrowse }: { bottom: number; onBrowse: () => void }) {
  const onScroll = useChromeScroll();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { applications, isLoading, loadFailed, refetch } = useMyApplications();
  const withdraw = useWithdrawApplication();
  const [refreshing, setRefreshing] = useState(false);

  const confirmWithdraw = (app: JobApplication) =>
    Alert.alert(
      'Withdraw this application?',
      `${app.postTitle} will no longer show you as an applicant. You can apply again while it is open.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: () => {
            // mutateAsync, not per-call callbacks: those are dropped if the
            // tab unmounts before the answer lands, and a failure would vanish.
            withdraw.mutateAsync(app.id).catch((e) =>
              Alert.alert("Couldn't withdraw it", jobError(e)),
            );
          },
        },
      ],
    );

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (isLoading && applications.length === 0) return <CardListSkeleton count={3} />;
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
    <Animated.ScrollView
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={{ padding: 20, paddingBottom: bottom, gap: 10 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
      }
    >
      {applications.map((app) => {
        /*
         * What happened to the post is the answer once it has ended, so it is
         * what the row says. The status comes from the server as everybody
         * sees it — a post past its date reads ended, not open — so a Withdraw
         * is no longer offered on a post that would not open. A post you were
         * hired on always opens.
         */
        const postGone = app.postStatus !== 'open';
        const unanswered = app.status === 'new' || app.status === 'shortlisted';
        const label =
          postGone && unanswered ? POST_ENDED_LABEL[app.postStatus] : APPLICATION_LABEL[app.status];
        const opens = app.status === 'accepted' || !postGone;
        return (
          <View key={app.id} className="bg-card rounded-2xl p-4 gap-2">
            <View className="flex-row items-start gap-3">
              <Pressable
                className="flex-1 min-w-0 active:opacity-70"
                disabled={!opens}
                accessibilityRole={opens ? 'button' : undefined}
                onPress={() => router.push(`/jobs/${app.postSlug}`)}
              >
                <Text className="text-foreground text-[15px] font-bold leading-snug">{app.postTitle}</Text>
                <Text className="text-muted-foreground text-[12px] mt-0.5">
                  {[app.role, `Applied ${new Date(app.createdAt).toLocaleDateString()}`]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </Pressable>
              <Text
                className={`text-[11px] font-bold uppercase ${app.status === 'accepted' ? 'text-success' : 'text-muted-foreground'}`}
              >
                {label}
              </Text>
            </View>

            {app.message && (
              <Text className="text-muted-foreground text-[13px] leading-5">{app.message}</Text>
            )}

            {unanswered && !postGone && (
              <Pressable
                className="self-start min-h-[44px] px-4 rounded-xl border border-border justify-center active:opacity-70"
                accessibilityRole="button"
                disabled={withdraw.isPending && withdraw.variables === app.id}
                onPress={() => confirmWithdraw(app)}
              >
                <Text className="text-foreground text-[13px] font-semibold">
                  {withdraw.isPending && withdraw.variables === app.id ? 'Withdrawing…' : 'Withdraw'}
                </Text>
              </Pressable>
            )}

            {app.status === 'accepted' && <BookingLink applicationId={app.id} />}
            {app.status === 'accepted' && app.conversationId && (
              <OpenChat conversationId={app.conversationId} />
            )}
          </View>
        );
      })}
    </Animated.ScrollView>
  );
}

/** What an unanswered application says once its post has ended. */
const POST_ENDED_LABEL: Record<string, string> = {
  open: 'Applied',
  filled: 'Post filled',
  closed: 'Post closed',
  expired: 'Post ended',
};

function Empty({
  title, body, cta, onPress,
}: {
  title: string; body: string; cta: string; onPress: () => void;
}) {
  const obstruction = useTabObstruction();
  return (
    <View className="flex-1 justify-center" style={{ paddingBottom: obstruction }}>
      <EmptyState icon={BriefcaseIcon} title={title} body={body} action={{ label: cta, onPress }} />
    </View>
  );
}
