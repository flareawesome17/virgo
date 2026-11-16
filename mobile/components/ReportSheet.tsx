import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CheckIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { BottomSheet } from '@/components/BottomSheet';
import { useTheme } from '@/src/hooks';
import { PALETTES } from '@/theme';

cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const NOTE_LIMIT = 500;

/**
 * A reason, an optional note, and Send.
 *
 * A sheet rather than an Alert because Android shows at most three buttons: the
 * job report used to be an Alert of Cancel and four reasons, and on Android
 * only Cancel, Spam and Scam ever appeared. A report about a person has six.
 *
 * It never raises an Alert itself. What follows a report — thanks, an offer to
 * block — belongs to the caller, which passes it to `onClosed`: iOS will not
 * present an alert over a modal that is still sliding away, and one raised in
 * that window is simply never shown. A failure stays in the sheet as `error`,
 * with the reason and the note still filled in, so sending again is one tap.
 *
 * `include` offers to send something along with the report — a chat's latest
 * messages — on by default, and the choice comes back as onSubmit's third
 * argument.
 */
export function ReportSheet<T extends string>({
  visible,
  title,
  hint,
  reasons,
  pending = false,
  error,
  onSubmit,
  onClose,
  onClosed,
  include,
}: {
  visible: boolean;
  title: string;
  hint?: string;
  reasons: { value: T; label: string }[];
  pending?: boolean;
  /** Shown under the note. Already worded for people, never a raw message. */
  error?: string | null;
  onSubmit: (reason: T, note: string, included: boolean) => void;
  onClose: () => void;
  /** Once the sheet has fully gone, which is when an Alert can follow it. */
  onClosed?: () => void;
  /** Something to send along, which the person can switch off. */
  include?: { label: string; detail: string } | null;
}) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;

  const [reason, setReason] = useState<T | null>(null);
  const [note, setNote] = useState('');
  const [included, setIncluded] = useState(true);

  // Cleared as it opens rather than as it closes, so the sheet does not
  // visibly empty itself on its way down. State set during render rather than
  // in an effect, so the first frame of a fresh sheet is already clear.
  const [shown, setShown] = useState(visible);
  if (visible !== shown) {
    setShown(visible);
    if (visible) {
      setReason(null);
      setNote('');
      setIncluded(true);
    }
  }

  // A failure is said out loud as well as shown. Focus is still on Send, which
  // only goes from "Sending…" back to "Send report", so a VoiceOver user
  // otherwise hears nothing to say the report did not go. Android is told by
  // the live region round the message instead; announcing there as well would
  // read it twice.
  useEffect(() => {
    if (error && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(error);
  }, [error]);

  // Nothing closes it while a report is on its way: the result is what decides
  // what comes next, and a sheet already gone has nowhere to say it failed.
  const close = () => {
    if (!pending) onClose();
  };

  const ready = reason !== null && !pending;

  return (
    <BottomSheet visible={visible} onClose={close} onClosed={onClosed} dismissible={!pending}>
      {/* Scrollable: six reasons, a note and the keyboard do not fit on a small
          phone at once. */}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}
      >
        <View className="min-h-[32px] justify-center">
          <Text
            className="text-foreground text-[18px] leading-[26px] font-bold"
            accessibilityRole="header"
          >
            {title}
          </Text>
        </View>
        {hint ? (
          <Text className="text-muted-foreground text-[13px] leading-[18px] mt-1">{hint}</Text>
        ) : null}

        {/* The reasons, in one card. The chosen one is dark, not terracotta:
            terracotta is Send's, and a terracotta tick put a second "do this"
            above the real one. */}
        <View
          className="mt-3 rounded-[20px] border border-border/40 bg-card overflow-hidden"
          accessibilityRole="radiogroup"
        >
          {reasons.map((option, index) => {
            const on = option.value === reason;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: on, disabled: pending }}
                disabled={pending}
                onPress={() => setReason(option.value)}
                className={`min-h-[52px] px-4 py-2 flex-row items-center gap-3 active:opacity-70 ${
                  index > 0 ? 'border-t border-border/40' : ''
                }`}
              >
                <Text
                  className={`flex-1 text-foreground text-[15px] leading-5 ${on ? 'font-semibold' : ''}`}
                >
                  {option.label}
                </Text>
                {on ? (
                  <View className="w-[22px] h-[22px] rounded-full bg-foreground items-center justify-center">
                    <CheckIcon size={14} strokeWidth={3} className="text-background" />
                  </View>
                ) : (
                  <View className="w-[22px] h-[22px] rounded-full border-2 border-border" />
                )}
              </Pressable>
            );
          })}
        </View>

        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Add details (optional)"
          placeholderTextColor={palette.mutedForeground}
          maxLength={NOTE_LIMIT}
          multiline
          textAlignVertical="top"
          editable={!pending}
          className="mt-3.5 rounded-[14px] border border-border bg-card text-foreground text-[16px] leading-[22px] px-4"
          style={{ minHeight: 76, maxHeight: 160, paddingVertical: 14 }}
        />
        <Text className="text-muted-foreground text-[12px] leading-4 text-right mt-1.5">
          {`${note.length} of ${NOTE_LIMIT}`}
        </Text>

        {include ? (
          <View className="mt-2 flex-row items-center gap-3 rounded-[20px] border border-border/40 bg-card px-4 py-3">
            <View className="flex-1">
              <Text className="text-foreground text-[15px] leading-5 font-semibold">
                {include.label}
              </Text>
              <Text className="text-muted-foreground text-[13px] leading-[18px] mt-0.5">
                {include.detail}
              </Text>
            </View>
            <Switch
              value={included}
              onValueChange={setIncluded}
              disabled={pending}
              accessibilityLabel={include.label}
              trackColor={{ true: palette.primary, false: palette.border }}
              // White on every platform, as the app's other switches are;
              // left alone, Android and the web draw it in their own colour.
              thumbColor="#FFFFFF"
            />
          </View>
        ) : null}

        {/* The live region is the wrapper, which is always there, rather
            than the message, which comes and goes: TalkBack reads a live
            region when what is inside it changes, and one that has only
            just appeared has nothing earlier to have changed from. */}
        <View accessibilityLiveRegion="polite">
          {error ? (
            <Text className="text-destructive text-[13px] leading-[18px] mt-1">{error}</Text>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
          disabled={!ready}
          onPress={() => {
            if (reason !== null) onSubmit(reason, note, !!include && included);
          }}
          className={`mt-2.5 h-[52px] rounded-[14px] flex-row items-center justify-center gap-2 bg-action ${
            ready || pending ? '' : 'opacity-40'
          }`}
        >
          {pending ? <ActivityIndicator size="small" color={palette.actionForeground} /> : null}
          <Text className="text-action-foreground text-[16px] leading-[22px] font-semibold">
            {pending ? 'Sending…' : 'Send report'}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={close}
          disabled={pending}
          className="mt-2 h-11 rounded-[14px] bg-muted items-center justify-center active:opacity-70"
        >
          <Text className="text-foreground text-[15px] leading-5 font-semibold">Cancel</Text>
        </Pressable>
      </ScrollView>
    </BottomSheet>
  );
}
