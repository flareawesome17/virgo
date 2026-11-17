import {
  View, Text, ScrollView, Pressable, TextInput, Alert,
  ActivityIndicator, } from 'react-native';
import { KeyboardFrame, KeyboardScroll } from '@/components/KeyboardForm';
import { RemoteImage } from '@/components/RemoteImage';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { hireDrafts } from '@/src/lib/hire-draft';
import { useHireEnquiries, usePublicProfile, useSendEnquiry, useTheme } from '@/src/hooks';
import { UserSearchIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLACEHOLDER_IMAGE } from '@/src/lib/placeholder';
import { LoadFailed } from '@/components/LoadFailed';
import { DateTimeField } from '@/components/DateTimeField';
import {
  ChoiceChip,
  ChoiceChips,
  FormCard,
  FormField,
  FormFooter,
  FormHint,
  FormInput,
  FormLabel,
  usePlaceholderColor,
} from '@/components/Form';
import { FormHeader } from '@/components/FormHeader';
import { InsetFrame } from '@/components/InsetFrame';
import { goBackOr } from '@/components/ScreenHeader';
import { dateToKey, parseDateKey } from '@/src/lib/calendar';
import { PALETTES } from '@/theme';

cssInterop(UserSearchIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/** "a photographer", "an editor". */
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

/**
 * Who the enquiry is going to, at the top of the form and of the "already
 * asked" page alike.
 */
function PersonCard({
  avatarUrl,
  name,
  about,
}: {
  avatarUrl: string | null | undefined;
  name: string;
  /** Their title or roles, then where they are. */
  about: string;
}) {
  return (
    <View className="flex-row items-center gap-3 p-3 rounded-[20px] border border-border/40 bg-card">
      <RemoteImage
        source={{ uri: avatarUrl ?? PLACEHOLDER_IMAGE }}
        style={{ width: 48, height: 48, borderRadius: 24 }}
      />
      <View className="flex-1 min-w-0">
        <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={1}>
          {name}
        </Text>
        {about ? (
          <Text className="text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
            {about}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Sending a hire enquiry.
 *
 * Reached from a post's Hire, from Nearby and from a `virgo.ph/@handle` deep
 * link. Sending needs an account, which is why this lives inside the
 * authenticated stack rather than on the public page.
 */
export default function HireScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const send = useSendEnquiry();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const placeholder = usePlaceholderColor();

  // The same query, and so the same cache entry, as the profile this is
  // opened from: arriving here from it costs no second fetch.
  const profile = usePublicProfile(handle);
  const hire = useHireEnquiries();
  // Asking again, after already asking about another job, is your call.
  const [askAgain, setAskAgain] = useState(false);

  // What was written last time, if its send did not go through.
  const [draft] = useState(() => hireDrafts.get(handle));
  const [message, setMessage] = useState(draft?.message ?? '');
  const [roleWanted, setRoleWanted] = useState<string | null>(draft?.roleWanted ?? null);
  const [eventDate, setEventDate] = useState(draft?.eventDate ?? '');
  const [budget, setBudget] = useState(draft?.budget ?? '');

  if (profile.isLoading) {
    return (
      <InsetFrame edges={['top']}>
        <FormHeader title="Send an enquiry" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={palette.primary} />
        </View>
      </InsetFrame>
    );
  }

  // A failed load is not a missing profile: saying "not found" to somebody
  // on a bad connection sends them away from a person who is right there.
  if (!profile.notFound && profile.loadFailed) {
    return (
      <InsetFrame edges={['top']}>
        <FormHeader title="Send an enquiry" />
        <LoadFailed what="this profile" onRetry={() => profile.refetch()} />
      </InsetFrame>
    );
  }

  if (profile.notFound || !profile.profile) {
    return (
      <InsetFrame edges={['top']}>
        <FormHeader title="Send an enquiry" />
        <View className="flex-1 items-center justify-center px-10">
          <UserSearchIcon size={30} className="text-muted-foreground" />
          <Text className="text-foreground text-[17px] leading-6 font-bold mt-3">Profile not found</Text>
          <Text className="text-muted-foreground text-[15px] leading-[22px] text-center mt-1.5">
            This profile is private, or the handle has changed.
          </Text>
          <Pressable
            onPress={() => goBackOr()}
            accessibilityRole="button"
            className="mt-5 h-11 px-5 rounded-[14px] bg-secondary items-center justify-center active:opacity-70"
          >
            <Text className="text-foreground text-[15px] font-semibold">Go back</Text>
          </Pressable>
        </View>
      </InsetFrame>
    );
  }

  const person = profile.profile;
  const firstName = person.displayName.split(' ')[0];
  const about = [person.title || person.roles.join(', '), person.location].filter(Boolean).join(' · ');
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

  /*
   * Sent on the tap. The enquiry is in your sent list at once and this form
   * gives way to that list; it used to sit with a spinner until the server
   * answered, then put up an alert to say what the list already shows.
   *
   * The brief is kept until the server has it. If the send fails, the enquiry
   * leaves the list again, and the way back to this form has everything that
   * was written still in it.
   *
   * The promise, not mutate's own callbacks: this screen is gone by the time
   * the server answers, and those are dropped with the component.
   */
  const onSubmit = () => {
    const to = String(handle);
    hireDrafts.keep(to, { message, roleWanted, eventDate, budget });
    send
      .mutateAsync({
        handle: to,
        message: message.trim(),
        roleWanted: roleWanted ?? undefined,
        eventDate: eventDate || undefined,
        budget: budget.trim() || undefined,
        to: { name: person.displayName, avatarUrl: person.avatarUrl },
      })
      .then(() => hireDrafts.clear(to))
      .catch((error: unknown) =>
        Alert.alert(
          `Your enquiry to ${firstName} was not sent`,
          `${error instanceof Error && error.message ? error.message : 'Check your connection.'} What you wrote has been kept.`,
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open it again', onPress: () => router.push(`/hire/${to}`) },
          ],
        ),
      );
    router.replace('/friends/enquiries');
  };

  if (waiting && !askAgain) {
    return (
      <InsetFrame edges={['top']}>
        <FormHeader title="Send an enquiry" />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}
        >
          <PersonCard avatarUrl={person.avatarUrl} name={person.displayName} about={about} />

          {/* The one dark card on the page: it is the answer to "did it send?". */}
          <View className="rounded-[20px] bg-foreground p-4 gap-1.5">
            <Text className="text-background text-[13px] leading-[18px] font-semibold" style={{ opacity: 0.7 }}>
              Sent{' '}
              {new Date(waiting.createdAt).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
              {waiting.roleWanted ? `, for ${article(waiting.roleWanted)} ${waiting.roleWanted}` : ''}
            </Text>
            <Text className="text-background text-[17px] leading-6 font-bold tracking-[-0.2px]">
              You’ve already asked {firstName}
            </Text>
            <Text className="text-background text-[15px] leading-[22px]" style={{ opacity: 0.9 }}>
              They haven’t answered yet. You’ll hear when they do, and a chat opens if they accept.
            </Text>
          </View>

          <View className="rounded-2xl bg-muted p-3.5 gap-1">
            <Text className="text-muted-foreground text-[13px] leading-[18px] font-semibold">
              What you sent
            </Text>
            <Text
              className="text-secondary-foreground text-[15px] leading-[22px] italic"
              numberOfLines={4}
            >
              {waiting.message}
            </Text>
          </View>

          <View className="gap-2 mt-1">
            <Pressable
              onPress={() => router.replace('/friends/enquiries')}
              accessibilityRole="button"
              className="h-11 rounded-[14px] items-center justify-center bg-action active:opacity-85"
            >
              <Text className="text-action-foreground text-[15px] font-semibold">See your enquiries</Text>
            </Pressable>
            <Pressable
              onPress={() => setAskAgain(true)}
              accessibilityRole="button"
              className="h-11 rounded-[14px] items-center justify-center bg-muted active:opacity-70"
            >
              <Text className="text-foreground text-[15px] font-semibold">Ask about a different job</Text>
            </Pressable>
          </View>
        </ScrollView>
      </InsetFrame>
    );
  }

  return (
    <InsetFrame edges={['top']}>
      <FormHeader title="Send an enquiry" />
      <KeyboardFrame>
        <KeyboardScroll
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          className="flex-1"
          contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 24 }}
        >
          <PersonCard avatarUrl={person.avatarUrl} name={person.displayName} about={about} />

          {person.roles.length > 0 && (
            <FormField label="What do you need?">
              <ChoiceChips>
                {person.roles.map((role) => {
                  const isOn = roleWanted === role;
                  return (
                    <ChoiceChip
                      key={role}
                      label={role}
                      selected={isOn}
                      // A second tap takes it back: naming a role is optional.
                      onPress={() => setRoleWanted(isOn ? null : role)}
                    />
                  );
                })}
              </ChoiceChips>
            </FormField>
          )}

          <FormCard>
            {/* The picker, not typed text: an impossible date reached the
                server as a 500, and one already gone by was accepted. */}
            <DateTimeField
              row
              first
              label="When"
              mode="date"
              value={eventDate ? parseDateKey(eventDate) : null}
              minimumDate={new Date()}
              emptyLabel="Optional"
              clearable
              onChange={(picked) => setEventDate(picked ? dateToKey(picked) : '')}
            />
            <View className="min-h-[52px] flex-row items-center gap-3 px-4 border-t border-border/40">
              <Text className="w-[19px] text-center text-muted-foreground text-[16px] font-semibold">₱</Text>
              <Text className="text-foreground text-[15px] font-medium">Budget</Text>
              <TextInput
                value={budget}
                onChangeText={setBudget}
                placeholder="25,000"
                placeholderTextColor={placeholder}
                maxLength={60}
                returnKeyType="done"
                accessibilityLabel="Budget in pesos, optional"
                className="flex-1 min-w-0 text-right text-foreground text-[15px] font-semibold"
                style={{ minHeight: 50, paddingVertical: 0 }}
              />
            </View>
          </FormCard>

          <View className="gap-2">
            <View className="flex-row items-baseline justify-between">
              <FormLabel>The brief</FormLabel>
              {!tooShort ? (
                <Text className="text-muted-foreground text-[12px] leading-4">
                  {message.length.toLocaleString('en-US')} of 2,000
                </Text>
              ) : null}
            </View>
            <FormInput
              value={message}
              onChangeText={setMessage}
              placeholder={`Hi ${firstName} — tell them what the job is, where it is, and roughly how long you need them for.`}
              multiline
              minHeight={118}
              maxLength={2000}
              accessibilityLabel="The brief"
            />
            {tooShort ? (
              <FormHint>A sentence or two at least — a blank enquiry rarely gets a reply.</FormHint>
            ) : null}
          </View>
        </KeyboardScroll>

        <FormFooter
          label="Send enquiry"
          onPress={onSubmit}
          disabled={tooShort}
          busy={send.isPending}
          note="Accepting connects you both and opens a chat"
        />
      </KeyboardFrame>
    </InsetFrame>
  );
}
