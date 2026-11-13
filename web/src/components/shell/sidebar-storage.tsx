'use client';

import Link from 'next/link';
import { formatBytes } from '@/api';
import { useUsage } from '@/hooks/useUsage';
import { useStorageBreakdown } from '@/hooks/useStorageAdmin';

/**
 * How full your storage is, at the foot of the sidebar: one line and a bar,
 * in view from every page.
 *
 * It was a tile on the Dashboard, so it was only seen there. Split by what is
 * filling it: photographs in the app's own colour, films in blue.
 *
 * Nothing until the figures arrive: "0 B of 15 GB" before they do would be a
 * claim about the account, not a placeholder.
 */
export function SidebarStorage({ onNavigate }: { onNavigate?: () => void }) {
  const { usage } = useUsage();
  const { breakdown } = useStorageBreakdown();
  if (!usage) return null;

  const { usedBytes, limitBytes } = usage.storage;
  const scale = limitBytes ?? Math.max(usedBytes, 1);
  const bytesOf = (kind: string) => breakdown.byType.find((k) => k.kind === kind)?.bytes ?? 0;
  const films = bytesOf('video');
  // Everything that is not film reads as photographs: audio and the rest are
  // slivers, and a four-colour bar this size is noise.
  const rest = Math.max(usedBytes - films, 0);
  const percent = (bytes: number) => `${Math.min((bytes / scale) * 100, 100)}%`;

  return (
    <Link
      href="/settings/storage"
      onClick={onNavigate}
      aria-label={`Storage, ${formatBytes(usedBytes)}${limitBytes != null ? ` of ${formatBytes(limitBytes)}` : ''} used`}
      className="flex flex-col gap-2 rounded-xl bg-card p-3 ring-1 ring-border/60 transition-colors hover:ring-border"
    >
      <span className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold">Storage</span>
        <span className="truncate tabular-nums text-muted-foreground">
          {formatBytes(usedBytes)}
          {limitBytes != null ? ` of ${formatBytes(limitBytes)}` : ''}
        </span>
      </span>
      <span aria-hidden className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-muted">
        <span className="bg-primary" style={{ width: percent(rest) }} />
        {films > 0 && <span className="bg-info" style={{ width: percent(films) }} />}
      </span>
    </Link>
  );
}
