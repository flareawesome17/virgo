import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { ApiError } from '@/src/api';
import { useWindowInsets } from '@/src/lib/window-insets';
import { useShade } from '@/components/BottomSheet';

function messageOf(err: unknown): string {
  if (err instanceof ApiError && err.status === 429) {
    return 'Too many tries. Wait a minute, then try again.';
  }
  return err instanceof Error && err.message ? err.message : 'Please try again.';
}

/**
 * "Delete X?", and nothing more: what deleting does, Cancel, and the button.
 *
 * For what a restore undoes: an album or a workspace goes to Recently deleted
 * for 30 days. Changing where a client's money goes still asks for the
 * password, through DeleteConfirmSheet, which this matches card for card.
 *
 * It stays open while `onConfirm` runs, so a refusal is said here rather than
 * after it closed; `onDone` follows once it went through.
 */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel = 'Delete',
  onCancel,
  onConfirm,
  onDone,
}: {
  visible: boolean;
  title: string;
  /** What deleting it does, in a sentence or two. */
  message: string;
  confirmLabel?: string;
  onCancel: () => void;
  /** The delete itself. */
  onConfirm: () => Promise<unknown>;
  /** After it went through. */
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insets = useWindowInsets();
  const shade = useShade();

  // Each opening starts clean: no error left over from the last one.
  useEffect(() => {
    if (visible) {
      setBusy(false);
      setError(null);
    }
  }, [visible]);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
      return;
    }
    setBusy(false);
    onDone();
  };

  const cancel = () => {
    if (busy) return;
    onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={cancel}>
      <View className="flex-1">
        <Pressable
          className="absolute inset-0"
          style={{ backgroundColor: shade }}
          onPress={cancel}
          accessibilityLabel="Cancel"
        />
        {/* box-none: a tap beside the card falls through to the scrim and closes it. */}
        <View pointerEvents="box-none" className="px-4" style={{ paddingTop: insets.top + 24 }}>
          <View className="bg-card rounded-3xl px-5 pt-5 pb-4">
            <Text className="text-foreground text-lg font-bold" accessibilityRole="header">
              {title}
            </Text>
            <Text className="text-muted-foreground text-sm mt-1.5">{message}</Text>

            {error ? (
              <View className="bg-destructive/10 rounded-xl px-3 py-2.5 mt-3">
                <Text className="text-destructive text-sm" accessibilityLiveRegion="polite">
                  {error}
                </Text>
              </View>
            ) : null}

            <View className="flex-row gap-3 mt-5">
              <Pressable
                onPress={cancel}
                disabled={busy}
                accessibilityRole="button"
                className="flex-1 bg-muted rounded-2xl py-3.5 items-center active:opacity-70"
              >
                <Text className="text-foreground text-base font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void confirm()}
                disabled={busy}
                accessibilityRole="button"
                className="flex-[2] rounded-2xl py-3.5 items-center justify-center bg-destructive active:opacity-85"
              >
                {busy ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-base font-bold text-white">{confirmLabel}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
