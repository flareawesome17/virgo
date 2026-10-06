'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSubscriptions } from '@/hooks/useConsole';
import { DataTable, type Column } from '@/components/console/data-table';
import {
  PageHeader,
  StatStrip,
  StatusDot,
  day,
  num,
  peso,
} from '@/components/console/primitives';

type Row = Record<string, string | number | null>;

const COLUMNS: Column<Row>[] = [
  {
    id: 'account',
    header: 'Account',
    cell: (row) => (
      <Link href={`/virgo-users/${row.user_id}`} className="block min-w-0 max-w-72">
        <span className="block truncate font-medium">{String(row.user_name || row.user_email)}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {String(row.user_email)}
        </span>
      </Link>
    ),
    csv: (row) => row.user_email,
  },
  {
    id: 'plan',
    header: 'Plan',
    cell: (row) => <span className="capitalize">{String(row.plan_name)}</span>,
    csv: (row) => row.plan_name,
  },
  {
    id: 'amount',
    header: 'Amount',
    className: 'text-right tabular-nums',
    cell: (row) => peso(Number(row.amount_minor ?? 0)),
    csv: (row) => Number(row.amount_minor ?? 0) / 100,
  },
  {
    id: 'kind',
    header: 'Kind',
    cell: (row) => (
      <span className="text-muted-foreground">
        {row.kind === 'subscription' ? 'Recurring' : 'One month'}
      </span>
    ),
    csv: (row) => row.kind,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => (
      <StatusDot tone={row.status === 'active' ? 'ok' : 'muted'}>
        <span className="capitalize">{String(row.status)}</span>
      </StatusDot>
    ),
    csv: (row) => row.status,
  },
  {
    id: 'period',
    header: 'Period ends',
    cell: (row) => (
      <span className="text-muted-foreground">{day(row.current_period_end as string)}</span>
    ),
    csv: (row) => row.current_period_end,
  },
];

export default function BillingPage() {
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(50);
  const { data, isLoading, isError, isFetching, refetch } = useSubscriptions({ limit, offset });

  return (
    <>
      <PageHeader
        title="Billing"
        description="Subscriptions and what they are worth. Virgo is free for now, so this stays quiet until paid plans go on sale."
      />

      <StatStrip
        className="mb-4"
        items={[
          {
            label: 'Monthly recurring',
            value: data ? peso(data.mrrMinor) : '—',
            hint: 'active subscriptions only',
          },
          { label: 'Active', value: data ? num(data.activeCount) : '—' },
          { label: 'Records', value: data ? num(data.total) : '—' },
        ]}
      />

      <DataTable
        id="billing"
        columns={COLUMNS}
        rows={data?.data as Row[] | undefined}
        rowKey={(row) => String(row.id)}
        rowHref={(row) => `/virgo-users/${row.user_id}`}
        isLoading={isLoading}
        isError={isError}
        isFetching={isFetching}
        onRetry={() => void refetch()}
        empty="No subscriptions yet. Expected while Virgo is free."
        pagination={{
          offset,
          limit,
          total: data?.total ?? 0,
          onOffsetChange: setOffset,
          onLimitChange: setLimit,
        }}
        exportName="subscriptions"
      />
    </>
  );
}
