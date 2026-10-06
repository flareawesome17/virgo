'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { AdminUserRow, UserSort } from '@/api/console';
import { useUsers } from '@/hooks/useConsole';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  DataTable,
  FilterChips,
  type Column,
  type SortState,
} from '@/components/console/data-table';
import { PageHeader, StatusDot, bytes, num, when } from '@/components/console/primitives';
import { isPaused, isSuspended } from '@/lib/account-state';
import { Badge } from '@/components/ui/badge';

const PLANS = [
  { value: '', label: 'All plans' },
  { value: 'free', label: 'Free' },
  { value: 'freelance', label: 'Freelancer' },
  { value: 'studio', label: 'Studio' },
  { value: 'business', label: 'Business' },
];

function status(u: AdminUserRow) {
  if (isSuspended(u)) return { tone: 'danger', label: 'Suspended' } as const;
  if (isPaused(u)) return { tone: 'muted', label: 'Paused' } as const;
  if (!u.email_verified_at) return { tone: 'warn', label: 'Unverified' } as const;
  return { tone: 'ok', label: 'Active' } as const;
}

const COLUMNS: Column<AdminUserRow>[] = [
  {
    id: 'email',
    header: 'Account',
    sort: true,
    cell: (u) => (
      <Link href={`/virgo-users/${u.id}`} className="block min-w-0 max-w-72">
        <span className="block truncate font-medium">
          {u.display_name?.trim() || u.email.split('@')[0]}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
      </Link>
    ),
    csv: (u) => u.email,
  },
  {
    id: 'name',
    header: 'Name',
    defaultHidden: true,
    cell: (u) => u.display_name ?? '—',
    csv: (u) => u.display_name,
  },
  {
    id: 'handle',
    header: 'Handle',
    defaultHidden: true,
    cell: (u) => (u.handle ? `@${u.handle}` : '—'),
    csv: (u) => u.handle,
  },
  {
    id: 'plan',
    header: 'Plan',
    cell: (u) => (
      <Badge variant="secondary" className="capitalize">
        {u.plan}
      </Badge>
    ),
    csv: (u) => u.plan,
  },
  {
    id: 'storage',
    header: 'Storage used',
    sort: true,
    className: 'tabular-nums',
    cell: (u) => bytes(u.storage_bytes),
    csv: (u) => Number(u.storage_bytes),
  },
  {
    id: 'limit',
    header: 'Allowance',
    className: 'whitespace-nowrap tabular-nums',
    // What the account may actually store: the plan allowance plus anything a
    // claimed promo added. The plan badge alone does not answer this — a Free
    // account holding a 15 GB promo has twice the ceiling "Free" implies.
    cell: (u) => (
      <>
        {bytes(u.storage_limit_bytes)}
        {u.storage_bonus_bytes > 0 && (
          <span className="ml-1.5 text-xs text-muted-foreground">
            incl. {bytes(u.storage_bonus_bytes)} promo
          </span>
        )}
      </>
    ),
    csv: (u) => u.storage_limit_bytes,
  },
  {
    id: 'albums',
    header: 'Albums',
    sort: true,
    className: 'tabular-nums text-right',
    cell: (u) => num(u.albums),
    csv: (u) => u.albums,
  },
  {
    id: 'joined',
    header: 'Joined',
    sort: true,
    defaultHidden: true,
    cell: (u) => <span className="text-muted-foreground">{when(u.created_at)}</span>,
    csv: (u) => u.created_at,
  },
  {
    id: 'last_seen',
    header: 'Last seen',
    sort: true,
    cell: (u) => <span className="text-muted-foreground">{when(u.last_seen_at)}</span>,
    csv: (u) => u.last_seen_at,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (u) => {
      const s = status(u);
      return <StatusDot tone={s.tone}>{s.label}</StatusDot>;
    },
    csv: (u) => status(u).label,
  },
];

export default function VirgoUsersPage() {
  const [q, setQ] = useState('');
  // Sent once typing pauses, so the list does not refetch on every keystroke.
  const term = useDebouncedValue(q.trim(), 300);
  const [plan, setPlan] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'joined', dir: 'desc' });
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);

  const { data, isLoading, isError, isFetching, refetch } = useUsers({
    q: term || undefined,
    plan: plan || undefined,
    sort: sort.key as UserSort,
    dir: sort.dir,
    limit,
    offset,
  });

  return (
    <>
      <PageHeader
        title="Virgo users"
        description={
          data
            ? `${num(data.total)} ${term || plan ? 'matching accounts' : 'accounts on the platform'}. Not console access — see Users for that.`
            : 'Everyone with a Virgo account. Not console access — see Users for that.'
        }
      />

      <DataTable
        id="virgo-users"
        columns={COLUMNS}
        rows={data?.data}
        rowKey={(u) => u.id}
        rowHref={(u) => `/virgo-users/${u.id}`}
        isLoading={isLoading}
        isError={isError}
        isFetching={isFetching}
        onRetry={() => void refetch()}
        empty={term ? `No account matches “${term}”` : 'No accounts yet'}
        search={{
          value: q,
          onChange: (v) => {
            setQ(v);
            setOffset(0);
          },
          placeholder: 'Email, name or handle',
        }}
        filters={
          <FilterChips
            value={plan}
            onChange={(v) => {
              setPlan(v);
              setOffset(0);
            }}
            options={PLANS}
          />
        }
        sort={sort}
        onSortChange={(s) => {
          setSort(s);
          setOffset(0);
        }}
        pagination={{
          offset,
          limit,
          total: data?.total ?? 0,
          onOffsetChange: setOffset,
          onLimitChange: setLimit,
        }}
        exportName="virgo-users"
      />
    </>
  );
}
