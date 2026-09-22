import {
  View, Text, ScrollView, Pressable, TextInput, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSendEnquiry } from '@/src/hooks';
import { profilesApi, queryKeys } from '@/src/api';
import {
  ArrowLeftIcon, MapPinIcon, SendIcon, UserSearchIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLACEHOLDER_IMAGE } from '@/src/lib/placeholder';

for (const Icon of [ArrowLeftIcon, MapPinIcon, SendIcon, UserSearchIcon]) {
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

  const profile = useQuery({
    queryKey: queryKeys.publicProfiles.detail(handle as string),
    queryFn: () => profilesApi.publicProfile(handle as string),
    enabled: Boolean(handle),
    retry: false,
  });

  const [message, setMessage] = useState('');
  const [roleWanted, setRoleWanted] = useState<string | null>(null);
  const [eventDate, setEventDate] = useState('');
  const [budget, setBudget] = useState('');

  if (profile.isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#B66A40" />
      </SafeAreaView>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-10">
        <UserSearchIcon size={30} className="text-muted-foreground" />
        <Text className="text-foreground text-[15px] font-bold mt-3">Profile not found</Text>
        <Text className="text-muted-foreground text-[13px] text-center mt-1.5 leading-5">
          This profile is private, or the handle has changed.
        </Text>
        <Pressable className="mt-5" onPress={() => router.back()}>
          <Text className="text-[13px] font-bold" style={{ color: '#B66A40' }}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const person = profile.data;
  const firstName = person.displayName.split(' ')[0];
  const tooShort = message.trim().length < 10;

  // The API takes YYYY-MM-DD; anything else is refused rather than silently
  // landing on the wrong day.
  const dateLooksRight = eventDate === '' || /^\d{4}-\d{2}-\d{2}$/.test(eventDate);

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
        onError: (error: Error) => Alert.alert('Could not send', error.message),
      },
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-3 px-5 py-3">
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeftIcon size={20} className="text-foreground" />
        </Pressable>
        <Text className="text-foreground text-lg font-bold">Send an enquiry</Text>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <ScrollView
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
                      className="rounded-full px-3.5 py-2"
                      style={{
                        backgroundColor: isOn ? '#B66A40' : 'transparent',
                        borderWidth: 1,
                        borderColor: isOn ? '#B66A40' : '#B66A4055',
                      }}
                    >
                      <Text
                        className="text-[12px] font-semibold"
                        style={{ color: isOn ? '#fff' : '#B66A40' }}
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
            <View className="flex-1 gap-2">
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px]">
                Date
              </Text>
              <TextInput
                value={eventDate}
                onChangeText={setEventDate}
                placeholder="2026-11-14"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={10}
                className="bg-card rounded-xl px-3.5 py-3 text-foreground text-sm"
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
                placeholderTextColor="#9ca3af"
                maxLength={60}
                className="bg-card rounded-xl px-3.5 py-3 text-foreground text-sm"
              />
            </View>
          </View>
          {!dateLooksRight && (
            <Text className="text-[11px] -mt-4" style={{ color: '#ef4444' }}>
              Use a date like 2026-11-14.
            </Text>
          )}

          <View className="gap-2">
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px]">
              The brief
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder={`Hi ${firstName} — tell them what the job is, where it is, and roughly how long you need them for.`}
              placeholderTextColor="#9ca3af"
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
            className="rounded-2xl py-4 flex-row items-center justify-center gap-2"
            style={{
              backgroundColor: '#B66A40',
              opacity: tooShort || !dateLooksRight || send.isPending ? 0.4 : 1,
            }}
            disabled={tooShort || !dateLooksRight || send.isPending}
            onPress={onSubmit}
          >
            {send.isPending
              ? <ActivityIndicator size="small" color="#fff" />
              : <SendIcon size={16} color="#fff" />}
            <Text className="text-white text-[15px] font-bold">Send enquiry</Text>
          </Pressable>

          <Text className="text-muted-foreground text-[11px] text-center">
            Accepting connects you both and opens a chat.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
