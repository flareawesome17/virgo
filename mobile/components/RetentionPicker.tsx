import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { KEYBOARD_DONE } from '@/components/KeyboardDoneBar';
import { ChevronLeftIcon, ChevronRightIcon, MinusIcon, PlusIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  addDaysToKey,
  daysBetweenKeys,
  MAX_RETENTION_DAYS,
  RETENTION_DAY_PRESETS,
  retentionDateLabel,
  retentionDaysLabel,
  retentionReady,
  todayDateKey,
  type Retention,
} from '@/src/api';
import { DAYS, getMonthWeeks, MONTHS } from '@/src/lib/calendar';

export { retentionReady };

for (const Icon of [ChevronLeftIcon, ChevronRightIcon, MinusIcon, PlusIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** The same day `months` later, or the month's last day when it has fewer. */
function monthsLater(key: string, months: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10);
}

const QUICK_DATES = [
  { label: '1 month', months: 1 },
  { label: '3 months', months: 3 },
  { label: '6 months', months: 6 },
  { label: '1 year', months: 12 },
];

/**
 * How long an album keeps its files: until deleted, a window after each
 * upload, or until a date picked on a calendar.
 *
 * It offered 7 or 30 days and a "Custom" that was eight more fixed choices —
 * no number of your own, no date, and Custom with nothing tapped quietly saved
 * "no expiration". A photographer whose contract says "until 31 March" had no
 * way to say so.
 */
export function RetentionPicker({
  value,
  onChange,
}: {
  value: Retention;
  onChange: (next: Retention) => void;
}) {
  const today = todayDateKey();

  return (
    <View className="gap-3">
      <View className="bg-card rounded-2xl overflow-hidden">
        <Choice
          checked={value.mode === 'forever'}
          title="Until I delete them"
          detail="Nothing is removed on its own."
          onPress={() => onChange({ mode: 'forever' })}
        />
        <Divider />
        <Choice
          checked={value.mode === 'days'}
          title="For a set time after each upload"
          detail="Each file goes that long after it was added."
          onPress={() => value.mode !== 'days' && onChange({ mode: 'days', days: 30 })}
        />
        <Divider />
        <Choice
          checked={value.mode === 'until'}
          title="Until a date"
          detail="Everything is kept through the day you pick, then removed."
          onPress={() => value.mode !== 'until' && onChange({ mode: 'until', date: '' })}
        />
      </View>

      {value.mode === 'days' && <DaysField days={value.days} onChange={(days) => onChange({ mode: 'days', days })} />}
      {value.mode === 'until' && (
        <DateField today={today} date={value.date} onChange={(date) => onChange({ mode: 'until', date })} />
      )}
    </View>
  );
}

function Divider() {
  return <View className="h-px bg-border ml-12" />;
}

function Choice({
  checked,
  title,
  detail,
  onPress,
}: {
  checked: boolean;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked, selected: checked }}
      accessibilityLabel={`${title}. ${detail}`}
      className="flex-row items-center gap-3 px-4 py-3 min-h-[60px] active:bg-muted/40"
    >
      <View
        className={`w-5 h-5 rounded-full border-2 items-center justify-center ${checked ? 'border-primary' : 'border-border'}`}
      >
        {checked && <View className="w-2.5 h-2.5 rounded-full bg-primary" />}
      </View>
      <View className="flex-1">
        <Text className="text-foreground text-[15px] font-semibold">{title}</Text>
        <Text className="text-muted-foreground text-[13px] leading-5 mt-0.5">{detail}</Text>
      </View>
    </Pressable>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on, selected: on }}
      className={`rounded-full px-4 min-h-[44px] justify-center border ${on ? 'bg-primary border-primary' : 'border-border bg-card'} active:opacity-80`}
    >
      <Text className={`text-[14px] font-semibold ${on ? 'text-primary-foreground' : 'text-foreground'}`}>{label}</Text>
    </Pressable>
  );
}

