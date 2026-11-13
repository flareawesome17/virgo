import { PageTabs } from '@/components/PageTabs';

export type HomeTab = 'home' | 'work' | 'about' | 'settings';

export const HOME_TABS: readonly HomeTab[] = ['home', 'work', 'about', 'settings'];

/**
 * The Dashboard's four tabs: the part of it that stays.
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
    <PageTabs<HomeTab>
      tabs={[
        { key: 'home', label: 'Home' },
        { key: 'work', label: 'Work' },
        { key: 'about', label: 'About' },
        {
          key: 'settings',
          label: 'Settings',
          dot: rewards > 0,
          accessibilityLabel: rewards > 0 ? 'Settings, an offer is waiting' : undefined,
        },
      ]}
      value={value}
      onChange={onChange}
    />
  );
}
