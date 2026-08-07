import {
  View, Text, ScrollView, Pressable, TextInput, Image, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useApplyToJob, useJob, useReportJob } from '@/src/hooks';
import { budgetLabel } from '@/src/api';
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
export default function JobDetailScreen() {
  const insets = useSafeAreaInsets();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const job = useJob(slug);
  const apply = useApplyToJob();
  const report = useReportJob();
  const [message, setMessage] = useState('');

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
  const tooShort = message.trim().length < 20;

  const submit = () => {
    apply.mutate(
      { slug: slug as string, message: message.trim() },
      {
        onSuccess: () => {
          Alert.alert('Application sent',
            `${post.postedBy.displayName} will see it and can reply in chat.`);
          router.replace('/jobs/mine');
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

          <View className="flex-row flex-wrap gap-1.5">
            {post.rolesWanted.map((r) => (
              <View key={r} className="rounded-full px-3 py-1"
                style={{ backgroundColor: '#B66A4018' }}>
                <Text className="text-[11px] font-bold" style={{ color: '#B66A40' }}>{r}</Text>
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
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px]">
                Why you
              </Text>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="What you have shot that is like this, whether you are free on the day, and anything they should see. Keep it short — they are reading several of these."
                placeholderTextColor="#9ca3af"
                multiline
                maxLength={2000}
                textAlignVertical="top"
                className="bg-card rounded-xl px-3.5 py-3 text-foreground text-sm"
                style={{ minHeight: 130 }}
              />
              <Text className="text-muted-foreground text-[11px]">
                {tooShort
                  ? 'A couple of lines at least — a one-word application does not get read.'
                  : `${message.length} / 2000`}
              </Text>

              <Pressable
                className="rounded-2xl py-4 flex-row items-center justify-center gap-2 mt-1"
                style={{
                  backgroundColor: '#B66A40',
                  opacity: tooShort || apply.isPending ? 0.4 : 1,
                }}
                disabled={tooShort || apply.isPending}
                onPress={submit}
              >
                {apply.isPending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <SendIcon size={16} style={{ color: '#fff' }} />}
                <Text className="text-white text-[15px] font-bold">Apply</Text>
              </Pressable>

              <Text className="text-muted-foreground text-[11px] text-center">
                They see your profile and roles alongside this.
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
