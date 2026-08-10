'use client';

import { useState } from 'react';
import { useAudit } from '@/hooks/useConsole';
import { DataState, PageHeader, when } from '@/components/console/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const PAGE = 50;

/** Destructive actions should be findable at a glance. */
const LOUD = ['user.disable', 'admin.delete', 'admin.disable', 'job.hide', 'shareLink.revoke'];

export default function AuditPage() {
  const [offset, setOffset] = useState(0);
  const { data, isLoading, isError, refetch } = useAudit({ limit: PAGE, offset });

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every write a console account has made. Append-only — nothing here can be edited or deleted from the console."
      />

      <DataState
        isLoading={isLoading}
        isError={isError}
        isEmpty={!!data && data.data.length === 0}
        emptyLabel="No console actions recorded yet"
        onRetry={() => void refetch()}
      >
        <div className="space-y-1.5">
          {data?.data.map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-sm"
            >
              <Badge
                variant={LOUD.includes(e.action) ? 'destructive' : 'secondary'}
                className="font-mono text-[11px]"
              >
                {e.action}
              </Badge>
              <span className="font-medium">{e.admin_email}</span>
              {e.target_type && (
                <span className="text-muted-foreground">
                  {e.target_type}
                  {e.target_id ? ` ${e.target_id.slice(0, 8)}` : ''}
                </span>
              )}
              {Object.keys(e.detail ?? {}).length > 0 && (
                <code className="truncate rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {JSON.stringify(e.detail)}
                </code>
              )}
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {when(e.created_at)}
              </span>
            </div>
          ))}
        </div>

        {!!data && data.total > PAGE && (
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {offset + 1}–{Math.min(offset + PAGE, data.total)} of {data.total}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={offset + PAGE >= data.total}
                onClick={() => setOffset(offset + PAGE)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </DataState>
    </>
  );
}
