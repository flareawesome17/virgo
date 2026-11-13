import { Pressable, Text, View } from 'react-native';
import { useChrome } from '@/src/providers/ChromeProvider';

export interface PageTab<K extends string> {
  key: K;
  label: string;
  /** A count of things waiting, drawn as a pill beside the word. */
  badge?: number;
  /** Something waiting with no count worth giving. */
  dot?: boolean;
  /** Read out instead of the label, when the label alone says too little. */
  accessibilityLabel?: string;
}

/**
 * The pages of one screen: words in a row, with a line under the one you are
 * on.
 *
 * The Dashboard had these first (Home, Work, About, Settings). Jobs and
 * Connect did the same job with the segmented control, so two screens' pages
 * looked like a switch and one's looked like tabs. This is the one way to
 * move between a screen's pages. The segmented control stays for a switch
 * inside a page (Posts and Taste), and chips for narrowing a list.
 *
 * Left-aligned and as wide as their words, so four fit a phone and two do
 * not stretch across it.
 */
export function PageTabs<K extends string>({
  tabs,
  value,
  onChange,
}: {
  // Inside JSX the keys widen to string unless the call names its type:
  // `<PageTabs<typeof tab> …>`.
  tabs: PageTab<K>[];
  value: K;
  onChange: (key: K) => void;
}) {
  // A new page can be shorter than the screen, and a list that cannot scroll
  // cannot bring hidden bars back; so a switch brings them back.
  const { reveal } = useChrome();

  return (
    <View className="bg-background">
      <View accessibilityRole="tablist" className="flex-row gap-7 px-5 border-b border-border/50">
        {tabs.map((tab) => {
          const on = tab.key === value;
          const badge = tab.badge ?? 0;
          return (
            <Pressable
              key={tab.key}
              onPress={() => {
                if (on) return;
                onChange(tab.key);
                reveal();
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={
                (tab.accessibilityLabel ?? tab.label) +
                (badge > 0 ? `, ${badge} waiting` : tab.dot ? ', something waiting' : '')
              }
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
              {badge > 0 ? (
                <View className="min-w-[18px] h-[18px] items-center justify-center rounded-full bg-action px-1">
                  <Text allowFontScaling={false} className="text-action-foreground text-[11px] font-bold">
                    {badge > 99 ? '99+' : badge}
                  </Text>
                </View>
              ) : tab.dot ? (
                <View className="w-2 h-2 rounded-full bg-action" />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
