import {
  View, Text, Alert, Share,
  ActivityIndicator, } from 'react-native';
import { KeyboardFrame, KeyboardScroll } from '@/components/KeyboardForm';
import { KEYBOARD_DONE } from '@/components/KeyboardDoneBar';
import { PALETTES } from '@/theme';
import { InsetFrame } from '@/components/InsetFrame';
import { router, useLocalSearchParams } from 'expo-router';
import { useDiscardGuard } from '@/src/lib/discard-guard';
import { useEffect, useRef, useState } from 'react';
import { useCreateJob, useJob, useRoles, useTheme, useUpdateJob } from '@/src/hooks';
import { DetailFallback } from '@/components/DetailFallback';
import { FormHeader } from '@/components/FormHeader';
import {
  JOB_TITLE_MIN,
  MAX_ROLE_BUDGET_MINOR,
  jobPostBlockers,
  joinBlockers,
} from '@/src/lib/job-form';
import { DateTimeField } from '@/components/DateTimeField';
import { LoadFailed } from '@/components/LoadFailed';
import { LocationField } from '@/components/LocationField';
import {
  ChoiceChip, ChoiceChips, FormCard, FormField, FormFooter, FormHint, FormInput, FormLabel, FormSection,
} from '@/components/Form';
import { useHoldUpdates } from '@/src/lib/ota-updates';

/** Local parts — toISOString would shift the day west of Greenwich. */
function toIsoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** Pesos in the form, centavos on the wire. */
function toCentavos(value: string): number | undefined {
  const pesos = Number(value.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(pesos) || pesos <= 0) return undefined;
  return Math.round(pesos * 100);
}

