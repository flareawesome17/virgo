'use client';

import Link from 'next/link';
import { formatBytes } from '@/api';
import { useOnline } from '@/hooks/useOnline';
import { useUsage } from '@/hooks/useUsage';
import { RELEASE_LABEL } from '@/lib/version';
import { summarize } from '@/components/upload/upload-dock-state';
import { useUploadQueue } from '@/components/upload/upload-provider';

/**
 * The strip along the foot of the desktop window: the state of the machine,
 * in view from every page.
 *
 * Whether the app can reach Virgo, what is uploading, how full storage is and
 * which release is running. Each was somewhere else — a banner, the upload
 * dock, a Dashboard tile, the foot of the account menu — and a desktop app is
 * expected to say these things where a glance finds them.
 *
 * Only what the app already knows. It says "Online", not "Synced": nothing
 * here tracks a last sync.
 */
export function DesktopStatusBar() {
  const online = useOnline();
  const { usage } = useUsage();
  const { items, checking } = useUploadQueue();
  const uploads = summarize(items);
  const running = uploads.uploading + uploads.queued;

  return (
    <footer className="dark flex h-7 shrink-0 select-none items-center gap-4 px-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className={`size-[7px] rounded-full ${online ? 'bg-success' : 'bg-destructive'}`}
        />
        {online ? 'Online' : 'Offline'}
      </span>

      {checking > 0 ? (
        <span className="tabular-nums">Checking {checking.toLocaleString()} for duplicates</span>
      ) : running > 0 ? (
        <span className="tabular-nums">
          Uploading {uploads.done.toLocaleString()} of {uploads.total.toLocaleString()} ·{' '}
          {Math.round(uploads.fraction * 100)}%
        </span>
      ) : uploads.failed > 0 ? (
        <span className="tabular-nums text-destructive">
          {uploads.failed.toLocaleString()} upload{uploads.failed === 1 ? '' : 's'} failed
        </span>
      ) : null}

      <span className="flex-1" />

      {usage && (
        <Link
          href="/settings/storage"
          className="tabular-nums transition-colors hover:text-foreground"
        >
          Storage {formatBytes(usage.storage.usedBytes)}
          {usage.storage.limitBytes != null ? ` of ${formatBytes(usage.storage.limitBytes)}` : ''}
        </Link>
      )}
      {RELEASE_LABEL && <span className="tabular-nums">{RELEASE_LABEL}</span>}
    </footer>
  );
}
