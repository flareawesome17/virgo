import {
  View, Text, ScrollView, Pressable, TextInput, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { useApplyToJob, useJob, useReportJob } from '@/src/hooks';
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
  ArrowLeftIcon, BriefcaseIcon, CalendarIcon, MapPinIcon,
  BanknoteIcon, SendIcon, EllipsisIcon,
  type LucideIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLACEHOLDER_IMAGE } from '@/src/lib/placeholder';
import { ActionSheet } from '@/components/WorkspaceBits';
import { ReportSheet } from '@/components/ReportSheet';
import { firstName, safetyError, usePersonSafety } from '@/components/PersonSafetySheet';

for (const Icon of [
  ArrowLeftIcon, BriefcaseIcon, CalendarIcon, MapPinIcon,
  BanknoteIcon, SendIcon, EllipsisIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
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

  if (job.isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#B66A40" />
      </SafeAreaView>
    );
  }

  if (job.isError || !job.data) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-10">
        <BriefcaseIcon size={30} className="text-muted-foreground" />
        <Text className="text-foreground text-[15px] font-bold mt-3">Job not found</Text>
        <Text className="text-muted-foreground text-[13px] text-center mt-1.5 leading-5">
          This post has been filled, closed, or taken down.
        </Text>
        <Pressable className="mt-5" onPress={() => router.back()}>
          <Text className="text-[13px] font-bold" style={{ color: '#B66A40' }}>Go back</Text>
        </Pressable>
      </SafeAreaView>
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

  const submit = () => {
    apply.mutate(
      { slug: slug as string, role: choosing ? role : (left[0] ?? null) },
      {
        onSuccess: () => {
          Alert.alert('Application sent',
            `${post.postedBy.displayName} will see it and can reply in chat.`);
          router.replace('/jobs/mine?tab=applications');
        },
        onError: (error: Error) => Alert.alert('Could not apply', error.message),
      },
    );
  };

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

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-3 px-5 py-3">
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeftIcon size={20} className="text-foreground" />
        </Pressable>
        <Text className="text-foreground text-lg font-bold flex-1">Job</Text>
        {!post.isMine && (
          <Pressable
            onPress={() => setMenuOpen(true)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="More options"
          >
            <EllipsisIcon size={18} className="text-muted-foreground" />
          </Pressable>
        )}
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, gap: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          {!isOpen && (
            <View className="rounded-xl p-3" style={{ backgroundColor: '#f59e0b18' }}>
              <Text className="text-[12px]" style={{ color: '#f59e0b' }}>
                {post.status === 'filled'
                  ? 'This job has been filled.'
                  : post.status === 'expired'
                    ? 'This post has expired.'
                    : 'This post is closed.'}
              </Text>
            </View>
          )}

          <View>
            <Text className="text-foreground text-xl font-extrabold leading-tight">
              {post.title}
            </Text>
            <View className="flex-row items-center gap-2.5 mt-3">
              <RemoteImage
                source={{ uri: post.postedBy.avatarUrl ?? PLACEHOLDER_IMAGE }}
                style={{ width: 34, height: 34, borderRadius: 17 }}
              />
              <View>
                <Text className="text-foreground text-[13px] font-semibold">
                  {post.postedBy.displayName}
                </Text>
                <Text className="text-muted-foreground text-[11px]">
                  Posted {postedAgo(post.createdAt)}
                  {post.applicantCount > 0 ? ` · ${post.applicantCount} applied` : ''}
                </Text>
              </View>
            </View>
          </View>

          <View className="bg-card rounded-2xl p-4 gap-3">
            <Row icon={CalendarIcon} label="Date">
              {post.eventDate ? jobDate(post.eventDate) : 'Flexible'}
            </Row>
            <Row icon={MapPinIcon} label="Where">{post.location ?? 'Not specified'}</Row>
            <Row icon={BanknoteIcon} label="Budget">{budget ?? 'Open to offers'}</Row>
          </View>

          {/*
            Each role with what it pays, rather than bare chips above one
            range for the whole post. A photographer reading "₱2,000 –
            ₱15,000" on a post that also wants a videographer learns nothing
            about what they would be paid.
          */}
          <View className="gap-1.5">
            {post.rolesWanted.map((r) => {
              // Three things a post with several roles has to answer before
              // anyone can decide anything: what each pays, which are gone,
              // and which of them you have already taken a shot at.
              const mine = applicationFor(post, r);
              const filled = isRoleFilled(post, r);
              return (
                <View
                  key={r}
                  className="border-border flex-row items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5"
                  style={{ opacity: filled ? 0.6 : 1 }}
                >
                  <View className="flex-row items-center gap-2">
                    <Text className="text-foreground text-[13px] font-medium">{r}</Text>
                    {filled && (
                      <Text className="text-muted-foreground text-[10px] font-bold uppercase">
                        Filled
                      </Text>
                    )}
                  </View>
                  <View className="flex-row items-center gap-2">
                    {mine && (
                      <Text
                        className="text-[10px] font-bold uppercase"
                        style={{ color: mine.status === 'accepted' ? '#10b981' : '#9ca3af' }}
                      >
                        {APPLICATION_LABEL[mine.status]}
                      </Text>
                    )}
                    <Text className="text-muted-foreground text-[13px]">
                      {roleBudgetLabel(post.roleBudgets, r) ?? 'Rate not stated'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Said once, above the per-role rows: "every one of these is gone"
              is not a thing anybody should work out by reading five badges. */}
          {post.rolesWanted.length > 0 && openRoles.length === 0 && (
            <View className="rounded-xl px-3.5 py-3" style={{ backgroundColor: '#8881' }}>
              <Text className="text-foreground text-[13px]">
                All roles on this job are now closed.
              </Text>
            </View>
          )}

          <View>
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px]">
              The job
            </Text>
            <Text className="text-foreground text-[14px] leading-6 mt-2">
              {post.description}
            </Text>
          </View>

          {/* Your own post never offers the form. The API refuses a
              self-application, so showing it would only let somebody write one
              out to be told no. */}
          {post.isMine ? (
            <View className="gap-2.5 border-t border-border pt-4">
              <Text className="text-muted-foreground text-[12px] leading-5">
                This is your post. Applications arrive under My jobs.
              </Text>
              <Pressable
                className="rounded-2xl py-3.5 flex-row items-center justify-center gap-2"
                style={{ borderWidth: 1, borderColor: '#B66A40' }}
                onPress={() => router.push('/jobs/mine')}
              >
                <Text className="text-[15px] font-bold" style={{ color: '#B66A40' }}>
                  Manage post
                </Text>
              </Pressable>
            </View>
          ) : isOpen && left.length > 0 ? (
            <View className="gap-2 border-t border-border pt-4">
              {/*
                Which role, when there is a choice to make.

                No "why you" box any more: it asked for a paragraph addressed
                to somebody who cannot reply until they have already accepted
                you, and the portfolio says more than the paragraph did.
              */}
              {choosing && (
                <>
                  <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px]">
                    Applying as
                  </Text>
                  <View className="gap-2">
                    {left.map((r) => (
                      <Pressable
                        key={r}
                        onPress={() => setRole(r)}
                        className="flex-row items-center justify-between gap-3 rounded-xl px-3.5 py-3"
                        style={{
                          borderWidth: 1,
                          borderColor: role === r ? '#B66A40' : '#8883',
                          backgroundColor: role === r ? '#B66A400D' : undefined,
                        }}
                      >
                        <Text className="text-foreground text-[13px] font-medium">{r}</Text>
                        <Text className="text-muted-foreground text-[13px]">
                          {roleBudgetLabel(post.roleBudgets, r) ?? 'Rate not stated'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              <Pressable
                className="rounded-2xl py-4 flex-row items-center justify-center gap-2 mt-1"
                style={{
                  backgroundColor: '#B66A40',
                  opacity: !ready || apply.isPending ? 0.4 : 1,
                }}
                disabled={!ready || apply.isPending}
                onPress={submit}
              >
                {apply.isPending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <SendIcon size={16} color="#fff" />}
                <Text className="text-white text-[15px] font-bold">
                  {choosing && !role ? 'Pick a role to apply' : 'Apply'}
                </Text>
              </Pressable>

              <Text className="text-muted-foreground text-[11px] text-center">
                They see your profile, your roles and your portfolio.
              </Text>
            </View>
          ) : null}
        </ScrollView>
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

function Row({
  icon: Icon, label, children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-2.5">
      <Icon size={14} color="#B66A40" />
      <Text className="text-muted-foreground text-[12px] w-16">{label}</Text>
      <Text className="text-foreground text-[13px] font-semibold flex-1">{children}</Text>
    </View>
  );
}