/** A window in days: the usual ones, or any number up to ten years. */
function DaysField({ days, onChange }: { days: number; onChange: (days: number) => void }) {
  const preset = (RETENTION_DAY_PRESETS as readonly number[]).includes(days);
  const [typing, setTyping] = useState(!preset);
  const [text, setText] = useState(String(days));
  const problem =
    !Number.isInteger(days) || days < 1
      ? 'At least 1 day.'
      : days > MAX_RETENTION_DAYS
        ? 'At most 3,650 days (ten years).'
        : null;

  const set = (next: number) => {
    const clamped = Math.max(1, Math.min(MAX_RETENTION_DAYS, next));
    setText(String(clamped));
    onChange(clamped);
  };

  return (
    <View className="bg-card rounded-2xl p-4 gap-3">
      <View className="flex-row flex-wrap gap-2">
        {RETENTION_DAY_PRESETS.map((d) => (
          <Chip
            key={d}
            label={retentionDaysLabel(d)}
            on={!typing && days === d}
            onPress={() => {
              setTyping(false);
              set(d);
            }}
          />
        ))}
        <Chip label="Other" on={typing} onPress={() => setTyping(true)} />
      </View>

      {typing && (
        <View className="gap-1.5">
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => set((Number.isInteger(days) ? days : 1) - 1)}
              accessibilityRole="button"
              accessibilityLabel="One day fewer"
              className="w-11 h-11 rounded-xl bg-muted items-center justify-center active:opacity-70"
            >
              <MinusIcon size={18} className="text-foreground" />
            </Pressable>
            <TextInput
              value={text}
              onChangeText={(t) => {
                const digits = t.replace(/[^\d]/g, '').slice(0, 4);
                setText(digits);
                onChange(digits === '' ? 0 : Number(digits));
              }}
              keyboardType="number-pad"
              inputAccessoryViewID={KEYBOARD_DONE}
              accessibilityLabel="Days after each upload"
              className={`flex-1 h-11 rounded-xl border px-3 text-center text-foreground text-[17px] font-semibold ${problem ? 'border-destructive' : 'border-border'}`}
            />
            <Pressable
              onPress={() => set((Number.isInteger(days) ? days : 0) + 1)}
              accessibilityRole="button"
              accessibilityLabel="One day more"
              className="w-11 h-11 rounded-xl bg-muted items-center justify-center active:opacity-70"
            >
              <PlusIcon size={18} className="text-foreground" />
            </Pressable>
          </View>
          <Text className={`text-[13px] ${problem ? 'text-destructive' : 'text-muted-foreground'}`}>
            {problem ?? `Each file is removed ${retentionDaysLabel(days)} after it was uploaded.`}
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * The last day, on a calendar.
 *
 * The span from today to the day picked is drawn across the weeks, so how long
 * that is can be seen as well as read. Quick picks jump months ahead, since a
 * year is twelve taps of the arrow otherwise.
 */
function DateField({
  today,
  date,
  onChange,
}: {
  today: string;
  date: string;
  onChange: (date: string) => void;
}) {
  const first = addDaysToKey(today, 1);
  const last = addDaysToKey(today, MAX_RETENTION_DAYS);
  const shown = date || first;
  const [view, setView] = useState(() => {
    const [y, m] = shown.split('-').map(Number);
    return { year: y, month: m - 1 };
  });
  const weeks = useMemo(() => getMonthWeeks(view.year, view.month), [view]);

  const go = (delta: number) =>
    setView((v) => {
      const total = v.year * 12 + v.month + delta;
      return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
    });
  const viewKey = `${view.year}-${String(view.month + 1).padStart(2, '0')}`;
  const canBack = viewKey > today.slice(0, 7);
  const canForward = viewKey < last.slice(0, 7);

  const pick = (key: string) => {
    onChange(key);
    const [y, m] = key.split('-').map(Number);
    setView({ year: y, month: m - 1 });
  };

  const span = date ? daysBetweenKeys(today, date) : 0;

  return (
    <View className="bg-card rounded-2xl p-4 gap-3">
      <View className="flex-row flex-wrap gap-2">
        {QUICK_DATES.map((q) => {
          const key = monthsLater(today, q.months);
          return <Chip key={q.label} label={q.label} on={date === key} onPress={() => pick(key)} />;
        })}
      </View>

      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => go(-1)}
          disabled={!canBack}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          className="w-11 h-11 items-center justify-center rounded-full active:bg-muted"
          style={{ opacity: canBack ? 1 : 0.3 }}
        >
          <ChevronLeftIcon size={20} className="text-foreground" />
        </Pressable>
        <Text accessibilityRole="header" className="text-foreground text-[16px] font-bold">
          {MONTHS[view.month]} {view.year}
        </Text>
        <Pressable
          onPress={() => go(1)}
          disabled={!canForward}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          className="w-11 h-11 items-center justify-center rounded-full active:bg-muted"
          style={{ opacity: canForward ? 1 : 0.3 }}
        >
          <ChevronRightIcon size={20} className="text-foreground" />
        </Pressable>
      </View>

      <View>
        <View className="flex-row">
          {DAYS.map((d) => (
            <Text key={d} className="flex-1 text-center text-muted-foreground text-[12px] font-semibold pb-1">
              {d.slice(0, 2)}
            </Text>
          ))}
        </View>
        {weeks.map((week) => (
          <View key={week[0].key} className="flex-row">
            {week.map((cell) => {
              const out = cell.isOutside;
              const allowed = !out && cell.key >= first && cell.key <= last;
              const chosen = !out && cell.key === date;
              // The days kept: from today through the one picked.
              const inSpan = !out && !!date && cell.key >= today && cell.key < date;
              return (
                <View key={cell.key} className="flex-1 h-11 justify-center">
                  {inSpan && <View className="absolute left-0 right-0 top-1 bottom-1 bg-primary/10" />}
                  <Pressable
                    onPress={() => allowed && pick(cell.key)}
                    disabled={!allowed}
                    accessibilityRole="button"
                    accessibilityLabel={out ? undefined : retentionDateLabel(cell.key)}
                    accessibilityState={{ selected: chosen, disabled: !allowed }}
                    accessibilityElementsHidden={out}
                    importantForAccessibility={out ? 'no-hide-descendants' : 'auto'}
                    className={`self-center w-10 h-10 rounded-full items-center justify-center ${chosen ? 'bg-primary' : ''} ${cell.isToday && !chosen ? 'border border-primary' : ''}`}
                  >
                    <Text
                      className={`text-[15px] ${
                        chosen
                          ? 'text-primary-foreground font-bold'
                          : out
                            ? 'text-transparent'
                            : allowed
                              ? 'text-foreground'
                              : 'text-muted-foreground/40'
                      }`}
                    >
                      {cell.day}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ))}
      </View>

      <Text
        accessibilityLiveRegion="polite"
        className={`text-[14px] leading-5 ${date ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        {date
          ? `Kept for ${span} ${span === 1 ? 'day' : 'days'}, until ${retentionDateLabel(date)}. Removed in the overnight clean-up after.`
          : 'Pick the last day the files are kept.'}
      </Text>
    </View>
  );
}
