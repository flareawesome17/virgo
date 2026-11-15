import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import {
  CameraIcon,
  CheckIcon,
  HeartIcon,
  HouseIcon,
  PiggyBankIcon,
  PlaneIcon,
  ReceiptTextIcon,
  ShieldIcon,
  UmbrellaIcon,
  type LucideIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  ApiError,
  formatMoney,
  minorToPesos,
  pesosToMinor,
  type MoneySaving,
  type SavingIcon,
} from '@/src/api';
import { useMoveMoneySaving } from '@/src/hooks';
import { BottomSheet } from '@/components/BottomSheet';
import { ChoiceChip, usePlaceholderColor } from '@/components/Form';
import { KEYBOARD_DONE } from '@/components/KeyboardDoneBar';

for (const Icon of [
  CameraIcon, CheckIcon, HeartIcon, HouseIcon, PiggyBankIcon, PlaneIcon, ReceiptTextIcon, ShieldIcon, UmbrellaIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** The server keeps a word for a saving's picture; this is the picture. */
const GLYPHS: Record<SavingIcon, LucideIcon> = {
  gear: CameraIcon,
  tax: ReceiptTextIcon,
  safety: ShieldIcon,
  slow: UmbrellaIcon,
  trip: PlaneIcon,
  home: HouseIcon,
  family: HeartIcon,
  other: PiggyBankIcon,
};

export function savingGlyph(icon: SavingIcon): LucideIcon {
  return GLYPHS[icon] ?? PiggyBankIcon;
}

/** What a saving is usually for, to start one from: a name and its picture. */
export const SAVING_STARTS: { label: string; icon: SavingIcon }[] = [
  { label: 'New gear', icon: 'gear' },
  { label: 'Tax fund', icon: 'tax' },
  { label: 'Emergency fund', icon: 'safety' },
  { label: 'Slow months', icon: 'slow' },
  { label: 'A trip', icon: 'trip' },
];

/** A saving's picture on the neutral tile every row has; green and ticked once its goal is met. */
export function SavingTile({ saving, size = 40 }: { saving: Pick<MoneySaving, 'icon' | 'balanceMinor' | 'goalMinor'>; size?: number }) {
  const met = !!saving.goalMinor && saving.balanceMinor >= saving.goalMinor;
  const Glyph = met ? CheckIcon : savingGlyph(saving.icon);
  return (
    <View
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
      className={`items-center justify-center ${met ? 'bg-success/15' : 'bg-muted'}`}
    >
      <Glyph size={Math.round(size * 0.46)} className={met ? 'text-success' : 'text-foreground'} strokeWidth={met ? 2.6 : 2} />
    </View>
  );
}

/** The bar under a saving: how far along it is. Green once it is there. */
export function SavingBar({ progress, height = 6 }: { progress: number; height?: number }) {
  return (
    <View style={{ height }} className="rounded-full bg-muted overflow-hidden">
      <View
        className={`h-full rounded-full ${progress >= 1 ? 'bg-success' : 'bg-secondary-foreground'}`}
        style={{ width: `${Math.round(Math.min(Math.max(progress, 0), 1) * 100)}%` }}
      />
    </View>
  );
}

function problem(error: unknown): string {
  return error instanceof ApiError && error.status !== 0 ? error.message : 'Check your connection and try again.';
}

/** A large amount field: a peso sign, and the figure at the size it is said. */
function AmountField({
  value,
  onChange,
  autoFocus,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  autoFocus?: boolean;
  label: string;
}) {
  const placeholder = usePlaceholderColor();
  return (
    <View className="flex-row items-center gap-2 rounded-[14px] border border-border bg-background px-4 min-h-[56px]">
      <Text className="text-muted-foreground text-[20px] font-semibold">₱</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="0"
        placeholderTextColor={placeholder}
        keyboardType="decimal-pad"
        inputAccessoryViewID={KEYBOARD_DONE}
        autoFocus={autoFocus}
        accessibilityLabel={label}
        className="flex-1 min-w-0 text-foreground text-[26px] leading-8 font-bold"
        style={{ fontVariant: ['tabular-nums'], paddingVertical: 8 }}
      />
    </View>
  );
}

/**
 * Putting money into a saving, or taking it out.
 *
 * One sheet for both: the same two things are asked, how much and what for,
 * and only the word on the button changes.
 */
export function SavingMoveSheet({
  saving,
  direction,
  onClose,
  onMoved,
}: {
  saving: MoneySaving;
  /** Null is closed. */
  direction: 'in' | 'out' | null;
  onClose: () => void;
  /** After the money has moved; `out` is what was taken, to be recorded elsewhere. */
  onMoved?: (direction: 'in' | 'out', amountMinor: number, note: string | null) => void;
}) {
  const move = useMoveMoneySaving();
  const placeholder = usePlaceholderColor();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (direction !== null) {
      setAmount('');
      setNote('');
    }
  }, [direction]);

  const minor = pesosToMinor(amount);
  const out = direction === 'out';
  const tooMuch = out && minor !== null && minor > saving.balanceMinor;
  const ready = minor !== null && minor > 0 && !tooMuch;

  const submit = () => {
    if (!ready || minor === null || direction === null || move.isPending) return;
    const text = note.trim() || null;
    move.mutate(
      { id: saving.id, amountMinor: out ? -minor : minor, note: text },
      {
        onSuccess: () => {
          onClose();
          onMoved?.(direction, minor, text);
        },
        onError: (error) => Alert.alert(out ? "Couldn't take it out" : "Couldn't add it", problem(error)),
      },
    );
  };

  return (
    <BottomSheet visible={direction !== null} onClose={onClose}>
      <View className="px-5 pt-1 pb-3 gap-4">
        <View className="gap-0.5">
          <Text className="text-foreground text-[18px] leading-[26px] font-bold" accessibilityRole="header">
            {out ? 'Take money out' : 'Add money'}
          </Text>
          <Text className="text-muted-foreground text-[14px] leading-5" numberOfLines={1}>
            {saving.name} holds {formatMoney(saving.balanceMinor)}
          </Text>
        </View>
        <AmountField value={amount} onChange={setAmount} autoFocus label="Amount in pesos" />
        {tooMuch ? (
          <Text className="text-destructive text-[13px] leading-[18px] -mt-2" accessibilityLiveRegion="polite">
            That is more than it holds.
          </Text>
        ) : null}
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={out ? 'What it went on, if you like' : 'Where it came from, if you like'}
          placeholderTextColor={placeholder}
          maxLength={200}
          returnKeyType="done"
          className="min-h-[52px] rounded-[14px] border border-border bg-background px-4 text-foreground text-[16px]"
        />
        <Pressable
          onPress={submit}
          disabled={!ready || move.isPending}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready || move.isPending, busy: move.isPending }}
          className={`h-[52px] rounded-[14px] items-center justify-center ${ready ? 'bg-action active:opacity-85' : 'bg-muted'}`}
        >
          <Text className={`text-[16px] font-semibold ${ready ? 'text-action-foreground' : 'text-muted-foreground'}`}>
            {move.isPending
              ? 'Saving…'
              : minor && ready
                ? `${out ? 'Take out' : 'Add'} ${formatMoney(minor)}`
                : out
                  ? 'Take out'
                  : 'Add money'}
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const SHARES = [10, 20, 30] as const;

