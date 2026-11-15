import {
  View, Text, ScrollView, Pressable, Alert, Share,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { useApplyToJob, useJob, useReportJob, useWithdrawApplication } from '@/src/hooks';
import { goToTab } from '@/src/lib/navigation';
import {
  ApiError,
  applicationFor,
  budgetLabel,
  isRoleFilled,
  openRolesOf,
  roleBudgetLabel,
  rolesLeftFor,
  type ReportReason,
} from '@/src/api';
import { APPLICATION_LABEL, jobDate, postedAgo } from '@/src/lib/jobs-format';
import {
  ArrowLeftIcon, BriefcaseIcon, CheckIcon, MapPinIcon,
  SendIcon, EllipsisIcon, Share2Icon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { DetailFallback } from '@/components/DetailFallback';
import { PLACEHOLDER_IMAGE } from '@/src/lib/placeholder';
import { ActionSheet } from '@/components/WorkspaceBits';
import { ReportSheet } from '@/components/ReportSheet';
import { firstName, safetyError, usePersonSafety } from '@/components/PersonSafetySheet';

for (const Icon of [
  ArrowLeftIcon, BriefcaseIcon, CheckIcon, MapPinIcon,
  SendIcon, EllipsisIcon, Share2Icon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** The one card, as on the Dashboard. */
const CARD = 'bg-card rounded-[20px] border border-border/40 overflow-hidden';
const TITLE = 'text-foreground text-[17px] leading-6 font-bold tracking-tight';

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

/** What can be wrong with a post, as opposed to with the person behind it. */
const POST_REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'scam', label: 'Scam' },
  { value: 'offensive', label: 'Offensive' },
  { value: 'not-a-job', label: 'Not a real job' },
  { value: 'other', label: 'Something else' },
];

/** The person wording, except that a missing post is not a missing person. */
function postReportFailure(err: unknown): string {
  if (err instanceof ApiError && err.status === 404) {
    return 'That job post is no longer available.';
  }
  return safetyError(err);
}

/** One job, and the form to apply to it. */
export default function JobDetailScreen() {
  const insets = useSafeAreaInsets();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const job = useJob(slug);
  const apply = useApplyToJob();
  const withdraw = useWithdrawApplication();
  const report = useReportJob();
  const [role, setRole] = useState<string | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [postReportOpen, setPostReportOpen] = useState(false);
  const [postReportError, setPostReportError] = useState<string | null>(null);
  /** What to show once the post report sheet has finished closing. */
  const afterPostReport = useRef<(() => void) | null>(null);

  // Addressed by the post: the poster's account id is never sent to the
  // phone. Across a block the post 404s, so blocking goes back.
  const loaded = job.data;
  const poster = usePersonSafety({
    name: loaded?.postedBy.displayName ?? '',
    target: loaded && !loaded.isMine ? { jobPostId: loaded.id } : null,
    source: 'job',
    onBlocked: () => router.back(),
  });

  // "Job not found" answered every failure, a dropped connection included,
  // with no way to try again.
  if (!job.data) {
    return (
      <DetailFallback
        title="Job"
        what="this job"
        // Filled and closed posts still open, saying so; what does not open
        // is one that has ended or been taken down.
        gone="This post has ended or been taken down."
        error={job.error}
        failed={job.isError || job.isPaused}
        onRetry={() => void job.refetch()}
      />
    );
  }

  const post = job.data;
  const budget = budgetLabel(post.budgetMin, post.budgetMax);
  const isOpen = post.status === 'open';
  // The roles still open to this reader. Applying as HMUA used to close the
  // videographer slot on the same post for good; now it closes only that one.
  const left = rolesLeftFor(post);
  const openRoles = openRolesOf(post);
  // One role left is not a choice, so it is not offered as one — the server
  // fills it in. More than one and it has to be answered before applying.
  const choosing = left.length > 1;
  const ready = !choosing || !!role;

  /*
   * Applying keeps you on the post. It threw you onto a second copy of the
   * Jobs tab, under an alert promising a chat that only exists once they
   * accept you. The post itself now says you applied, as what, and offers to
   * take it back.
   */
  const submit = () => {
    apply.mutate(
      { slug: slug as string, role: choosing ? role : (left[0] ?? null) },
      {
        onSuccess: () => setRole(null),
        onError: (error: Error) => Alert.alert("Couldn't apply", error.message),
      },
    );
  };

  /** Your applications on this post that have not been answered yet. */
  const pendingMine = (post.myApplications ?? []).filter(
    (a) => a.status === 'new' || a.status === 'shortlisted',
  );
  const withdrawFrom = (id: string, as: string | null) =>
    Alert.alert(
      'Withdraw your application?',
      `${post.postedBy.displayName} will no longer see you${as ? ` as ${as}` : ''}. You can apply again while it is open.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: () =>
            withdraw.mutateAsync(id).catch((e: Error) => Alert.alert("Couldn't withdraw it", e.message)),
        },
      ],
    );

  const share = () =>
    void Share.share({ message: `${post.title} — https://virgo.ph/jobs/${post.slug}` }).catch(() => undefined);

  const submitPostReport = (reason: ReportReason, note: string) => {
    setPostReportError(null);
    report.mutate(
      { postId: post.id, reason, note: note.trim() || undefined },
      {
        onSuccess: () => {
          // Shown once the sheet has gone: iOS drops an alert raised while a
          // modal is still on its way out.
          afterPostReport.current = () => Alert.alert('Thanks', 'We will take a look at it.');
          setPostReportOpen(false);
        },
        onError: (err) => setPostReportError(postReportFailure(err)),
      },
    );
  };

  const posterFirst = firstName(post.postedBy.displayName);

  const when = post.eventDate ? jobDay(post.eventDate) : null;
  const canApply = !post.isMine && isOpen && left.length > 0;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* No title in the bar: the job's own name is the first thing under it,
          and "Job" above that said nothing. */}
      <View className="h-12 flex-row items-center px-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="w-11 h-11 items-center justify-center active:opacity-60"
        >
          <ArrowLeftIcon size={22} className="text-foreground" />
        </Pressable>
        <View className="flex-1" />
        <Pressable
          onPress={share}
          accessibilityRole="button"
          accessibilityLabel="Share this job"
          className="w-11 h-11 items-center justify-center active:opacity-60"
        >
          <Share2Icon size={20} className="text-foreground" />
        </Pressable>
        {!post.isMine && (
          <Pressable
            onPress={() => setMenuOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="More options"
            className="w-11 h-11 items-center justify-center active:opacity-60"
          >
            <EllipsisIcon size={20} className="text-foreground" />
          </Pressable>
        )}
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={8}
      >
        <ScrollView keyboardDismissMode="on-drag"
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: insets.bottom + 40, gap: 28 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-3">
            {!isOpen && (
              <View className="rounded-[14px] px-3.5 py-3 bg-warning/10">
                <Text className="text-warning text-[14px] font-semibold">
                  {post.status === 'filled'
                    ? 'This job has been filled.'
                    : post.status === 'expired'
                      ? 'This job has ended.'
                      : 'This post is closed.'}
                </Text>
              </View>
            )}
            <Text accessibilityRole="header" className="text-foreground text-[24px] leading-[30px] font-bold tracking-tight">
              {post.title}
            </Text>
            <View className="flex-row items-center gap-2.5">
              <RemoteImage
                source={{ uri: post.postedBy.avatarUrl ?? PLACEHOLDER_IMAGE }}
                style={{ width: 36, height: 36, borderRadius: 18 }}
              />
              <View className="flex-1 min-w-0">
                <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={1}>
                  {post.postedBy.displayName}
                </Text>
                <Text className="text-muted-foreground text-[13px] leading-[18px]">
                  Posted {postedAgo(post.createdAt)}
                  {post.applicantCount > 0 ? ` · ${post.applicantCount} applied` : ''}
                </Text>
              </View>
            </View>
          </View>

          {/* When, what it pays, where: the three things a decision needs,
              in the order they are weighed. They were three 13pt rows with a
              terracotta icon each. */}
          <View className={CARD}>
            <View className="flex-row items-center gap-3.5 p-4">
              {when ? (
                <View className="w-14 rounded-[14px] bg-muted items-center py-2">
                  <Text allowFontScaling={false} className="text-muted-foreground text-[11px] leading-[14px] font-bold tracking-wider">
                    {when.month}
                  </Text>
                  <Text allowFontScaling={false} className="text-foreground text-[24px] leading-7 font-bold tracking-tight">
                    {when.day}
                  </Text>
                </View>
              ) : null}
              <View className="flex-1 min-w-0">
                <Text
                  className="text-foreground text-[22px] leading-7 font-bold tracking-tight"
                  style={{ fontVariant: ['tabular-nums'] }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {budget ?? 'Open to offers'}
                </Text>
                <Text className="text-muted-foreground text-[13px] leading-[18px]">
                  {post.eventDate ? jobDate(post.eventDate) : 'Flexible date'}
                </Text>
              </View>
            </View>
            <View className="min-h-[52px] flex-row items-center gap-3 px-4 border-t border-border/30">
              <MapPinIcon size={18} className="text-secondary-foreground" />
              <Text className="flex-1 text-foreground text-[15px] leading-5 font-semibold" numberOfLines={2}>
                {post.location ?? 'Place not specified'}
              </Text>
            </View>
          </View>

          {/*
            Each role with what it pays, rather than bare chips above one
            range for the whole post. A photographer reading "₱2,000 –
            ₱15,000" on a post that also wants a videographer learns nothing
            about what they would be paid.
          */}
          {post.rolesWanted.length > 0 && (
            <View>
              <Text accessibilityRole="header" className={`${TITLE} mb-2.5`}>Who they need</Text>
              <View className={CARD}>
                {post.rolesWanted.map((r, i) => {
                  // Three things a post with several roles has to answer before
                  // anyone can decide anything: what each pays, which are gone,
                  // and which of them you have already taken a shot at.
                  const mine = applicationFor(post, r);
                  const filled = isRoleFilled(post, r);
                  return (
                    <View
                      key={r}
                      className={`min-h-[52px] flex-row items-center gap-3 px-4 ${i > 0 ? 'border-t border-border/30' : ''}`}
                    >
                      <Text
                        className={`flex-1 text-[15px] leading-5 ${
                          filled ? 'text-muted-foreground font-medium line-through' : 'text-foreground font-semibold'
                        }`}
                        numberOfLines={1}
                      >
                        {r}
                      </Text>
                      {mine ? (
                        <Text
                          className={`text-[13px] font-semibold ${mine.status === 'accepted' ? 'text-success' : 'text-muted-foreground'}`}
                        >
                          {APPLICATION_LABEL[mine.status]}
                        </Text>
                      ) : null}
                      <Text
                        className={`text-[14px] ${filled ? 'text-muted-foreground font-semibold' : 'text-foreground font-semibold'}`}
                        style={{ fontVariant: ['tabular-nums'] }}
                      >
                        {filled ? 'Filled' : (roleBudgetLabel(post.roleBudgets, r) ?? 'Rate not stated')}
                      </Text>
                    </View>
                  );
                })}
              </View>
              {/* Said once, under the rows: "every one of these is gone" is not
                  a thing anybody should work out by reading five badges. */}
              {openRoles.length === 0 && (
                <Text className="text-muted-foreground text-[13px] leading-[18px] mt-2 mx-1">
                  All roles on this job are now closed.
                </Text>
              )}
            </View>
          )}

          <View>
            <Text accessibilityRole="header" className={TITLE}>About the job</Text>
            <Text className="text-foreground text-[15px] leading-[22px] mt-2">
              {post.description}
            </Text>
          </View>

          {/* Your own post never offers the form. The API refuses a
              self-application, so showing it would only let somebody write one
              out to be told no. */}
          {post.isMine ? (
            <View className="gap-3">
              <Text className="text-muted-foreground text-[14px] leading-5">
                This is your post. Applications arrive under Jobs › Posted.
              </Text>
              <Pressable
                className="rounded-[14px] min-h-[48px] flex-row items-center justify-center gap-2 bg-foreground active:opacity-80"
                accessibilityRole="button"
                onPress={() => goToTab(`/(app)/(tabs)/jobs?tab=posted&post=${post.id}`)}
              >
                <Text className="text-background text-[15px] font-semibold">Manage post</Text>
              </Pressable>
              <Pressable
                className="rounded-[14px] min-h-[48px] flex-row items-center justify-center gap-2 bg-card border border-border active:opacity-80"
                accessibilityRole="button"
                onPress={share}
              >
                <Share2Icon size={16} className="text-foreground" />
                <Text className="text-foreground text-[15px] font-semibold">Share this job</Text>
              </Pressable>
            </View>
          ) : null}

          {/* What you applied for and are still waiting on, and the way to
              take it back — the post had neither. */}
          {!post.isMine && pendingMine.length > 0 && (
            <View className="gap-2">
              {pendingMine.map((a) => (
                <View key={a.id} className="min-h-[52px] flex-row items-center gap-3 rounded-[14px] bg-success/10 pl-4">
                  <CheckIcon size={18} className="text-success" />
                  <Text className="flex-1 text-foreground text-[15px] font-semibold">
                    {a.role ? `Applied as ${a.role}` : 'Applied'}
                    {a.status === 'shortlisted' ? ' · shortlisted' : ''}
                  </Text>
                  {isOpen && (
                    <Pressable
                      onPress={() => withdrawFrom(a.id, a.role)}
                      disabled={withdraw.isPending}
                      accessibilityRole="button"
                      accessibilityLabel={`Withdraw your application${a.role ? ` as ${a.role}` : ''}`}
                      className="min-h-[44px] px-4 justify-center active:opacity-60"
                    >
                      <Text className="text-foreground text-[14px] font-semibold">Withdraw</Text>
                    </Pressable>
                  )}
                </View>
              ))}
              <Text className="text-muted-foreground text-[13px] leading-[18px]">
                {post.postedBy.displayName} sees your profile, your roles and your portfolio. You
                will hear when they answer, and a chat opens if they take you on.
              </Text>
            </View>
          )}

          {/*
            Which role, when there is a choice to make. The button that sends
            it is pinned under the page, below.

            No "why you" box: it asked for a paragraph addressed to somebody
            who cannot reply until they have already accepted you, and the
            portfolio says more than the paragraph did.
          */}
          {canApply && choosing && (
            <View>
              <Text accessibilityRole="header" className={`${TITLE} mb-2.5`}>Apply as</Text>
              <View className={CARD}>
                {left.map((r, i) => (
                  <Pressable
                    key={r}
                    onPress={() => setRole(r)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: role === r, checked: role === r }}
                    accessibilityLabel={`${r}, ${roleBudgetLabel(post.roleBudgets, r) ?? 'rate not stated'}`}
                    className={`min-h-[52px] flex-row items-center gap-3 px-4 active:bg-muted/40 ${i > 0 ? 'border-t border-border/30' : ''}`}
                  >
                    <View
                      className={`w-5 h-5 rounded-full items-center justify-center border-2 ${
                        role === r ? 'border-foreground' : 'border-border'
                      }`}
                    >
                      {role === r && <View className="w-2.5 h-2.5 rounded-full bg-foreground" />}
                    </View>
                    <Text className="flex-1 text-foreground text-[15px] font-semibold">{r}</Text>
                    <Text className="text-muted-foreground text-[14px]">
                      {roleBudgetLabel(post.roleBudgets, r) ?? 'Rate not stated'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        {/* The screen's one action, in reach at any scroll position. It was
            the last thing on the page, under everything there is to read. */}
        {canApply && (
          <View
            className="bg-background border-t border-border/50 px-5 pt-3"
            style={{ paddingBottom: Math.max(insets.bottom, 12) }}
          >
            <Pressable
              className="rounded-2xl min-h-[50px] flex-row items-center justify-center gap-2 bg-action"
              style={{ opacity: !ready || apply.isPending ? 0.45 : 1 }}
              disabled={!ready || apply.isPending}
              accessibilityRole="button"
              accessibilityState={{ disabled: !ready || apply.isPending, busy: apply.isPending }}
              onPress={submit}
            >
              {apply.isPending
                ? <ActivityIndicator size="small" color="#fff" />
                : <SendIcon size={17} className="text-action-foreground" />}
              <Text className="text-action-foreground text-[16px] font-semibold">
                {choosing && !role
                  ? 'Pick a role to apply'
                  : !choosing && left[0] && post.rolesWanted.length > 1
                    ? `Apply as ${left[0]}`
                    : 'Apply'}
              </Text>
            </Pressable>
            {pendingMine.length === 0 && (
              <Text className="text-muted-foreground text-[12px] text-center mt-2">
                They see your profile, your roles and your portfolio.
              </Text>
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* The post and the person are reported separately: a fake listing
          and a person who is a problem are different things to act on. */}
      <ActionSheet
        visible={menuOpen}
        title="This job"
        actions={[
          {
            label: 'Report this post',
            onPress: () => {
              setPostReportError(null);
              setPostReportOpen(true);
            },
          },
          { label: `Report ${posterFirst}`, onPress: poster.openReport },
          { label: `Block ${posterFirst}`, destructive: true, onPress: poster.confirmBlock },
        ]}
        onClose={() => setMenuOpen(false)}
      />
      <ReportSheet
        visible={postReportOpen}
        title="Report this post"
        reasons={POST_REPORT_REASONS}
        pending={report.isPending}
        error={postReportError}
        onSubmit={submitPostReport}
        onClose={() => setPostReportOpen(false)}
        onClosed={() => {
          const run = afterPostReport.current;
          afterPostReport.current = null;
          run?.();
        }}
      />
      {poster.sheets}
    </SafeAreaView>
  );
}
