import { Pressable, Text, View } from 'react-native';
import { CheckIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { BottomSheet } from '@/components/BottomSheet';
import { MEDIA_AUTO_LOAD_LABEL, type MediaAutoLoad } from '@/src/api';
import { useMediaAutoLoad } from '@/src/hooks/useConnectionQuality';

cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const CHOICES: readonly MediaAutoLoad[] = ['fast', 'always', 'tap'];

/**
 * When photos, films, voice notes and link pictures load by themselves: on
 * Wi-Fi and fast data, always, or only when tapped. Kept on this phone.
 */
export function MediaAutoLoadSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { setting, setSetting } = useMediaAutoLoad();
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View className="px-5 pt-2 pb-5">
        <Text className="text-foreground text-[17px] leading-6 font-bold" accessibilityRole="header">
          Load photos, films and voice notes automatically
        </Text>
        <Text className="text-muted-foreground text-[13px] leading-[18px] mt-1">
          Anything that does not load by itself waits for a tap, so messages
          come first on a weak or costly signal. Kept on this phone only.
        </Text>
        <View className="mt-4" accessibilityRole="radiogroup">
          {CHOICES.map((choice, i) => {
            const on = setting === choice;
            return (
              <Pressable
                key={choice}
                onPress={() => {
                  setSetting(choice);
                  onClose();
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                className={`min-h-[52px] flex-row items-center gap-3 active:opacity-60 ${
                  i < CHOICES.length - 1 ? 'border-b border-border/40' : ''
                }`}
              >
                <Text className="flex-1 text-foreground text-[15px] leading-5">
                  {MEDIA_AUTO_LOAD_LABEL[choice]}
                </Text>
                {on ? <CheckIcon size={18} className="text-primary" /> : null}
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          className="mt-4 bg-muted rounded-[14px] h-11 items-center justify-center active:scale-[0.97]"
        >
          <Text className="text-foreground text-[15px] font-semibold">Done</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
