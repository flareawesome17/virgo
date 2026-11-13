import { Pressable, Text, View } from 'react-native';

export type HomeTab = 'home' | 'work' | 'about' | 'settings';

export const HOME_TABS: readonly HomeTab[] = ['home', 'work', 'about', 'settings'];

const TABS: { key: HomeTab; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'work', label: 'Work' },
  { key: 'about', label: 'About' },
  { key: 'settings', label: 'Settings' },
];

/**
 * The Dashboard's four tabs: the part of it that stays.
 *
 * Words with a line under the one you are on. They were a pill of icons with
 * labels, which is what the bottom bar is, so the screen read as having two
 * of them. Plain words say these are pages of this screen, not places in the
 * app.
 *
 * It is the scroll view's sticky header, so once the row above has gone up
 * it holds under the top bar, where the bar's mark has turned into your name
 * (DashboardMark).
 *
 * The rewards dot that sat on your photo in the top bar is on Settings, where
 * Rewards is.
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
    <View className="bg-background">
      <View accessibilityRole="tablist" className="flex-row gap-7 px-5 border-b border-border/50">
        {TABS.map((tab) => {
          const on = tab.key === value;
          const dot = tab.key === 'settings' && rewards > 0;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onChange(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={dot ? `${tab.label}, an offer is waiting` : tab.label}
              // The words are short; the slop takes each to 44pt across.
              hitSlop={{ left: 12, right: 12 }}
              className={`min-h-11 flex-row items-center gap-1.5 border-b-2 active:opacity-60 ${
                on ? 'border-primary' : 'border-transparent'
              }`}
              // Over the row's own hairline, so the line under the word
              // replaces it instead of sitting above it.
              style={{ marginBottom: -1 }}
            >
              <Text
                maxFontSizeMultiplier={1.3}
                className={`text-[15px] ${
                  on ? 'text-foreground font-bold' : 'text-muted-foreground font-medium'
                }`}
              >
                {tab.label}
              </Text>
              {dot && <View className="w-2 h-2 rounded-full bg-action" />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
