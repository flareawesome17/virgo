import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChoiceRows } from '@/components/WorkspaceBits';
import { useTheme } from '@/src/hooks';
import { PALETTES } from '@/theme';

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
}: {
  visible: boolean;
  title: string;
  hint?: string;
  reasons: { value: T; label: string }[];
  pending?: boolean;
  /** Shown under the note. Already worded for people, never a raw message. */
  error?: string | null;
  onSubmit: (reason: T, note: string) => void;
  onClose: () => void;
  /** Once the sheet has fully gone, which is when an Alert can follow it. */
  onClosed?: () => void;
}) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;

  const [reason, setReason] = useState<T | null>(null);
  const [note, setNote] = useState('');

  // Cleared as it opens rather than as it closes, so the sheet does not
  // visibly empty itself on its way down. State set during render rather than
  // in an effect, so the first frame of a fresh sheet is already clear.
  const [shown, setShown] = useState(visible);
  if (visible !== shown) {
    setShown(visible);
    if (visible) {
      setReason(null);
      setNote('');
    }
  }

  // onDismiss is iOS-only. Android has no exit animation to wait for, so it
  // counts as closed the moment it stops being visible.
  const wasVisible = useRef(visible);
  useEffect(() => {
    const closedNow = wasVisible.current && !visible;
    wasVisible.current = visible;
    if (closedNow && Platform.OS !== 'ios') onClosed?.();
  }, [visible, onClosed]);

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
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
      onDismiss={onClosed}
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable className="flex-1 bg-foreground/40" onPress={close} accessibilityLabel="Close" />
        {/* Capped and scrollable: six reasons, a note and the keyboard do not
            fit on a small phone at once. */}
        <SafeAreaView edges={['bottom']} className="bg-card rounded-t-3xl" style={{ maxHeight: '90%' }}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}
          >
            <Text className="text-foreground text-lg font-bold" accessibilityRole="header">
              {title}
            </Text>
            {hint ? <Text className="text-muted-foreground text-xs mt-1">{hint}</Text> : null}

            <View className="mt-3">
              <ChoiceRows<T> options={reasons} value={reason} onChoose={(r) => setReason(r)} />
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
              className="bg-muted rounded-2xl text-foreground text-sm px-4 py-3 mt-3"
              style={{ minHeight: 88, maxHeight: 160 }}
            />
            <Text className="text-muted-foreground text-[11px] text-right mt-1">
              {`${note.length}/${NOTE_LIMIT}`}
            </Text>

            {/* The live region is the wrapper, which is always there, rather
                than the message, which comes and goes: TalkBack reads a live
                region when what is inside it changes, and one that has only
                just appeared has nothing earlier to have changed from. */}
            <View accessibilityLiveRegion="polite">
              {error ? <Text className="text-destructive text-xs mt-1">{error}</Text> : null}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !ready }}
              disabled={!ready}
              onPress={() => {
                if (reason !== null) onSubmit(reason, note);
              }}
              className={`mt-4 rounded-2xl py-3.5 flex-row items-center justify-center gap-2 bg-action ${
                ready || pending ? '' : 'opacity-40'
              }`}
            >
              {pending ? <ActivityIndicator size="small" color={palette.actionForeground} /> : null}
              <Text className="text-action-foreground text-[15px] font-bold">
                {pending ? 'Sending…' : 'Send report'}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={close}
              disabled={pending}
              className="py-3.5 items-center active:opacity-70"
            >
              <Text className="text-muted-foreground text-base">Cancel</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
