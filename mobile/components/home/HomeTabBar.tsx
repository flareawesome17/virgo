import { Pressable, Text, View } from 'react-native';
import { HomeIcon, LayoutGridIcon, SettingsIcon, UserIcon, type LucideIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';

for (const Icon of [HomeIcon, LayoutGridIcon, SettingsIcon, UserIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

export type HomeTab = 'home' | 'work' | 'about' | 'settings';

export const HOME_TABS: readonly HomeTab[] = ['home', 'work', 'about', 'settings'];

const TABS: { key: HomeTab; label: string; icon: LucideIcon }[] = [
  { key: 'home', label: 'Home', icon: HomeIcon },
  { key: 'work', label: 'Work', icon: LayoutGridIcon },
  { key: 'about', label: 'About', icon: UserIcon },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];

/**
 * The Dashboard's four tabs: the part of it that stays.
 *
 * It is the scroll view's sticky header, so once the profile above has gone
 * up it holds under the top bar, where the bar's mark has turned into your
 * name (DashboardMark).
 *
 * The rewards count that sat on your photo in the top bar is on Settings,
 * where Rewards is.
 */
export function HomeTabBar({
  value,
  onChange,
  rewards,
}: {
  value: HomeTab;
  onChange: (tab: HomeTab) => void;
  rewards: number;
}) {
  return (
    <View className="bg-background px-5 pb-2">
      <View accessibilityRole="tablist" className="flex-row rounded-2xl bg-card border border-border/40 p-1">
        {TABS.map((tab) => {
          const on = tab.key === value;
          const Icon = tab.icon;
          const badge = tab.key === 'settings' ? rewards : 0;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onChange(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={badge > 0 ? `${tab.label}, an offer is waiting` : tab.label}
              className={`flex-1 min-h-12 items-center justify-center gap-0.5 rounded-xl ${on ? 'bg-primary/15' : 'active:bg-muted/40'}`}
            >
              <View>
                <Icon size={19} strokeWidth={on ? 2.4 : 2} className={on ? 'text-primary' : 'text-muted-foreground'} />
                {badge > 0 && (
                  <View className="absolute -right-1.5 -top-1 w-2.5 h-2.5 rounded-full bg-action border-2 border-card" />
                )}
              </View>
              <Text className={`text-[11px] ${on ? 'text-primary font-bold' : 'text-muted-foreground font-medium'}`}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
