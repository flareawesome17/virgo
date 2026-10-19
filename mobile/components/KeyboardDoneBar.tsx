import { InputAccessoryView, Keyboard, Platform, Pressable, Text, View } from 'react-native';

/** Give a TextInput `inputAccessoryViewID={KEYBOARD_DONE}` to get the bar. */
export const KEYBOARD_DONE = 'virgo-keyboard-done';

/**
 * A Done above the iOS number pad.
 *
 * The number pad has no return key, so a budget, a rate or a number of days
 * left the keyboard up with no way to put it away but to find something else
 * to tap. Mounted once for the app; each field opts in by id. Android's
 * number keyboard has its own done key.
 */
export function KeyboardDoneBar() {
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={KEYBOARD_DONE}>
      <View className="flex-row justify-end bg-card border-t border-border px-2">
        <Pressable
          onPress={() => Keyboard.dismiss()}
          accessibilityRole="button"
          className="min-h-[44px] px-3 justify-center active:opacity-60"
        >
          <Text className="text-primary text-[16px] font-bold">Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}
