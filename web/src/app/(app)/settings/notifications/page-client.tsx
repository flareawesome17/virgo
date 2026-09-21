'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell, PageHeader } from '@/components/app-shell';
import { CenteredSpinner } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  useNotificationSettings,
  useUpdateNotificationSetting,
} from '@/hooks/useNotifications';
import type { NotificationChannel, NotificationSetting } from '@/api';
import {
  CATEGORY_DESCRIPTIONS,
  CATEGORY_LABELS,
} from '@/lib/notification-categories';

const CHANNELS: { key: Exclude<NotificationChannel, 'desktop'>; label: string }[] = [
  { key: 'push', label: 'Phone' },
  { key: 'email', label: 'Email' },
];

/**
 * One cell: a switch, "Always" where it cannot be turned off, or a dash
 * where that kind never travels on that channel at all — a switch there
 * would do nothing, and one that does nothing is a lie.
 */
function Cell({
  row,
  channel,
  onChange,
}: {
  row: NotificationSetting;
  channel: Exclude<NotificationChannel, 'desktop'>;
  onChange: (enabled: boolean) => void;
}) {
  const value = row[channel];
  if (value === null) {
    return <span className="text-center text-sm text-muted-foreground" aria-label="Not sent">—</span>;
  }
  if (row.locked) {
    return <span className="text-center text-xs text-muted-foreground">Always</span>;
  }
  return (
    <span className="flex justify-center">
      <Switch
        checked={value}
        onCheckedChange={onChange}
        aria-label={`${CATEGORY_LABELS[row.category]} by ${channel === 'push' ? 'phone' : 'email'}`}
      />
    </span>
  );
}

/**
 * Which kinds of notification reach you, and where.
 *
 * The notification list keeps everything whatever is switched off here: these
 * choose only what follows you out of the app — to your phone, to your inbox.
 * Each switch saves as it moves.
 */
export default function NotificationSettingsPage() {
  const { settings, isLoading, loadFailed, refetch } = useNotificationSettings();
  const update = useUpdateNotificationSetting();

  const change = (row: NotificationSetting, channel: 'push' | 'email', enabled: boolean) =>
    update.mutate(
      { category: row.category, channel, enabled },
      { onError: () => toast.error('Could not save that. Try again.') },
    );

  return (
    <AppShell title="Notification settings">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Button asChild size="icon" variant="ghost" className="-ml-2 shrink-0">
              <Link href="/settings" aria-label="Back">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            Notifications
          </span>
        }
        description="Choose which kinds reach your phone and your inbox"
      />

      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        {isLoading ? (
          <CenteredSpinner />
        ) : loadFailed ? (
          <div className="rounded-xl border border-dashed py-14 text-center">
            <p className="text-sm font-medium">Could not load your settings</p>
            <p className="mt-1 text-xs text-muted-foreground">This is a connection problem.</p>
            <Button size="sm" variant="outline" className="mt-4" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,4.5rem)] items-center gap-2 border-b bg-secondary/60 px-4 py-3 text-xs font-semibold text-muted-foreground sm:grid-cols-[minmax(0,1fr)_repeat(3,6rem)] sm:px-5">
                <span>Kind</span>
                <span className="text-center">In the app</span>
                {CHANNELS.map((c) => (
                  <span key={c.key} className="text-center">
                    {c.label}
                  </span>
                ))}
              </div>
              <ul className="divide-y">
                {settings.map((row) => (
                  <li
                    key={row.category}
                    className="grid grid-cols-[minmax(0,1fr)_repeat(3,4.5rem)] items-center gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_repeat(3,6rem)] sm:px-5"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">
                        {CATEGORY_LABELS[row.category]}
                      </span>
                      <span className="block text-xs leading-relaxed text-muted-foreground">
                        {CATEGORY_DESCRIPTIONS[row.category]}
                      </span>
                    </span>
                    <span className="text-center text-xs text-muted-foreground">Always</span>
                    {CHANNELS.map((c) => (
                      <Cell
                        key={c.key}
                        row={row}
                        channel={c.key}
                        onChange={(enabled) => change(row, c.key, enabled)}
                      />
                    ))}
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Your notification list keeps everything for 90 days, whatever is switched
              off here. Phone notifications need the Virgo app on your phone. Only
              invitations, applications and enquiries are ever emailed.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}
