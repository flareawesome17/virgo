import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { VirgoMark } from '@/components/AppTopBar';
import { RemoteImage } from '@/components/RemoteImage';
import { useAuth } from '@/src/hooks';

/**
 * The left of the top bar on the Dashboard: the mark, which becomes your
 * photo and name once your profile has scrolled up out of sight (`reveal`,
 * 0 to 1), so you can still tell whose page you are on with only the tabs
 * left of it.
 *
 * A cross-fade and nothing else: on a phone, text that slides while it fades
 * reads as the screen shaking.
 */
export function DashboardMark({ reveal }: { reveal: SharedValue<number> }) {
  const { user, profile } = useAuth();
  const name = profile?.displayName?.trim() || user?.email.split('@')[0] || '';
  const markStyle = useAnimatedStyle(() => ({ opacity: 1 - reveal.value }));
  const nameStyle = useAnimatedStyle(() => ({ opacity: reveal.value }));

  return (
    <View className="flex-1 justify-center">
      {/* Styles only on the animated layers: NativeWind does not reach
          Reanimated's components. */}
      <Animated.View style={markStyle}>
        <VirgoMark />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, nameStyle]}
      >
        <View className="flex-1 flex-row items-center gap-2.5 bg-background">
          {profile?.avatarUrl ? (
            <RemoteImage
              source={{ uri: profile.avatarUrl }}
              style={{ width: 28, height: 28, borderRadius: 14 }}
            />
          ) : (
            <View className="w-7 h-7 rounded-full bg-primary/15 items-center justify-center">
              <Text className="text-primary text-[13px] font-bold">{name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text className="flex-1 text-foreground text-[18px] font-bold tracking-tight" numberOfLines={1}>
            {name}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}
