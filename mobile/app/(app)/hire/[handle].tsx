import {
  View, Text, ScrollView, Pressable, TextInput, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useHireEnquiries, usePublicProfile, useSendEnquiry, useTheme } from '@/src/hooks';
import {
  ArrowLeftIcon, ClockIcon, MapPinIcon, SendIcon, UserSearchIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLACEHOLDER_IMAGE } from '@/src/lib/placeholder';
import { LoadFailed } from '@/components/LoadFailed';
import { DateTimeField } from '@/components/DateTimeField';
import { dateToKey, parseDateKey } from '@/src/lib/calendar';
import { PALETTES } from '@/theme';

for (const Icon of [ArrowLeftIcon, ClockIcon, MapPinIcon, SendIcon, UserSearchIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * Sending a hire enquiry.
 *
 * Reached from Nearby and from a `virgo.ph/@handle` deep link. Sending needs an
 * account, which is why this lives inside the authenticated stack rather than
 * on the public page.
 */
export default function HireScreen() {
  const insets = useSafeAreaInsets();
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const send = useSendEnquiry();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;

  // The same query, and so the same cache entry, as the profile this is
  // opened from: arriving here from it costs no second fetch.
  const profile = usePublicProfile(handle);
  const hire = useHireEnquiries();
  // Asking again, after already asking about another job, is your call.
  const [askAgain, setAskAgain] = useState(false);

  const [message, setMessage] = useState('');
  const [roleWanted, setRoleWanted] = useState<string | null>(null);
  const [eventDate, setEventDate] = useState('');
  const [budget, setBudget] = useState('');

  if (profile.isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color={palette.primary} />
      </SafeAreaView>
    );
  }

  // A failed load is not a missing profile: saying "not found" to somebody
  // on a bad connection sends them away from a person who is right there.
  if (!profile.notFound && profile.loadFailed) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <View className="flex-row items-center gap-3 px-5 py-3">
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ArrowLeftIcon size={20} className="text-foreground" />
          </Pressable>
          <Text className="text-foreground text-lg font-bold">Send an enquiry</Text>
        </View>
        <LoadFailed what="this profile" onRetry={() => profile.refetch()} />
      </SafeAreaView>
    );
  }

  if (profile.notFound || !profile.profile) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-10">
        <UserSearchIcon size={30} className="text-muted-foreground" />
        <Text className="text-foreground text-[15px] font-bold mt-3">Profile not found</Text>
        <Text className="text-muted-foreground text-[13px] text-center mt-1.5 leading-5">
          This profile is private, or the handle has changed.
        </Text>
        <Pressable className="mt-5" onPress={() => router.back()}>
          <Text className="text-primary text-[13px] font-bold">Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const person = profile.profile;
  const firstName = person.displayName.split(' ')[0];
  const tooShort = message.trim().length < 10;
  /*
   * One you sent that they have not answered. The form never knew, so a
   * second tap on Hire — from Nearby, then from their profile — sent the same
   * person the same enquiry twice.
   */
  const waiting = hire.sent.find(
    (e) =>
      e.status === 'new' &&
      !!e.personHandle &&
      e.personHandle.toLowerCase() === String(handle).replace(/^@/, '').toLowerCase(),
  );


  const onSubmit = () => {
    send.mutate(
      {
        handle: handle as string,
        message: message.trim(),
        roleWanted: roleWanted ?? undefined,
        eventDate: eventDate || undefined,
        budget: budget.trim() || undefined,
      },
      {
        onSuccess: () => {
          Alert.alert(
            `Enquiry sent to ${firstName}`,
            'You will be connected as soon as they accept.',
          );
          router.replace('/friends/enquiries');
        },
        onError: (error: Error) => Alert.alert("Couldn't send it", error.message),
      },
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-1 px-2 py-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="w-11 h-11 items-center justify-center active:opacity-60"
        >
          <ArrowLeftIcon size={20} className="text-foreground" />
        </Pressable>
        <Text accessibilityRole="header" className="text-foreground text-lg font-bold">Send an enquiry</Text>
      </View>

      {waiting && !askAgain ? (
        <ScrollView keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, gap: 16 }}>
          <View className="flex-row items-center gap-3.5">
            <RemoteImage
              source={{ uri: person.avatarUrl ?? PLACEHOLDER_IMAGE }}
              style={{ width: 54, height: 54, borderRadius: 27 }}
            />
            <View className="flex-1 min-w-0">
              <Text className="text-foreground text-[17px] font-bold" numberOfLines={1}>
                {person.displayName}
              </Text>
              <Text className="text-muted-foreground text-[13px]" numberOfLines={1}>
                {person.title || person.roles.join(', ')}
              </Text>
            </View>
          </View>
          <View className="bg-card rounded-2xl p-4 gap-2">
            <View className="flex-row items-center gap-2">
              <ClockIcon size={16} className="text-primary" />
              <Text className="text-foreground text-[15px] font-bold flex-1">
                You’ve already asked {firstName}
              </Text>
            </View>
            <Text className="text-muted-foreground text-[13px] leading-5">
              Sent {new Date(waiting.createdAt).toLocaleDateString()}
              {waiting.roleWanted ? ` for ${waiting.roleWanted}` : ''}. They haven’t answered yet —
              you’ll hear when they do, and a chat opens if they accept.
            </Text>
            <Text className="text-foreground text-[13px] leading-5 mt-1" numberOfLines={4}>
              “{waiting.message}”
            </Text>
          </View>
          <Pressable
            onPress={() => router.replace('/friends/enquiries')}
            accessibilityRole="button"
            className="rounded-2xl min-h-[52px] items-center justify-center bg-action active:opacity-85"
          >
            <Text className="text-action-foreground text-[15px] font-bold">See your enquiries</Text>
          </Pressable>
          <Pressable
            onPress={() => setAskAgain(true)}
            accessibilityRole="button"
            className="min-h-[44px] items-center justify-center active:opacity-60"
          >
            <Text className="text-primary text-[14px] font-semibold">Ask about a different job</Text>
          </Pressable>
        </ScrollView>
      ) : (
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={8}
      >
        <ScrollView keyboardDismissMode="on-drag"
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, gap: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-row items-center gap-3.5">
            <RemoteImage
              source={{ uri: person.avatarUrl ?? PLACEHOLDER_IMAGE }}
              style={{ width: 54, height: 54, borderRadius: 27 }}
            />
            <View className="flex-1 min-w-0">
              <Text className="text-foreground text-[17px] font-bold" numberOfLines={1}>
                {person.displayName}
              </Text>
              <Text className="text-muted-foreground text-[13px]" numberOfLines={1}>
                {person.title || person.roles.join(', ')}
              </Text>
              {person.location && (
                <View className="flex-row items-center gap-1 mt-0.5">
                  <MapPinIcon size={11} className="text-muted-foreground" />
                  <Text className="text-muted-foreground text-[11px]">{person.location}</Text>
                </View>
              )}
            </View>
          </View>

          {person.roles.length > 0 && (
            <View className="gap-2">
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px]">
                What do you need?
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {person.roles.map((role) => {
                  const isOn = roleWanted === role;
                  return (
                    <Pressable
                      key={role}
                      onPress={() => setRoleWanted(isOn ? null : role)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isOn, checked: isOn }}
                      className={`rounded-full px-4 min-h-[44px] justify-center border ${
                        isOn ? 'bg-primary border-primary' : 'border-primary/30'
                      }`}
                    >
                      <Text
                        className={`text-[12px] font-semibold ${
                          isOn ? 'text-primary-foreground' : 'text-primary'
                        }`}
                      >
                        {role}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <View className="flex-row gap-3">
            {/* The picker, not typed text: an impossible date reached the
                server as a 500, and one already gone by was accepted. */}
            <View className="flex-1">
              <DateTimeField
                label="Date"
                mode="date"
                value={eventDate ? parseDateKey(eventDate) : null}
                minimumDate={new Date()}
                emptyLabel="Optional"
                clearable
                onChange={(picked) => setEventDate(picked ? dateToKey(picked) : '')}
              />
            </View>
            <View className="flex-1 gap-2">
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px]">
                Budget
              </Text>
              <TextInput
                value={budget}
                onChangeText={setBudget}
                placeholder="₱25,000"
                placeholderTextColor={palette.mutedForeground}
                maxLength={60}
                className="bg-card rounded-xl px-3.5 py-3 text-foreground text-sm"
              />
            </View>
          </View>
          <View className="gap-2">
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px]">
              The brief
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder={`Hi ${firstName} — tell them what the job is, where it is, and roughly how long you need them for.`}
              placeholderTextColor={palette.mutedForeground}
              multiline
              numberOfLines={6}
              maxLength={2000}
              textAlignVertical="top"
              className="bg-card rounded-xl px-3.5 py-3 text-foreground text-sm"
              style={{ minHeight: 130 }}
            />
            <Text className="text-muted-foreground text-[11px]">
              {tooShort
                ? 'A sentence or two at least — a blank enquiry rarely gets a reply.'
                : `${message.length} / 2000`}
            </Text>
          </View>

          <Pressable
            className="rounded-2xl min-h-[52px] flex-row items-center justify-center gap-2 bg-action"
            style={{
              opacity: tooShort || send.isPending ? 0.45 : 1,
            }}
            disabled={tooShort || send.isPending}
            accessibilityRole="button"
            accessibilityState={{ disabled: tooShort || send.isPending, busy: send.isPending }}
            onPress={onSubmit}
          >
            {send.isPending
              ? <ActivityIndicator size="small" color={palette.actionForeground} />
              : <SendIcon size={16} className="text-action-foreground" />}
            <Text className="text-action-foreground text-[15px] font-bold">Send enquiry</Text>
          </Pressable>

          <Text className="text-muted-foreground text-[12px] text-center">
            Accepting connects you both and opens a chat.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
