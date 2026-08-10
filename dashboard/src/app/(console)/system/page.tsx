'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import { useHealth } from '@/hooks/useConsole';
import {
  DataState,
  PageHeader,
  StatCard,
  bytes,
} from '@/components/console/primitives';
import { Card, CardContent } from '@/components/ui/card';

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
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {Object.entries(data.services).map(([name, svc]) => (
                <Card key={name}>
                  <CardContent className="flex items-start gap-3 p-4">
                    {svc.ok ? (
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                    ) : (
                      <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold capitalize">{name}</p>
                      <p className="mt-0.5 break-words text-xs text-muted-foreground">
                        {svc.detail}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Stored files" value={data.storage.files} />
              <StatCard label="Total size" value={bytes(data.storage.bytes)} />
              <StatCard
                label="Images without a thumbnail"
                value={data.storage.imagesWithoutThumbnail}
                tone={data.storage.imagesWithoutThumbnail > 0 ? 'warn' : 'good'}
                hint={
                  data.storage.imagesWithoutThumbnail > 0
                    ? 'run backfill-thumbnails.mjs'
                    : 'all generated'
                }
              />
              <StatCard
                label="Push tokens"
                value={data.pushTokens}
                tone={data.pushTokens === 0 ? 'warn' : 'default'}
                hint={data.pushTokens === 0 ? 'push cannot work' : undefined}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Checked in {data.checkedInMs}ms ·{' '}
              {data.activeSessions} active app sessions · refreshed{' '}
              {new Date(dataUpdatedAt).toLocaleTimeString()}
            </p>
          </div>
        )}
      </DataState>
    </>
  );
}