/**
 * "Set some of it aside?", asked once a payment has been recorded.
 *
 * A share of what just came in, into the savings that are ticked, split
 * evenly in whole pesos with the odd centavos to the first. It is a question,
 * not a rule: "Not this time" is as good an answer, and nothing is put aside
 * that was not chosen here.
 */
export function SetAsideSheet({
  offer,
  savings,
  onClose,
}: {
  /** The payment being asked about; null is closed. */
  offer: { amountMinor: number; from: string | null } | null;
  savings: MoneySaving[];
  onClose: () => void;
}) {
  const move = useMoveMoneySaving();
  const [share, setShare] = useState<(typeof SHARES)[number]>(20);
  // Which savings it goes into. The tax fund first, when there is one: tax on
  // what was just earned is the one thing that is certainly owed.
  const [chosen, setChosen] = useState<string[]>([]);
  const offered = offer?.amountMinor ?? 0;
  useEffect(() => {
    if (!offer) return;
    const tax = savings.find((saving) => saving.icon === 'tax');
    setChosen(tax ? [tax.id] : savings.slice(0, 1).map((saving) => saving.id));
    setShare(20);
    // Only as it opens: the list refetching must not undo what was ticked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer]);

  // In whole pesos, so nobody is asked to move ₱4,499.50.
  const total = Math.floor((offered * share) / 100 / 100) * 100;
  const parts = useMemo(() => {
    const into = savings.filter((saving) => chosen.includes(saving.id));
    if (into.length === 0 || total <= 0) return [];
    const each = Math.floor(total / into.length / 100) * 100;
    return into.map((saving, at) => ({
      saving,
      amountMinor: at === 0 ? total - each * (into.length - 1) : each,
    }));
  }, [savings, chosen, total]);
  const [busy, setBusy] = useState(false);
  const ready = parts.length > 0 && parts.every((part) => part.amountMinor > 0) && !busy;

  const confirm = async () => {
    if (!ready) return;
    setBusy(true);
    const note = offer?.from ? `From ${offer.from}` : 'From a payment';
    let failed: unknown = null;
    // One after another: each is its own small write, and a failure part-way
    // leaves the ones before it done, which is said below.
    let done = 0;
    for (const part of parts) {
      try {
        await move.mutateAsync({ id: part.saving.id, amountMinor: part.amountMinor, note });
        done += 1;
      } catch (error) {
        failed = error;
        break;
      }
    }
    setBusy(false);
    onClose();
    if (failed) {
      Alert.alert(
        done > 0 ? 'Some of it was set aside' : "Couldn't set it aside",
        `${done > 0 ? `${done} of ${parts.length} went through. ` : ''}${problem(failed)}`,
      );
    }
  };

  return (
    <BottomSheet visible={offer !== null} onClose={onClose}>
      <View className="px-5 pt-1 pb-3 gap-4">
        <View className="gap-0.5">
          <Text className="text-foreground text-[18px] leading-[26px] font-bold" accessibilityRole="header">
            Set some of it aside?
          </Text>
          <Text className="text-muted-foreground text-[14px] leading-5" numberOfLines={2}>
            You just recorded {formatMoney(offered)}
            {offer?.from ? ` from ${offer.from}` : ''}.
          </Text>
        </View>

        <View className="flex-row items-center justify-between gap-3">
          <Text
            className="text-foreground text-[26px] leading-8 font-bold tracking-tight"
            style={{ fontVariant: ['tabular-nums'] }}
            accessibilityLiveRegion="polite"
          >
            {formatMoney(total)}
          </Text>
          <View className="flex-row gap-2" accessibilityRole="radiogroup">
            {SHARES.map((value) => (
              <ChoiceChip key={value} label={`${value}%`} selected={share === value} onPress={() => setShare(value)} />
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-muted-foreground text-[13px] leading-[18px] font-semibold">Into</Text>
          <View className="rounded-[20px] border border-border/40 bg-background overflow-hidden">
            {savings.map((saving, at) => {
              const on = chosen.includes(saving.id);
              const part = parts.find((p) => p.saving.id === saving.id);
              return (
                <Pressable
                  key={saving.id}
                  onPress={() =>
                    setChosen((current) => (on ? current.filter((id) => id !== saving.id) : [...current, saving.id]))
                  }
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${saving.name}${part ? `, ${formatMoney(part.amountMinor)}` : ''}`}
                  className={`min-h-[52px] flex-row items-center gap-3 px-4 active:opacity-70 ${at > 0 ? 'border-t border-border/40' : ''}`}
                >
                  <View
                    className={`w-5 h-5 rounded-md items-center justify-center ${on ? 'bg-action' : 'border-2 border-muted-foreground/40'}`}
                  >
                    {on ? <CheckIcon size={13} className="text-action-foreground" strokeWidth={3} /> : null}
                  </View>
                  <Text className="flex-1 text-foreground text-[15px] font-semibold" numberOfLines={1}>
                    {saving.name}
                  </Text>
                  {part ? (
                    <Text className="text-foreground text-[15px] font-semibold" style={{ fontVariant: ['tabular-nums'] }}>
                      {formatMoney(part.amountMinor)}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="gap-1">
          <Pressable
            onPress={() => void confirm()}
            disabled={!ready}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready, busy }}
            className={`h-[52px] rounded-[14px] items-center justify-center ${ready ? 'bg-action active:opacity-85' : 'bg-muted'}`}
          >
            <Text className={`text-[16px] font-semibold ${ready ? 'text-action-foreground' : 'text-muted-foreground'}`}>
              {busy ? 'Setting it aside…' : ready ? `Set aside ${formatMoney(total)}` : 'Choose where it goes'}
            </Text>
          </Pressable>
          <Pressable onPress={onClose} accessibilityRole="button" className="h-11 items-center justify-center active:opacity-60">
            <Text className="text-muted-foreground text-[15px] font-semibold">Not this time</Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}

/** Pesos as typed into a field, from centavos; empty for nothing. */
export function pesosField(minor: number | null | undefined): string {
  return minor ? minorToPesos(minor) : '';
}
