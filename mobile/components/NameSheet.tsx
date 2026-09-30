import { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShade } from '@/components/BottomSheet';

/**
 * A name, typed. Alert.prompt would do, but it exists on iOS only — on
 * Android there is no prompt at all, so this is the one way that works on both.
 *
 * A card at the top of the screen, not a bottom sheet like the others. The
 * field focuses as it opens, and the keyboard comes up over the bottom of the
 * screen: a bottom sheet ended up entirely behind it, leaving nothing but a
 * keyboard and no way to reach Cancel. A modal doesn't move out of the
 * keyboard's way on either platform — on iOS it never resizes, and on Android
 * the app runs edge to edge, so the dialog window isn't resized either.
 */
export function NameSheet({
  visible,
  initial,
  title,
  hint,
  placeholder,
  label,
  onCancel,
  onSave,
}: {
  visible: boolean;
  initial: string;
  title: string;
  hint?: string;
  placeholder?: string;
  /** What a screen reader calls the field. */
  label: string;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const insets = useSafeAreaInsets();
  const shade = useShade();
  const ready = value.trim().length > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View className="flex-1">
        <Pressable
          className="absolute inset-0"
          style={{ backgroundColor: shade }}
          onPress={onCancel}
          accessibilityLabel="Cancel"
        />
        {/* box-none: a tap beside the card falls through to the scrim and closes it. */}
        <View pointerEvents="box-none" className="px-4" style={{ paddingTop: insets.top + 24 }}>
          <View className="bg-card rounded-3xl px-5 pt-5 pb-4">
            <Text className="text-foreground text-lg font-bold mb-4" accessibilityRole="header">
              {title}
            </Text>
            <TextInput
              value={value}
              onChangeText={setValue}
              autoFocus
              maxLength={60}
              placeholder={placeholder}
              returnKeyType="done"
              onSubmitEditing={() => ready && onSave(value)}
              accessibilityLabel={label}
              className="rounded-2xl border border-input bg-background px-4 py-3.5 text-foreground text-base"
            />
            {hint ? <Text className="text-muted-foreground text-xs mt-2 ml-1">{hint}</Text> : null}
            <View className="flex-row gap-3 mt-5">
              <Pressable onPress={onCancel} className="flex-1 bg-muted rounded-2xl py-3.5 items-center active:opacity-70">
                <Text className="text-foreground text-base font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => ready && onSave(value)}
                disabled={!ready}
                className={`flex-[2] rounded-2xl py-3.5 items-center ${ready ? 'bg-action active:opacity-85' : 'bg-muted'}`}
              >
                <Text className={`text-base font-bold ${ready ? 'text-action-foreground' : 'text-muted-foreground'}`}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
