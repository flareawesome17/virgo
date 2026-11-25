'use client';

import { todayIso } from '@/api';
import { PageTabs } from '@/components/kit';
import { useOwed } from '@/components/money/money-bits';

export const MONEY_TABS = ['activity', 'owed', 'savings', 'insights'] as const;
export type MoneyTab = (typeof MONEY_TABS)[number];

/** Where each of Money's pages lives: three on /money, Insights on a page of its own. */
export function moneyTabHref(tab: MoneyTab): string {
  if (tab === 'insights') return '/money/insights';
  return tab === 'activity' ? '/money' : `/money?tab=${tab}`;
}

/**
 * Money's four pages, as on the phone. Owed carries how many payments are
 * still waiting, so the number is there whichever page is open.
 */
export function MoneyTabs({
  value,
  onChange,
  dense = false,
}: {
  value: MoneyTab;
  onChange: (tab: MoneyTab) => void;
  /** In the desktop app's bar, straight after the page's name. */
  dense?: boolean;
}) {
  const owed = useOwed(todayIso());
  return (
    <PageTabs<MoneyTab>
      label="Money pages"
      tabs={[
        { key: 'activity', label: 'Activity' },
        { key: 'owed', label: 'Owed', count: owed.toYou.length },
        { key: 'savings', label: 'Savings' },
        { key: 'insights', label: 'Insights' },
      ]}
      value={value}
      onChange={onChange}
      dense={dense}
    />
  );
}
