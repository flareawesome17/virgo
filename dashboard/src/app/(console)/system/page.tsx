'use client';

import { useHealth } from '@/hooks/useConsole';
import {
  DataState,
  PageHeader,
  StatStrip,
  StatusDot,
  bytes,
  num,
} from '@/components/console/primitives';
import { cn } from '@/lib/utils';

export default function SystemPage() {
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useHealth();

  return (
    <>
      <PageHeader
        title="System"
        description="Probed live, not read from configuration — the outage worth catching is the one where the config still looks perfect."
      />

      <DataState
        isLoading={isLoading}
        isError={isError}
        isEmpty={false}
        onRetry={() => void refetch()}
      >
        {data && (
          <div className="space-y-4">
            <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
              {Object.entries(data.services).map(([name, svc]) => (
                <div
                  key={name}
                  className={cn(
                    'relative bg-card px-4 py-3',
                    // The 3px stripe Termix puts on a host row: the state is
                    // readable from across the room.
                    'before:absolute before:inset-y-0 before:left-0 before:w-[3px]',
                    svc.ok ? 'before:bg-success' : 'before:bg-destructive',
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="caption">{name}</p>
                    <StatusDot tone={svc.ok ? 'ok' : 'danger'}>{svc.ok ? 'Up' : 'Down'}</StatusDot>
                  </div>
                  <p className="mt-1.5 break-words text-xs text-muted-foreground">{svc.detail}</p>
                </div>
              ))}
            </div>

            <StatStrip
              items={[
                { label: 'Stored files', value: num(data.storage.files) },
                { label: 'Total size', value: bytes(data.storage.bytes) },
                {
                  label: 'Images without a thumbnail',
                  value: num(data.storage.imagesWithoutThumbnail),
                  tone: data.storage.imagesWithoutThumbnail > 0 ? 'warn' : 'good',
                  hint:
                    data.storage.imagesWithoutThumbnail > 0
                      ? 'run backfill-thumbnails.mjs'
                      : 'all generated',
                },
                {
                  label: 'Push tokens',
                  value: num(data.pushTokens),
                  tone: data.pushTokens === 0 ? 'warn' : 'default',
                  hint: data.pushTokens === 0 ? 'push cannot work' : undefined,
                },
              ]}
            />

            <p className="text-xs text-muted-foreground">
              Checked in {data.checkedInMs}ms · {num(data.activeSessions)} active app sessions ·
              refreshed {new Date(dataUpdatedAt).toLocaleTimeString()}
            </p>
          </div>
        )}
      </DataState>
    </>
  );
}
