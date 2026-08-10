import {
  View, Text, ScrollView, Pressable, TextInput, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState } from 'react';
import { useCreateJob, useRoles } from '@/src/hooks';
import { ArrowLeftIcon, SendIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  JOB_TITLE_MIN,
  jobPostBlockers,
  joinBlockers,
} from '@/src/lib/job-form';
import { DateTimeField } from '@/components/DateTimeField';
import { LocationField } from '@/components/LocationField';

/** Local parts — toISOString would shift the day west of Greenwich. */
function toIsoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(SendIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/** Pesos in the form, centavos on the wire. */
function toCentavos(value: string): number | undefined {
  const pesos = Number(value.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(pesos) || pesos <= 0) return undefined;
  return Math.round(pesos * 100);
}

export default function NewJobScreen() {
  const insets = useSafeAreaInsets();
  const create = useCreateJob();
  const { roles: allRoles } = useRoles();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rolesWanted, setRolesWanted] = useState<string[]>([]);
  const [eventDate, setEventDate] = useState('');
  const [location, setLocation] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');

  const min = toCentavos(budgetMin);
  const max = toCentavos(budgetMax);
  const budgetBackwards = min != null && max != null && min > max;
  // Always well-formed now: the value only ever comes from the picker.
  const dateLooksRight = true;

  const blockers = jobPostBlockers({
    title,
    description,
    rolesWanted,
    budgetBackwards,
    dateLooksRight,
  });
  const ready = blockers.length === 0;

  const submit = () => {
    create.mutate(
      {
        title: title.trim(),
        description: description.trim(),
        rolesWanted,
        eventDate: eventDate || undefined,
        location: location.trim() || undefined,
        budgetMin: min,
        budgetMax: max,
      },
      {
        onSuccess: () => {
          Alert.alert('Your job is live', 'People who do this work can find it now.');
          router.replace('/jobs/mine');
        },
        onError: (error: Error) => Alert.alert('Could not post', error.message),
      },
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-3 px-5 py-3">
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeftIcon size={20} className="text-foreground" />
        </Pressable>
        <Text className="text-foreground text-lg font-bold">Post a job</Text>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, gap: 18 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-muted-foreground text-[12px] leading-5 -mb-2">
            {/* Said "the public board at virgo.ph/jobs" while the board
                answers 401 without a session. */}
            Everyone on Virgo sees this on the job board, so anyone looking for
            this kind of work can find it. It is not visible outside the app.
          </Text>

          <Field label="What do you need?">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Wedding photographer for a December wedding in Cebu"
              placeholderTextColor="#9ca3af"
              maxLength={120}
              className="bg-card rounded-xl px-3.5 py-3 text-foreground text-sm"
            />
            <Hint>
              {title.trim().length > 0 && title.trim().length < JOB_TITLE_MIN
                ? `A little longer — ${JOB_TITLE_MIN - title.trim().length} more character${
                    JOB_TITLE_MIN - title.trim().length === 1 ? '' : 's'
                  }. Say the role, the place and roughly when.`
                : 'This is the line people scan on the board. Say the role, the place and roughly when.'}
            </Hint>
          </Field>

          <Field label="Which roles are you hiring for?">
            <View className="flex-row flex-wrap gap-2">
              {allRoles.map((role) => {
                const on = rolesWanted.includes(role);
                return (
                  <Pressable
                    key={role}
                    onPress={() =>
                      setRolesWanted((current) =>
                        on ? current.filter((r) => r !== role) : [...current, role],
                      )
                    }
                    className="rounded-full px-3.5 py-2"
                    style={{
                      backgroundColor: on ? '#B66A40' : 'transparent',
                      borderWidth: 1,
                      borderColor: on ? '#B66A40' : '#B66A4055',
                    }}
                  >
                    <Text className="text-[12px] font-semibold"
                      style={{ color: on ? '#fff' : '#B66A40' }}>
                      {role}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Hint>
              Pick more than one if the event needs a team — it shows up in each
              of their searches.
            </Hint>
          </Field>

          {/* The native picker, not a typed string. The date is optional —
              a post runs 30 days without one — so the field can be cleared. */}
          <DateTimeField
            label="Date of the job"
            mode="date"
            value={eventDate ? new Date(`${eventDate}T12:00:00`) : null}
            minimumDate={new Date()}
            emptyLabel="Pick a date (optional)"
            clearable
            onChange={(next) => setEventDate(next ? toIsoDay(next) : '')}
          />

          <Field label="Where">
            <LocationField value={location} onChange={setLocation} />
          </Field>

          <View className="flex-row gap-3">
            <Field label="Budget from (₱)" className="flex-1">
              <TextInput
                value={budgetMin}
                onChangeText={setBudgetMin}
                placeholder="30,000"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                className="bg-card rounded-xl px-3.5 py-3 text-foreground text-sm"
              />
            </Field>
            <Field label="up to (₱)" className="flex-1">
              <TextInput
                value={budgetMax}
                onChangeText={setBudgetMax}
                placeholder="45,000"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                className="bg-card rounded-xl px-3.5 py-3 text-foreground text-sm"
              />
            </Field>
          </View>
          <Text className="text-[11px] -mt-4"
            style={{ color: budgetBackwards ? '#ef4444' : '#9ca3af' }}>
            {budgetBackwards
              ? 'The lower figure needs to be the smaller one.'
              : 'Optional, but a post with a number gets far better applications.'}
          </Text>

          <Field label="The brief">
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What the day looks like, how many hours, what you need delivered and by when. The more specific this is, the fewer wrong applications you get."
              placeholderTextColor="#9ca3af"
              multiline
              maxLength={4000}
              textAlignVertical="top"
              className="bg-card rounded-xl px-3.5 py-3 text-foreground text-sm"
              style={{ minHeight: 150 }}
            />
            <Hint>
              {description.trim().length < 30
                ? 'A few sentences at least — people are deciding whether to spend their day on this.'
                : `${description.length} / 4000`}
            </Hint>
          </Field>

          <Pressable
            className="rounded-2xl py-4 flex-row items-center justify-center gap-2"
            style={{ backgroundColor: '#B66A40', opacity: !ready || create.isPending ? 0.4 : 1 }}
            disabled={!ready || create.isPending}
            onPress={submit}
          >
            {create.isPending
              ? <ActivityIndicator size="small" color="#fff" />
              : <SendIcon size={16} style={{ color: '#fff' }} />}
            <Text className="text-white text-[15px] font-bold">Post it</Text>
          </Pressable>

          <Text className="text-muted-foreground text-[11px] text-center">
            {ready
              ? 'Posts run for 30 days, or until the job date passes.'
              : `Still needs ${joinBlockers(blockers)}.`}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label, children, className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={`gap-2 ${className ?? ''}`}>
      <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px]">
        {label}
      </Text>
      {children}
    </View>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-muted-foreground text-[11px] leading-4">{children}</Text>
  );
}
