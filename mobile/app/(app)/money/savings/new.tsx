import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { KeyboardFrame, KeyboardScroll } from '@/components/KeyboardForm';
import { router, useLocalSearchParams } from 'expo-router';
import { Trash2Icon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  ApiError,
  SAVING_ICONS,
  isoDay,
  minorToPesos,
  pesosToMinor,
  type SavingIcon,
} from '@/src/api';
import {
  useCreateMoneySaving,
  useDeleteMoneySaving,
  useMoneySaving,
  useUpdateMoneySaving,
} from '@/src/hooks';
import { DateTimeField } from '@/components';
import {
  ChoiceChip,
  ChoiceChips,
  FormCard,
  FormField,
  FormFooter,
  FormInput,
} from '@/components/Form';
import { FormHeader } from '@/components/FormHeader';
import { InsetFrame } from '@/components/InsetFrame';
import { KEYBOARD_DONE } from '@/components/KeyboardDoneBar';
import { SAVING_STARTS, savingGlyph } from '@/components/money/SavingBits';
import { useDiscardGuard } from '@/src/lib/discard-guard';

cssInterop(Trash2Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
for (const icon of SAVING_ICONS) {
  cssInterop(savingGlyph(icon), { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const ICON_NAMES: Record<SavingIcon, string> = {
  gear: 'Gear',
  tax: 'Tax',
  safety: 'Safety net',
  slow: 'Slow months',
  trip: 'A trip',
  home: 'Home',
  family: 'Family',
  other: 'Something else',
};

/** "2027-03-31" as a local date, without passing through UTC. */
function dateOf(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function problem(error: unknown): string {
  return error instanceof ApiError && error.status !== 0 ? error.message : 'Check your connection and try again.';
}

const Peso = () => <Text className="text-muted-foreground text-[16px] font-semibold">₱</Text>;

/**
 * A new saving, or one being changed (`?edit=<id>`).
 *
 * Only the name is asked for. A goal, a date and where the money is kept each
 * make the saving say more, and each can be left for later.
 */
export default function SavingFormScreen() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const isEdit = !!edit;
  const { saving: existing } = useMoneySaving(edit);
  const create = useCreateMoneySaving();
  const update = useUpdateMoneySaving();
  const remove = useDeleteMoneySaving();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState<SavingIcon>('other');
  const [goal, setGoal] = useState('');
  const [by, setBy] = useState<Date | null>(null);
  const [keptIn, setKeptIn] = useState('');
  const [starting, setStarting] = useState('');
  const [loaded, setLoaded] = useState(!isEdit);

  useEffect(() => {
    if (!existing || loaded) return;
    setName(existing.name);
    setIcon(existing.icon);
    setGoal(existing.goalMinor ? minorToPesos(existing.goalMinor) : '');
    setBy(existing.targetDate ? dateOf(existing.targetDate) : null);
    setKeptIn(existing.keptIn ?? '');
    setLoaded(true);
  }, [existing, loaded]);

  const { allowLeave } = useDiscardGuard({ name, icon, goal, by: by?.getTime() ?? null, keptIn, starting }, loaded);
  const leave = () => {
    allowLeave();
    router.back();
  };

  const goalMinor = goal.trim() ? pesosToMinor(goal) : null;
  const startingMinor = starting.trim() ? pesosToMinor(starting) : null;
  const goalWrong = goal.trim().length > 0 && goalMinor === null;
  const startingWrong = starting.trim().length > 0 && startingMinor === null;
  const busy = create.isPending || update.isPending;
  const canSave = loaded && name.trim().length > 0 && !goalWrong && !startingWrong;

  const save = () => {
    if (!canSave || busy) return;
    const fields = {
      name: name.trim(),
      icon,
      goalMinor,
      targetDate: by ? isoDay(by) : null,
      keptIn: keptIn.trim() || null,
    };
    if (isEdit && edit) {
      update.mutate(
        { id: edit, ...fields },
        { onSuccess: leave, onError: (error) => Alert.alert("Couldn't save it", problem(error)) },
      );
      return;
    }
    create.mutate(
      { ...fields, ...(startingMinor ? { startingMinor } : {}) },
      {
        onSuccess: (saving) => {
          allowLeave();
          router.replace(`/money/savings/${saving.id}`);
        },
        onError: (error) => Alert.alert("Couldn't create it", problem(error)),
      },
    );
  };

  const confirmDelete = () =>
    Alert.alert(
      'Delete this saving?',
      'The saving and its history go. Your money is wherever you keep it: Virgo never held it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            edit &&
            remove.mutate(edit, {
              onSuccess: () => {
                allowLeave();
                // Past the saving's own screen, which has nothing to show now.
                router.dismissTo('/money?tab=savings');
              },
              onError: (error) => Alert.alert("Couldn't delete it", problem(error)),
            }),
        },
      ],
    );

  return (
    <InsetFrame edges={['top']}>
      <FormHeader title={isEdit ? 'Edit saving' : 'New saving'} />
      <KeyboardFrame>
        <KeyboardScroll
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          className="flex-1"
          contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 24 }}
        >
          <FormField label="What is it for?">
            <FormInput
              value={name}
              onChangeText={setName}
              placeholder="New lens, 70–200"
              maxLength={80}
              autoFocus={!isEdit}
              returnKeyType="done"
            />
            {!isEdit ? (
              // The usual ones, a tap each: the name and its picture together.
              <ChoiceChips>
                {SAVING_STARTS.map((start) => (
                  <ChoiceChip
                    key={start.label}
                    label={start.label}
                    selected={name === start.label}
                    onPress={() => {
                      setName(start.label);
                      setIcon(start.icon);
                    }}
                  />
                ))}
              </ChoiceChips>
            ) : null}
          </FormField>

          <FormField label="Picture">
            <View className="flex-row flex-wrap gap-2.5" accessibilityRole="radiogroup">
              {SAVING_ICONS.map((value) => {
                const Glyph = savingGlyph(value);
                const on = icon === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => setIcon(value)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={ICON_NAMES[value]}
                    className={`w-11 h-11 rounded-xl items-center justify-center active:opacity-70 ${
                      on ? 'bg-foreground' : 'bg-muted'
                    }`}
                  >
                    <Glyph size={20} className={on ? 'text-background' : 'text-foreground'} />
                  </Pressable>
                );
              })}
            </View>
          </FormField>

          <FormField
            label="How much do you need?"
            optional
            wrong={goalWrong}
            hint={goalWrong ? 'Enter an amount in pesos, like 85000.' : 'Leave it empty to keep a running total.'}
          >
            <FormInput
              value={goal}
              onChangeText={setGoal}
              placeholder="0"
              keyboardType="decimal-pad"
              inputAccessoryViewID={KEYBOARD_DONE}
              lead={<Peso />}
              wrong={goalWrong}
              accessibilityLabel="Goal in pesos"
            />
          </FormField>

          <FormCard>
            <DateTimeField
              row
              first
              label="By when"
              mode="date"
              value={by}
              onChange={setBy}
              minimumDate={new Date()}
              emptyLabel="No date"
              clearable
            />
          </FormCard>

          <FormField label="Where you keep it" optional hint="GCash, a bank, an envelope. Only a note for you.">
            <FormInput value={keptIn} onChangeText={setKeptIn} placeholder="GCash" maxLength={60} returnKeyType="done" />
          </FormField>

          {!isEdit ? (
            <FormField
              label="Already have some?"
              optional
              wrong={startingWrong}
              hint={startingWrong ? 'Enter an amount in pesos, like 5000.' : undefined}
            >
              <FormInput
                value={starting}
                onChangeText={setStarting}
                placeholder="0"
                keyboardType="decimal-pad"
                inputAccessoryViewID={KEYBOARD_DONE}
                lead={<Peso />}
                wrong={startingWrong}
                accessibilityLabel="Already put aside, in pesos"
              />
            </FormField>
          ) : (
            <Pressable
              onPress={confirmDelete}
              disabled={remove.isPending}
              accessibilityRole="button"
              className="min-h-12 flex-row items-center justify-center gap-2 rounded-[14px] active:bg-destructive/10"
            >
              <Trash2Icon size={16} className="text-destructive" />
              <Text className="text-destructive text-[15px] font-semibold">
                {remove.isPending ? 'Deleting…' : 'Delete saving'}
              </Text>
            </Pressable>
          )}
        </KeyboardScroll>

        <FormFooter
          label={isEdit ? 'Save changes' : 'Create saving'}
          onPress={save}
          disabled={!canSave}
          busy={busy}
        />
      </KeyboardFrame>
    </InsetFrame>
  );
}
