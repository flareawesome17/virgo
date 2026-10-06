'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Ticket } from '@/api/console';
import { useTickets } from '@/hooks/useConsole';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { DataTable, FilterChips, type Column } from '@/components/console/data-table';
import { PageHeader, StatusDot, when } from '@/components/console/primitives';
import { Badge } from '@/components/ui/badge';

const STATUSES = ['', 'open', 'pending', 'resolved', 'closed'] as const;
type Status = (typeof STATUSES)[number];

/** Urgency reads faster as colour than as a word in a column. */
const PRIORITY_VARIANT: Record<string, 'destructive' | 'default' | 'secondary' | 'outline'> = {
  urgent: 'destructive',
  high: 'default',
  normal: 'secondary',
  low: 'outline',
};

const STATUS_TONE = {
  open: 'warn',
  pending: 'info',
  resolved: 'ok',
  closed: 'muted',
} as const;

const COLUMNS: Column<Ticket>[] = [
  {
    id: 'subject',
    header: 'Subject',
    cell: (t) => (
      <Link href={`/support/${t.id}`} className="block min-w-0 max-w-96">
        <span className="block truncate font-medium">{t.subject}</span>
        <span className="block text-xs text-muted-foreground">
          {t.messages} message{t.messages === 1 ? '' : 's'}
        </span>
      </Link>
    ),
    csv: (t) => t.subject,
  },
  {
    id: 'from',
    header: 'From',
    cell: (t) => <span className="text-muted-foreground">{t.user_email}</span>,
    csv: (t) => t.user_email,
  },
  {
    id: 'priority',
    header: 'Priority',
    cell: (t) => (
      <Badge variant={PRIORITY_VARIANT[t.priority] ?? 'secondary'} className="capitalize">
        {t.priority}
      </Badge>
    ),
    csv: (t) => t.priority,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (t) => (
      <StatusDot tone={STATUS_TONE[t.status] ?? 'muted'}>
        <span className="capitalize">{t.status}</span>
      </StatusDot>
    ),
    csv: (t) => t.status,
  },
  {
    id: 'assigned',
    header: 'Assigned',
    cell: (t) => <span className="text-muted-foreground">{t.assigned_name ?? '—'}</span>,
    csv: (t) => t.assigned_name,
  },
  {
    id: 'opened',
    header: 'Opened',
    defaultHidden: true,
    cell: (t) => <span className="text-muted-foreground">{when(t.created_at)}</span>,
    csv: (t) => t.created_at,
  },
  {
    id: 'updated',
    header: 'Updated',
    cell: (t) => <span className="text-muted-foreground">{when(t.updated_at)}</span>,
    csv: (t) => t.updated_at,
  },
];

export default function SupportPage() {
  const [status, setStatus] = useState<Status>('');
  const [q, setQ] = useState('');
  const term = useDebouncedValue(q.trim(), 300);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);

  const { data, isLoading, isError, isFetching, refetch } = useTickets({
    status: status || undefined,
    q: term || undefined,
    limit,
    offset,
  });

  const counts = new Map((data?.counts ?? []).map((c) => [c.status, c.count] as const));

  return (
    <>
      <PageHeader
        title="Support"
        description="Tickets raised from inside the app, most urgent first. Replies reach the customer; internal notes never leave the console."
      />

      <DataTable
        id="support"
        columns={COLUMNS}
        rows={data?.data}
        rowKey={(t) => t.id}
        rowHref={(t) => `/support/${t.id}`}
        isLoading={isLoading}
        isError={isError}
        isFetching={isFetching}
        onRetry={() => void refetch()}
        empty={
          term
            ? `No ticket matches “${term}”`
            : status
              ? `No ${status} tickets`
              : 'Nobody has written in yet'
        }
        search={{
          value: q,
          onChange: (v) => {
            setQ(v);
            setOffset(0);
          },
          placeholder: 'Subject or email',
        }}
        filters={
          <FilterChips
            value={status}
            onChange={(v) => {
              setStatus(v);
              setOffset(0);
            }}
            options={STATUSES.map((s) => ({
              value: s,
              label: s ? s[0].toUpperCase() + s.slice(1) : 'All',
              count: s ? counts.get(s) : undefined,
            }))}
          />
        }
        pagination={{
          offset,
          limit,
          total: data?.total ?? 0,
          onOffsetChange: setOffset,
          onLimitChange: setLimit,
        }}
        exportName="support-tickets"
      />
    </>
  );
}
