import {
  View, Text, ScrollView, Pressable, TextInput, Image, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useApplyToJob, useJob, useReportJob } from '@/src/hooks';
import { budgetLabel, roleBudgetLabel } from '@/src/api';
import { jobDate, postedAgo } from '@/src/lib/jobs-format';
import {
  ArrowLeftIcon, BriefcaseIcon, CalendarIcon, MapPinIcon,
  BanknoteIcon, SendIcon, FlagIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLACEHOLDER_IMAGE } from '@/src/lib/placeholder';

for (const Icon of [
  ArrowLeftIcon, BriefcaseIcon, CalendarIcon, MapPinIcon,
  BanknoteIcon, SendIcon, FlagIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** One job, and the form to apply to it. */
/** Matches web's APPLICATION_STATE so the two clients say the same words. */
const APPLICATION_LABEL: Record<string, string> = {
  new: 'Applied',
  shortlisted: 'Shortlisted',
  accepted: 'Accepted',
  declined: 'Not selected',
};

export default function JobDetailScreen() {
  const insets = useSafeAreaInsets();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const job = useJob(slug);
  const apply = useApplyToJob();
  const report = useReportJob();
  const [role, setRole] = useState<string | null>(null);

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
  // One role is not a choice, so it is not offered as one — the server fills
  // it in. More than one and it has to be answered before applying.
  const choosing = post.rolesWanted.length > 1;
  const ready = !choosing || !!role;

  const submit = () => {
    apply.mutate(
      { slug: slug as string, role },
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

  const flag = () => {
    Alert.alert('Report this post', 'What is wrong with it?', [
      { text: 'Cancel', style: 'cancel' },
      ...(['spam', 'scam', 'offensive', 'not-a-job'] as const).map((reason) => ({
        text: reason === 'not-a-job' ? 'Not a real job' : reason[0].toUpperCase() + reason.slice(1),
        onPress: () =>
          report.mutate(
            { postId: post.id, reason },
            {
              onSuccess: () => Alert.alert('Thanks', 'We will take a look at it.'),
              onError: (e: Error) => Alert.alert('Could not report', e.message),
            },
          ),
      })),
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-3 px-5 py-3">
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeftIcon size={20} className="text-foreground" />
        </Pressable>
        <Text className="text-foreground text-lg font-bold flex-1">Job</Text>
        <Pressable onPress={flag} hitSlop={10} disabled={report.isPending}>
          <FlagIcon size={17} className="text-muted-foreground" />
        </Pressable>
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
              <Image
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
            {post.rolesWanted.map((r) => (
              <View
                key={r}
                className="border-border flex-row items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5"
              >
                <Text className="text-foreground text-[13px] font-medium">{r}</Text>
                <Text className="text-muted-foreground text-[13px]">
                  {roleBudgetLabel(post.roleBudgets, r) ?? 'Rate not stated'}
                </Text>
              </View>
            ))}
          </View>

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
          ) : isOpen ? (
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
                    {post.rolesWanted.map((r) => (
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
                  : <SendIcon size={16} style={{ color: '#fff' }} />}
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
    </SafeAreaView>
  );
}

function Row({
  icon: Icon, label, children,
}: {
  icon: React.ComponentType<any>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-2.5">
      <Icon size={14} style={{ color: '#B66A40' }} />
      <Text className="text-muted-foreground text-[12px] w-16">{label}</Text>
      <Text className="text-foreground text-[13px] font-semibold flex-1">{children}</Text>
    </View>
  );
}