export default function NewJobScreen() {
  // A code fetched from email, or a form half filled: see useHoldUpdates.
  useHoldUpdates();
  const create = useCreateJob();
  /*
   * Editing, when opened with ?edit=<slug>.
   *
   * A post could not be edited at all: a typo in the title, a wrong date or a
   * budget that needed moving meant deleting it — and deleting took every
   * application with it. The same form, filled from the post, saves over it.
   */
  const { edit: editSlug } = useLocalSearchParams<{ edit?: string }>();
  const editing = useJob(editSlug);
  const update = useUpdateJob();
  const isEdit = Boolean(editSlug);
  const {
    roles: allRoles,
    isLoading: rolesLoading,
    loadFailed: rolesFailed,
    refetch: refetchRoles,
  } = useRoles();

  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rolesWanted, setRolesWanted] = useState<string[]>([]);
  const [eventDate, setEventDate] = useState('');
  const [location, setLocation] = useState('');
  /*
   * A budget per role, kept as typed text and converted on submit.
   *
   * Keyed by role rather than held as a list, so deselecting a role and
   * picking it again does not lose what was already typed — and a role left
   * deselected is never read, since only `rolesWanted` is iterated.
   */
  const [roleBudgets, setRoleBudgets] = useState<
    Record<string, { min: string; max: string }>
  >({});

  // Filled once, from the post as it arrived; after that the form is theirs.
  const filled = useRef(false);
  useEffect(() => {
    const post = editing.data;
    if (!post || filled.current) return;
    filled.current = true;
    setTitle(post.title);
    setDescription(post.description);
    setRolesWanted(post.rolesWanted);
    setEventDate(post.eventDate ?? '');
    setLocation(post.location ?? '');
    const pesos = (minor?: number | null) => (minor == null ? '' : String(minor / 100));
    setRoleBudgets(
      Object.fromEntries(
        Object.entries(post.roleBudgets ?? {}).map(([role, range]) => [
          role,
          { min: pesos(range?.min), max: pesos(range?.max) },
        ]),
      ),
    );
  }, [editing.data]);

  // Asks before a half-written post is closed (X, back, swipe).
  const { allowLeave } = useDiscardGuard(
    { title, description, rolesWanted, eventDate, location, roleBudgets },
    !isEdit || filled.current,
  );

  const setRoleBudget = (role: string, end: 'min' | 'max', value: string) =>
    setRoleBudgets((current) => ({
      ...current,
      [role]: { ...(current[role] ?? { min: '', max: '' }), [end]: value },
    }));

  const pair = (role: string) => ({
    min: toCentavos(roleBudgets[role]?.min ?? ''),
    max: toCentavos(roleBudgets[role]?.max ?? ''),
  });

  const budgetBackwards = rolesWanted.some((role) => {
    const { min, max } = pair(role);
    return min != null && max != null && min > max;
  });
  // Said while typing, not on submit.
  const budgetTooHigh = rolesWanted.some((role) => {
    const { min, max } = pair(role);
    return (min ?? 0) > MAX_ROLE_BUDGET_MINOR || (max ?? 0) > MAX_ROLE_BUDGET_MINOR;
  });
  // Always well-formed now: the value only ever comes from the picker.
  const dateLooksRight = true;

  const blockers = jobPostBlockers({
    title,
    description,
    rolesWanted,
    budgetBackwards,
    budgetTooHigh,
    dateLooksRight,
  });
  const ready = blockers.length === 0;
  // Said once something has been typed, never at an empty field.
  const titleShort = title.trim().length > 0 && title.trim().length < JOB_TITLE_MIN;
  const saving = create.isPending || update.isPending;

  const submit = () => {
    const budgets: Record<string, { min?: number; max?: number }> = {};
    for (const role of rolesWanted) {
      const { min, max } = pair(role);
      if (min == null && max == null) continue;
      budgets[role] = {};
      if (min != null) budgets[role].min = min;
      if (max != null) budgets[role].max = max;
    }

    if (isEdit && editing.data) {
      update.mutate(
        {
          id: editing.data.id,
          title: title.trim(),
          description: description.trim(),
          rolesWanted,
          // Sent whole: a role left without figures is one the poster cleared.
          roleBudgets: budgets,
          eventDate: eventDate || null,
          location: location.trim() || null,
        },
        {
          onSuccess: () => {
            allowLeave();
            router.back();
          },
          onError: (error: Error) => Alert.alert("Couldn't save it", error.message),
        },
      );
      return;
    }

    create.mutate(
      {
        title: title.trim(),
        description: description.trim(),
        rolesWanted,
        roleBudgets: budgets,
        eventDate: eventDate || undefined,
        location: location.trim() || undefined,
      },
      {
        // Onto the post itself, which is what people will see — not a second
        // copy of the Jobs tab — with the one thing worth doing next.
        onSuccess: (post) => {
          allowLeave();
          router.replace(`/jobs/${post.slug}`);
          Alert.alert('Your job is live', 'People who do this work can find it now. Share it to reach more of them.', [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Share',
              onPress: () =>
                void Share.share({ message: `${post.title} — https://virgo.ph/jobs/${post.slug}` })
                  .catch(() => undefined),
            },
          ]);
        },
        onError: (error: Error) => Alert.alert("Couldn't post it", error.message),
      },
    );
  };

  if (isEdit && !editing.data) {
    return (
      <DetailFallback
        title="Edit job"
        what="this post"
        gone="It was deleted, or it has ended."
        error={editing.error}
        failed={editing.isError || editing.isPaused}
        onRetry={() => void editing.refetch()}
      />
    );
  }

  return (
    <InsetFrame edges={['top']}>
      <FormHeader title={isEdit ? 'Edit job' : 'Post a job'} />

      <KeyboardFrame>
        <KeyboardScroll
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <FormField
            label="What do you need?"
            wrong={titleShort}
            hint={
              titleShort
                ? `A little longer: ${JOB_TITLE_MIN - title.trim().length} more character${
                    JOB_TITLE_MIN - title.trim().length === 1 ? '' : 's'
                  }. Say the role, the place and roughly when.`
                : 'The line people scan on the board. Say the role, the place and roughly when.'
            }
          >
            <FormInput
              value={title}
              onChangeText={setTitle}
              placeholder="Wedding photographer, Cebu, December"
              maxLength={120}
              wrong={titleShort}
            />
          </FormField>

          <FormField
            label="Who are you hiring?"
            hint="Pick more than one if the event needs a team. It shows up in each of their searches."
          >
            {/* Without the list there is nothing to pick, and a post needs a
                role — the form was a dead end with no way to try again. */}
            {rolesFailed && allRoles.length === 0 ? (
              <LoadFailed what="the list of roles" onRetry={() => void refetchRoles()} compact />
            ) : rolesLoading && allRoles.length === 0 ? (
              <ActivityIndicator color={palette.primary} style={{ paddingVertical: 12 }} />
            ) : null}
            <ChoiceChips>
              {allRoles.map((role) => {
                const on = rolesWanted.includes(role);
                return (
                  <ChoiceChip
                    key={role}
                    multiple
                    label={role}
                    selected={on}
                    onPress={() =>
                      setRolesWanted((current) => (on ? current.filter((r) => r !== role) : [...current, role]))
                    }
                  />
                );
              })}
            </ChoiceChips>
          </FormField>

          {/* The native picker, not a typed string. The date is optional —
              a post runs 30 days without one — so the field can be cleared. */}
          <FormSection title="When and where">
            <FormCard>
              <DateTimeField
                row
                first
                label="Date of the job"
                mode="date"
                value={eventDate ? new Date(`${eventDate}T12:00:00`) : null}
                minimumDate={new Date()}
                emptyLabel="Any day"
                clearable
                onChange={(next) => setEventDate(next ? toIsoDay(next) : '')}
              />
            </FormCard>
            <LocationField form value={location} onChange={setLocation} placeholder="Where: Cebu City, or the venue" />
          </FormSection>

          {/*
            A budget per role, not one for the post.

            A wedding wanting a photographer, a videographer and an HMUA pays
            three different rates, and a single range across all three tells
            each of them nothing. It also decided what an accepted applicant's
            booking opened at, so an HMUA was booked at the videographer's
            ceiling.
          */}
          {rolesWanted.length > 0 && (
            <FormSection title="What each role pays">
              {rolesWanted.map((role) => (
                <View key={role} className="gap-2">
                  <FormLabel optional>{role}</FormLabel>
                  <View className="flex-row items-center gap-2.5">
                    <View className="flex-1">
                      <FormInput
                        value={roleBudgets[role]?.min ?? ''}
                        onChangeText={(v) => setRoleBudget(role, 'min', v)}
                        placeholder="30,000"
                        keyboardType="numeric"
                        inputAccessoryViewID={KEYBOARD_DONE}
                        accessibilityLabel={`${role}, from, in pesos`}
                        wrong={budgetBackwards || budgetTooHigh}
                        lead={<Text className="text-muted-foreground text-[16px]">₱</Text>}
                      />
                    </View>
                    <Text className="text-muted-foreground text-[14px]">to</Text>
                    <View className="flex-1">
                      <FormInput
                        value={roleBudgets[role]?.max ?? ''}
                        onChangeText={(v) => setRoleBudget(role, 'max', v)}
                        placeholder="45,000"
                        keyboardType="numeric"
                        inputAccessoryViewID={KEYBOARD_DONE}
                        accessibilityLabel={`${role}, up to, in pesos`}
                        wrong={budgetBackwards || budgetTooHigh}
                        lead={<Text className="text-muted-foreground text-[16px]">₱</Text>}
                      />
                    </View>
                  </View>
                </View>
              ))}
              <FormHint wrong={budgetBackwards || budgetTooHigh}>
                {budgetBackwards
                  ? 'The lower figure needs to be the smaller one.'
                  : budgetTooHigh
                    ? 'Each role can be up to ₱500,000.'
                    : 'A role with a number gets far better applications.'}
              </FormHint>
            </FormSection>
          )}

          <FormField
            label="The brief"
            hint={
              description.trim().length < 30
                ? 'A few sentences at least. People are deciding whether to spend their day on this.'
                : `${description.length} / 4000`
            }
          >
            <FormInput
              value={description}
              onChangeText={setDescription}
              placeholder="What the day looks like, how many hours, what you need delivered and by when."
              multiline
              minHeight={150}
              maxLength={4000}
            />
          </FormField>

          {/* Said "the public board at virgo.ph/jobs" while the board
              answers 401 without a session. */}
          <FormHint>
            Everyone on Virgo sees this on the job board. It is not visible outside the app, and it runs for 30 days
            or until the job date passes.
          </FormHint>
        </KeyboardScroll>

        <FormFooter
          label={isEdit ? 'Save changes' : 'Post the job'}
          onPress={submit}
          disabled={!ready}
          busy={saving}
          note={ready ? undefined : `Still needs ${joinBlockers(blockers)}.`}
        />
      </KeyboardFrame>
    </InsetFrame>
  );
}
