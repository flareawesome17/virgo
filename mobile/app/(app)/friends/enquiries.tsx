import {
  View, Text, ScrollView, Pressable, RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState } from 'react';
import { useAnswerEnquiry, useHireEnquiries } from '@/src/hooks';
import type { HireEnquiry } from '@/src/api';
import {
  ArrowLeftIcon, BriefcaseIcon, CalendarIcon, CheckIcon,
  EllipsisIcon, MessageCircleIcon, BanknoteIcon, XIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLACEHOLDER_IMAGE } from '@/src/lib/placeholder';
import { LoadFailed } from '@/components/LoadFailed';
import { PersonSafetySheet } from '@/components/PersonSafetySheet';

for (const Icon of [
  ArrowLeftIcon, BriefcaseIcon, CalendarIcon, CheckIcon,
  EllipsisIcon, MessageCircleIcon, BanknoteIcon, XIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** "Sat 14 Nov" — a job date is a day, and the year is usually noise. */
function readableDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const thisYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    ...(thisYear ? {} : { year: 'numeric' }),
  });
}

/**
 * Hire enquiries, both directions.
 *
 * Accepting is the moment two strangers become collaborators, so it says so —
 * and drops you into the chat rather than leaving you to find it.
 */
export default function EnquiriesScreen() {
  const insets = useSafeAreaInsets();
  const { received, sent, isLoading, loadFailed, refetch } = useHireEnquiries();
  const [refreshing, setRefreshing] = useState(false);
  /** The received enquiry whose More menu is open. */
  const [safetyFor, setSafetyFor] = useState<HireEnquiry | null>(null);

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
        <Text className="text-foreground text-lg font-bold">Enquiries</Text>
      </View>

      {isLoading && received.length === 0 && sent.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#B66A40" />
        </View>
      ) : loadFailed && received.length === 0 && sent.length === 0 ? (
        <LoadFailed what="your enquiries" onRetry={() => refetch()} />
      ) : received.length === 0 && sent.length === 0 ? (
        <View className="flex-1 items-center justify-center px-10">
          <BriefcaseIcon size={30} className="text-muted-foreground" />
          <Text className="text-foreground text-[15px] font-bold mt-3">No enquiries yet</Text>
          <Text className="text-muted-foreground text-[13px] text-center mt-1.5 leading-5">
            Publish your profile so people who find you on virgo.ph can send you
            work. Enquiries you send land here too.
          </Text>
          <Pressable
            className="mt-5 rounded-xl px-5 py-3"
            style={{ backgroundColor: '#B66A40' }}
            onPress={() => router.push('/settings/public-profile')}
          >
            <Text className="text-white text-[13px] font-bold">Set up my public profile</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, gap: 20 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#B66A40" />
          }
        >
          {received.length > 0 && (
            <View className="gap-2.5">
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px]">
                Sent to you
              </Text>
              {received.map((enquiry) => (
                <EnquiryCard
                  key={enquiry.id}
                  enquiry={enquiry}
                  onMore={() => setSafetyFor(enquiry)}
                />
              ))}
            </View>
          )}

          {sent.length > 0 && (
            <View className="gap-2.5">
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px]">
                You sent
              </Text>
              {sent.map((enquiry) => (
                <EnquiryCard key={enquiry.id} enquiry={enquiry} />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* By enquiry: it names the sender and carries no account id. A block
          declines it if it was still waiting, and the refreshed list drops it. */}
      <PersonSafetySheet
        visible={!!safetyFor}
        onClose={() => setSafetyFor(null)}
        name={safetyFor?.personName ?? ''}
        target={safetyFor ? { enquiryId: safetyFor.id } : null}
        source="enquiries"
      />
    </SafeAreaView>
  );
}

function EnquiryCard({
  enquiry,
  onMore,
}: {
  enquiry: HireEnquiry;
  /** Report or block the sender. Offered on received enquiries only. */
  onMore?: () => void;
}) {
  const answer = useAnswerEnquiry();
  const [acting, setActing] = useState<'accept' | 'decline' | null>(null);

  const isIncoming = enquiry.direction === 'received';
  const waiting = enquiry.status === 'new';

  const respond = (accept: boolean) => {
    setActing(accept ? 'accept' : 'decline');
    answer.mutate(
      { id: enquiry.id, accept },
      {
        onSuccess: (result) => {
          if (accept && result.conversationId) {
            router.push(`/chat/${result.conversationId}`);
          }
        },
        onError: (error: Error) => Alert.alert('Could not respond', error.message),
        onSettled: () => setActing(null),
      },
    );
  };

  const statusColor =
    enquiry.status === 'accepted' ? '#10b981'
      : enquiry.status === 'declined' ? '#9ca3af'
        : '#B66A40';

  return (
    <View className="bg-card rounded-2xl p-4 gap-3">
      <View className="flex-row items-start gap-3">
        <RemoteImage
          source={{ uri: enquiry.personAvatarUrl ?? PLACEHOLDER_IMAGE }}
          style={{ width: 40, height: 40, borderRadius: 20 }}
        />
        <View className="flex-1 min-w-0">
          <Text className="text-foreground text-[14px] font-semibold" numberOfLines={1}>
            {enquiry.personName}
            <Text className="text-muted-foreground font-normal">
              {isIncoming ? ' wants to hire you' : ' — your enquiry'}
            </Text>
          </Text>
          <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1 mt-1">
            {enquiry.roleWanted && (
              <View className="flex-row items-center gap-1">
                <BriefcaseIcon size={11} className="text-muted-foreground" />
                <Text className="text-muted-foreground text-[11px]">{enquiry.roleWanted}</Text>
              </View>
            )}
            {enquiry.eventDate && (
              <View className="flex-row items-center gap-1">
                <CalendarIcon size={11} className="text-muted-foreground" />
                <Text className="text-muted-foreground text-[11px]">
                  {readableDate(enquiry.eventDate)}
                </Text>
              </View>
            )}
            {enquiry.budget && (
              <View className="flex-row items-center gap-1">
                <BanknoteIcon size={11} className="text-muted-foreground" />
                <Text className="text-muted-foreground text-[11px]">{enquiry.budget}</Text>
              </View>
            )}
          </View>
        </View>
        <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: `${statusColor}20` }}>
          <Text className="text-[10px] font-bold" style={{ color: statusColor }}>
            {enquiry.status === 'new' ? 'Waiting'
              : enquiry.status === 'accepted' ? 'Accepted' : 'Declined'}
          </Text>
        </View>
        {/* Only on what you received: an enquiry is a stranger's message in
            your inbox, and this is the way to say so or shut it out. */}
        {isIncoming && onMore && (
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`More options for ${enquiry.personName}`}
            onPress={onMore}
            className="py-1"
          >
            <EllipsisIcon size={16} className="text-muted-foreground" />
          </Pressable>
        )}
      </View>

      <View className="bg-background rounded-xl p-3">
        <Text className="text-foreground text-[13px] leading-5">{enquiry.message}</Text>
      </View>

      {isIncoming && waiting && (
        <View className="flex-row items-center gap-2">
          <Pressable
            className="rounded-xl px-4 py-2.5 flex-row items-center gap-1.5"
            style={{ backgroundColor: '#B66A40', opacity: answer.isPending ? 0.6 : 1 }}
            disabled={answer.isPending}
            onPress={() => respond(true)}
          >
            {acting === 'accept'
              ? <ActivityIndicator size="small" color="#fff" />
              : <CheckIcon size={14} color="#fff" />}
            <Text className="text-white text-[13px] font-bold">Accept</Text>
          </Pressable>
          <Pressable
            className="rounded-xl px-4 py-2.5 flex-row items-center gap-1.5"
            disabled={answer.isPending}
            onPress={() => respond(false)}
          >
            {acting === 'decline'
              ? <ActivityIndicator size="small" color="#9ca3af" />
              : <XIcon size={14} className="text-muted-foreground" />}
            <Text className="text-muted-foreground text-[13px] font-semibold">Decline</Text>
          </Pressable>
        </View>
      )}

      {enquiry.status === 'accepted' && enquiry.conversationId && (
        <Pressable
          className="flex-row items-center gap-1.5"
          onPress={() => router.push(`/chat/${enquiry.conversationId}`)}
        >
          <MessageCircleIcon size={13} color="#B66A40" />
          <Text className="text-[12px] font-semibold" style={{ color: '#B66A40' }}>
            Open chat
          </Text>
        </Pressable>
      )}

      {/* Declining is silent to the sender, so their own list is the only place
          it is ever reported. */}
      {!isIncoming && waiting && (
        <Text className="text-muted-foreground text-[11px]">
          Waiting for {enquiry.personName.split(' ')[0]} to answer.
        </Text>
      )}
    </View>
  );
}
