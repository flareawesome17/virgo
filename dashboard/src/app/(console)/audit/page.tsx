'use client';

import { useState } from 'react';
import { useAudit } from '@/hooks/useConsole';
import { DataTable, type Column } from '@/components/console/data-table';
import { PageHeader, when } from '@/components/console/primitives';
import { Badge } from '@/components/ui/badge';

/** Destructive actions should be findable at a glance. */
const LOUD = ['user.disable', 'admin.delete', 'admin.disable', 'job.hide', 'shareLink.revoke'];

interface Entry {
  id: string;
  admin_email: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

const COLUMNS: Column<Entry>[] = [
  {
    id: 'when',
    header: 'When',
    cell: (e) => (
      <span className="whitespace-nowrap text-muted-foreground" title={new Date(e.created_at).toLocaleString()}>
        {when(e.created_at)}
      </span>
    ),
    csv: (e) => e.created_at,
  },
  {
    id: 'who',
    header: 'Who',
    cell: (e) => <span className="font-medium">{e.admin_email}</span>,
    csv: (e) => e.admin_email,
  },
  {
    id: 'action',
    header: 'Action',
    cell: (e) => (
      <Badge
        variant={LOUD.includes(e.action) ? 'destructive' : 'secondary'}
        className="font-mono text-[11px]"
      >
        {e.action}
      </Badge>
    ),
    csv: (e) => e.action,
  },
  {
    id: 'target',
    header: 'Target',
    cell: (e) =>
      e.target_type ? (
        <span className="whitespace-nowrap text-muted-foreground" title={e.target_id ?? undefined}>
          {e.target_type}
          {e.target_id ? ` ${e.target_id.slice(0, 8)}` : ''}
        </span>
      ) : (
        '—'
      ),
    csv: (e) => (e.target_type ? `${e.target_type} ${e.target_id ?? ''}`.trim() : ''),
  },
  {
    id: 'detail',
    header: 'Detail',
    cell: (e) =>
      Object.keys(e.detail ?? {}).length > 0 ? (
        <code className="block max-w-md truncate rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {JSON.stringify(e.detail)}
        </code>
      ) : null,
    csv: (e) => JSON.stringify(e.detail ?? {}),
  },
];

export default function AuditPage() {
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(50);
  const { data, isLoading, isError, isFetching, refetch } = useAudit({ limit, offset });

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every write a console account has made, newest first. Append-only — nothing here can be edited or deleted from the console."
      />

      <DataTable
        id="audit"
        columns={COLUMNS}
        rows={data?.data}
        rowKey={(e) => e.id}
        isLoading={isLoading}
        isError={isError}
        isFetching={isFetching}
        onRetry={() => void refetch()}
        empty="No console actions recorded yet"
        pagination={{
          offset,
          limit,
          total: data?.total ?? 0,
          onOffsetChange: setOffset,
          onLimitChange: setLimit,
        }}
        exportName="audit-log"
      />
    </>
  );
}
