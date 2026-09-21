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

const CHANNELS: { key: NotificationChannel; label: string; spoken: string }[] = [
  { key: 'push', label: 'Phone', spoken: 'on your phone' },
  { key: 'email', label: 'Email', spoken: 'by email' },
  { key: 'desktop', label: 'Desktop', spoken: 'as desktop alerts' },
];

/** Kind, then In the app (from `sm` up), then one column per channel. */
const ROW_GRID =
  'grid grid-cols-[minmax(0,1fr)_repeat(3,4rem)] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_repeat(4,5.5rem)]';

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
  channel: (typeof CHANNELS)[number];
  onChange: (enabled: boolean) => void;
}) {
  const value = row[channel.key];
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
        aria-label={`${CATEGORY_LABELS[row.category]} ${channel.spoken}`}
      />
    </span>
  );
}

/**
 * Which kinds of notification reach you, and where.
 *
 * The notification list keeps everything whatever is switched off here: these
 * choose only what follows you out of the app — to your phone, to your inbox,
 * to this computer's notification centre. Each switch saves as it moves.
 */
export default function NotificationSettingsPage() {
  const { settings, isLoading, loadFailed, refetch } = useNotificationSettings();
  const update = useUpdateNotificationSetting();

  const change = (row: NotificationSetting, channel: NotificationChannel, enabled: boolean) =>
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
        description="Choose which kinds reach your phone, your inbox and this computer"
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
              <div className={`${ROW_GRID} border-b bg-secondary/60 px-4 py-3 text-xs font-semibold text-muted-foreground sm:px-5`}>
                <span>Kind</span>
                <span className="hidden text-center sm:block">In the app</span>
                {CHANNELS.map((c) => (
                  <span key={c.key} className="text-center">
                    {c.label}
                  </span>
                ))}
              </div>
              <ul className="divide-y">
                {settings.map((row) => (
                  <li key={row.category} className={`${ROW_GRID} px-4 py-3 sm:px-5`}>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">
                        {CATEGORY_LABELS[row.category]}
                      </span>
                      <span className="block text-xs leading-relaxed text-muted-foreground">
                        {CATEGORY_DESCRIPTIONS[row.category]}
                      </span>
                    </span>
                    <span className="hidden text-center text-xs text-muted-foreground sm:block">
                      Always
                    </span>
                    {CHANNELS.map((c) => (
                      <Cell
                        key={c.key}
                        row={row}
                        channel={c}
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
              invitations, applications and enquiries are ever emailed. Desktop alerts
              show on this computer while Virgo is in the background — in the desktop
              app, or in a browser once Desktop notifications is on in Settings.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}
