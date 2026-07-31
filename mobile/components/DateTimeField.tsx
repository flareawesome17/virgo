import { View, Text, Pressable, Platform, Modal } from 'react-native';
import { useState } from 'react';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { CalendarDaysIcon, ClockIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useTheme } from '@/src/hooks';

cssInterop(CalendarDaysIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ClockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

interface Props {
  label: string;
  mode: 'date' | 'time';
  value: Date;
  onChange: (next: Date) => void;
  minimumDate?: Date;
}

/**
 * Native date / time picker field.
 *
 * The schedule and reminder forms previously used bare TextInputs expecting
 * hand-typed `YYYY-MM-DD` and `HH:MM`, which is easy to get wrong and offers no
 * calendar at all.
 *
 * The two platforms need different presentation, which is why this is shared
 * rather than inlined per screen:
 *   Android — the picker is its own system dialog and fires once, so it must be
 *             unmounted after a selection or it will not reopen.
 *   iOS     — the picker is an inline view, so it needs a container and an
 *             explicit Done affordance.
 */
export function DateTimeField({ label, mode, value, onChange, minimumDate }: Props) {
  const [open, setOpen] = useState(false);
  // The sheet behind the picker is `bg-card`, which follows the app theme. The
  // picker must follow the same source of truth: pinned to "light" it rendered
  // near-black text on the dark card, which is unreadable in dark mode.
  const { isDark } = useTheme();
  const Icon = mode === 'date' ? CalendarDaysIcon : ClockIcon;

  const display =
    mode === 'date'
      ? value.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : value.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        });

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      // 'dismissed' fires on cancel/back — keep the previous value.
      setOpen(false);
      if (event.type === 'set' && selected) onChange(selected);
      return;
    }
    if (selected) onChange(selected);
  };

  return (
    <View className="flex-1">
      <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
        {label}
      </Text>

      <Pressable
        onPress={() => setOpen(true)}
        className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-2 active:scale-[0.98]"
        style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
      >
        <Icon size={15} className="text-muted-foreground" />
        <Text className="text-foreground text-sm flex-1">{display}</Text>
      </Pressable>

      {/* Android renders its own dialog, so it only needs to exist while open. */}
      {open && Platform.OS === 'android' && (
        <DateTimePicker
          value={value}
          mode={mode}
          display="default"
          minimumDate={minimumDate}
          onChange={handleChange}
        />
      )}

      {/* iOS gets a sheet so the inline spinner has somewhere to live. */}
      {Platform.OS === 'ios' && (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <Pressable className="flex-1" style={{ backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={() => setOpen(false)} />
          <View className="bg-card px-4 pb-8 pt-2 rounded-t-3xl">
            <View className="flex-row items-center justify-between px-1 pb-1">
              <Text className="text-muted-foreground text-sm">{label}</Text>
              <Pressable onPress={() => setOpen(false)} className="px-3 py-2 active:opacity-60">
                <Text className="text-primary text-base font-bold">Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={value}
              mode={mode}
              display="spinner"
              minimumDate={minimumDate}
              onChange={handleChange}
              themeVariant={isDark ? 'dark' : 'light'}
              // Explicit rather than inherited: themeVariant sets the picker's
              // own chrome, but the wheel text still needs to match the card it
              // sits on, and the accent has to be Virgo's, not iOS blue.
              textColor={isDark ? '#F2EDE8' : '#1E1B18'}
              accentColor={isDark ? '#C17745' : '#B66A40'}
            />
          </View>
        </Modal>
      )}
    </View>
  );
}
