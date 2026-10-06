'use client';

import Link from 'next/link';
import type {
  CustomerBilling,
  CustomerDetail,
  CustomerDevices,
  CustomerMarketplace,
  CustomerSafety,
} from '@/api/console';
import {
  useCustomerBilling,
  useCustomerDevices,
  useCustomerMarketplace,
  useCustomerSafety,
  useMe,
  useSignOutCustomer,
  useSignOutCustomerDevice,
} from '@/hooks/useConsole';
import { DataTable, type Column } from '@/components/console/data-table';
import {
  DataState,
  StatStrip,
  StatusDot,
  bytes,
  day,
  num,
  peso,
  when,
} from '@/components/console/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { describeAgent } from '@/lib/user-agent';

/** A small heading over a table inside a tab. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="caption mb-2">{title}</p>
      {children}
    </section>
  );
}

const PRIORITY_VARIANT: Record<string, 'destructive' | 'default' | 'secondary' | 'outline'> = {
  urgent: 'destructive',
  high: 'default',
  normal: 'secondary',
  low: 'outline',
};

// ─── Support ───────────────────────────────────────────────────────────────

type Ticket = CustomerDetail['tickets'][number];

const TICKET_COLUMNS: Column<Ticket>[] = [
  {
    id: 'subject',
    header: 'Subject',
    sort: (t) => t.subject,
    cell: (t) => <span className="font-medium">{t.subject}</span>,
  },
  {
    id: 'priority',
    header: 'Priority',
    cell: (t) => (
      <Badge variant={PRIORITY_VARIANT[t.priority] ?? 'secondary'} className="capitalize">
        {t.priority}
      </Badge>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    sort: (t) => t.status,
    cell: (t) => (
      <StatusDot tone={t.status === 'open' ? 'warn' : t.status === 'pending' ? 'info' : t.status === 'resolved' ? 'ok' : 'muted'}>
        <span className="capitalize">{t.status}</span>
      </StatusDot>
    ),
  },
  {
    id: 'opened',
    header: 'Opened',
    sort: (t) => t.created_at,
    cell: (t) => <span className="text-muted-foreground">{when(t.created_at)}</span>,
  },
];

export function SupportTab({ customer }: { customer: CustomerDetail }) {
  return (
    <DataTable
      id="customer-tickets"
      columns={TICKET_COLUMNS}
      rows={customer.tickets}
      rowKey={(t) => t.id}
      rowHref={(t) => `/support/${t.id}`}
      isLoading={false}
      isError={false}
      empty="No tickets from this account"
    />
  );
}

// ─── Content ───────────────────────────────────────────────────────────────

type Album = CustomerDetail['albums'][number];

export function ContentTab({ customer }: { customer: CustomerDetail }) {
  const workspaceName = new Map(customer.workspaces.map((w) => [w.id, w.name]));
  const columns: Column<Album>[] = [
    { id: 'name', header: 'Album', sort: (a) => a.name, cell: (a) => <span className="font-medium">{a.name}</span> },
    {
      id: 'workspace',
      header: 'Workspace',
      sort: (a) => workspaceName.get(a.workspace_id ?? '') ?? '',
      cell: (a) => <span className="text-muted-foreground">{workspaceName.get(a.workspace_id ?? '') ?? '—'}</span>,
    },
    { id: 'status', header: 'Status', sort: (a) => a.status, cell: (a) => <span className="capitalize text-muted-foreground">{a.status}</span> },
    { id: 'items', header: 'Items', sort: (a) => a.item_count, className: 'text-right tabular-nums', cell: (a) => num(a.item_count) },
    { id: 'size', header: 'Size', sort: (a) => Number(a.bytes ?? 0), className: 'text-right tabular-nums', cell: (a) => bytes(a.bytes) },
    { id: 'links', header: 'Live links', sort: (a) => a.share_links, className: 'text-right tabular-nums', cell: (a) => num(a.share_links) },
    { id: 'created', header: 'Created', sort: (a) => a.created_at, cell: (a) => <span className="text-muted-foreground">{when(a.created_at)}</span> },
  ];

  return (
    <div className="space-y-5">
      <Section title={`Workspaces · ${customer.workspaces.length}`}>
        {customer.workspaces.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {customer.workspaces.map((w) => (
              <span key={w.id} className="rounded-md border bg-card px-3 py-1.5 text-sm">
                {w.name}
                {w.archived_at && <span className="ml-2 text-xs text-muted-foreground">archived</span>}
              </span>
            ))}
          </div>
        )}
      </Section>
      <Section title={`Albums · ${customer.albums.length}`}>
        <DataTable
          id="customer-albums"
          columns={columns}
          rows={customer.albums}
          rowKey={(a) => a.id}
          isLoading={false}
          isError={false}
          empty="No albums yet"
          exportName="albums"
        />
      </Section>
    </div>
  );
}

// ─── Billing ───────────────────────────────────────────────────────────────

const SUB_COLUMNS: Column<CustomerBilling['subscriptions'][number]>[] = [
  { id: 'plan', header: 'Plan', cell: (s) => <span className="font-medium capitalize">{s.plan_name}</span> },
  { id: 'amount', header: 'Amount', className: 'text-right tabular-nums', cell: (s) => peso(Number(s.amount_minor)) },
  { id: 'kind', header: 'Kind', cell: (s) => <span className="text-muted-foreground">{s.kind === 'subscription' ? 'Recurring' : 'One month'}</span> },
  { id: 'status', header: 'Status', cell: (s) => <StatusDot tone={s.status === 'active' ? 'ok' : 'muted'}><span className="capitalize">{s.status}</span></StatusDot> },
  { id: 'ends', header: 'Period ends', cell: (s) => <span className="text-muted-foreground">{day(s.current_period_end)}</span> },
  { id: 'started', header: 'Started', cell: (s) => <span className="text-muted-foreground">{day(s.created_at)}</span> },
];

const PROMO_COLUMNS: Column<CustomerBilling['promos'][number]>[] = [
  {
    id: 'promo',
    header: 'Promo',
    cell: (p) => (
      <>
        <span className="block font-medium">{p.name}</span>
        {p.referred_name && <span className="block text-xs text-muted-foreground">earned when {p.referred_name} joined</span>}
      </>
    ),
  },
  {
    id: 'gives',
    header: 'Gives',
    cell: (p) =>
      [
        Number(p.storage_bytes) > 0 && bytes(p.storage_bytes),
        p.extra_workspaces > 0 && `+${p.extra_workspaces} workspaces`,
        p.extra_albums_per_workspace > 0 && `+${p.extra_albums_per_workspace} albums each`,
      ]
        .filter(Boolean)
        .join(' · ') || '—',
  },
  {
    id: 'status',
    header: 'Status',
    cell: (p) =>
      p.claimed_at ? (
        <StatusDot tone="ok">Claimed {when(p.claimed_at)}</StatusDot>
      ) : p.expires_at && new Date(p.expires_at) < new Date() ? (
        <StatusDot tone="muted">Expired</StatusDot>
      ) : (
        <StatusDot tone="info">Waiting</StatusDot>
      ),
  },
  { id: 'offered', header: 'Offered', cell: (p) => <span className="text-muted-foreground">{when(p.created_at)}</span> },
];

export function BillingTab({ id }: { id: string }) {
  const { data, isLoading, isError, refetch } = useCustomerBilling(id);
  return (
    <DataState isLoading={isLoading} isError={isError} isEmpty={false} onRetry={() => void refetch()}>
      {data && (
        <div className="space-y-5">
          <Section title="Subscriptions">
            <DataTable id="customer-subscriptions" columns={SUB_COLUMNS} rows={data.subscriptions} rowKey={(s) => s.id} isLoading={false} isError={false} empty="Never subscribed. Virgo is free for now." />
          </Section>
          <Section title="Promos">
            <DataTable id="customer-promos" columns={PROMO_COLUMNS} rows={data.promos} rowKey={(p) => p.id} isLoading={false} isError={false} empty="No promos offered" />
          </Section>
        </div>
      )}
    </DataState>
  );
}

// ─── Marketplace ───────────────────────────────────────────────────────────

function bookingState(b: CustomerMarketplace['bookings'][number]) {
  if (b.cancelled_at) return { tone: 'muted' as const, label: 'Cancelled' };
  if (b.locked_at || (b.poster_confirmed_at && b.creative_confirmed_at)) return { tone: 'ok' as const, label: 'Confirmed' };
  return { tone: 'warn' as const, label: 'Awaiting confirmation' };
}

export function MarketplaceTab({ id }: { id: string }) {
  const { data, isLoading, isError, refetch } = useCustomerMarketplace(id);

  const bookingColumns: Column<CustomerMarketplace['bookings'][number]>[] = [
    { id: 'role', header: 'Role', cell: (b) => <span className="font-medium capitalize">{b.role}</span> },
    {
      id: 'side',
      header: 'With',
      cell: (b) => (
        <Link href={`/virgo-users/${b.other_id}`} className="hover:underline">
          {b.side === 'hired' ? 'Hired ' : 'Booked by '}
          {b.other_name}
        </Link>
      ),
    },
    { id: 'date', header: 'Event', cell: (b) => <span className="text-muted-foreground">{day(b.event_date)}</span> },
    { id: 'rate', header: 'Rate', className: 'text-right tabular-nums', sort: (b) => b.rate_minor, cell: (b) => peso(b.rate_minor) },
    { id: 'state', header: 'Status', cell: (b) => { const s = bookingState(b); return <StatusDot tone={s.tone}>{s.label}</StatusDot>; } },
  ];
  const postColumns: Column<CustomerMarketplace['posts'][number]>[] = [
    { id: 'title', header: 'Job post', cell: (p) => <span className="font-medium">{p.title}</span> },
    { id: 'status', header: 'Status', cell: (p) => (p.hidden_at ? <StatusDot tone="danger">Hidden</StatusDot> : <StatusDot tone={p.status === 'open' ? 'ok' : 'muted'}><span className="capitalize">{p.status}</span></StatusDot>) },
    { id: 'applications', header: 'Applications', className: 'text-right tabular-nums', cell: (p) => num(p.applications) },
    { id: 'posted', header: 'Posted', cell: (p) => <span className="text-muted-foreground">{when(p.created_at)}</span> },
  ];
  const applicationColumns: Column<CustomerMarketplace['applications'][number]>[] = [
    { id: 'title', header: 'Applied to', cell: (a) => <span className="font-medium">{a.title}</span> },
    { id: 'poster', header: 'Posted by', cell: (a) => <Link href={`/virgo-users/${a.poster_id}`} className="hover:underline">{a.poster_name}</Link> },
    { id: 'status', header: 'Status', cell: (a) => <span className="capitalize text-muted-foreground">{a.status}</span> },
    { id: 'applied', header: 'Applied', cell: (a) => <span className="text-muted-foreground">{when(a.created_at)}</span> },
  ];
  const enquiryColumns: Column<CustomerMarketplace['enquiries'][number]>[] = [
    { id: 'role', header: 'For', cell: (e) => <span className="font-medium capitalize">{e.role_wanted ?? '—'}</span> },
    { id: 'with', header: 'With', cell: (e) => <Link href={`/virgo-users/${e.other_id}`} className="hover:underline">{e.direction === 'sent' ? 'Sent to ' : 'From '}{e.other_name}</Link> },
    { id: 'budget', header: 'Budget', cell: (e) => <span className="text-muted-foreground">{e.budget ?? '—'}</span> },
    { id: 'status', header: 'Status', cell: (e) => <span className="capitalize text-muted-foreground">{e.status}</span> },
    { id: 'when', header: 'When', cell: (e) => <span className="text-muted-foreground">{when(e.created_at)}</span> },
  ];

  return (
    <DataState isLoading={isLoading} isError={isError} isEmpty={false} onRetry={() => void refetch()}>
      {data && (
        <div className="space-y-5">
          <StatStrip
            items={[
              { label: 'Earned from bookings', value: peso(data.totals.earnedMinor), hint: 'as the creative, not cancelled' },
              { label: 'Spent on bookings', value: peso(data.totals.spentMinor), hint: 'as the poster, not cancelled' },
              { label: 'Bookings', value: num(data.bookings.length) },
              { label: 'Job posts', value: num(data.posts.length) },
            ]}
          />
          <Section title="Bookings">
            <DataTable id="customer-bookings" columns={bookingColumns} rows={data.bookings} rowKey={(b) => b.id} isLoading={false} isError={false} empty="No bookings" />
          </Section>
          <div className="grid gap-5 xl:grid-cols-2">
            <Section title="Job posts">
              <DataTable id="customer-posts" columns={postColumns} rows={data.posts} rowKey={(p) => p.id} isLoading={false} isError={false} empty="Has not posted a job" />
            </Section>
            <Section title="Applications">
              <DataTable id="customer-applications" columns={applicationColumns} rows={data.applications} rowKey={(a) => a.id} isLoading={false} isError={false} empty="Has not applied to a job" />
            </Section>
          </div>
          <Section title="Hire enquiries">
            <DataTable id="customer-enquiries" columns={enquiryColumns} rows={data.enquiries} rowKey={(e) => e.id} isLoading={false} isError={false} empty="No enquiries either way" />
          </Section>
        </div>
      )}
    </DataState>
  );
}

// ─── Safety ────────────────────────────────────────────────────────────────

export function SafetyTab({ id }: { id: string }) {
  const { data, isLoading, isError, refetch } = useCustomerSafety(id);

  const againstColumns: Column<CustomerSafety['against'][number]>[] = [
    { id: 'reason', header: 'Reason', cell: (r) => <span className="font-medium capitalize">{r.reason}</span> },
    { id: 'by', header: 'Reported by', cell: (r) => (r.reporter_id ? <Link href={`/virgo-users/${r.reporter_id}`} className="hover:underline">{r.reporter_name}</Link> : <span className="text-muted-foreground">a deleted account</span>) },
    { id: 'source', header: 'From', cell: (r) => <span className="text-muted-foreground">{r.source ?? '—'}</span> },
    { id: 'note', header: 'Note', cell: (r) => <span className="block max-w-md truncate text-muted-foreground" title={r.note ?? undefined}>{r.note ?? '—'}</span> },
    { id: 'when', header: 'When', cell: (r) => <span className="text-muted-foreground">{when(r.created_at)}</span> },
  ];
  const madeColumns: Column<CustomerSafety['made'][number]>[] = [
    { id: 'reason', header: 'Reason', cell: (r) => <span className="font-medium capitalize">{r.reason}</span> },
    { id: 'who', header: 'Reported', cell: (r) => <Link href={`/virgo-users/${r.target_id}`} className="hover:underline">{r.target_name}</Link> },
    { id: 'source', header: 'From', cell: (r) => <span className="text-muted-foreground">{r.source ?? '—'}</span> },
    { id: 'when', header: 'When', cell: (r) => <span className="text-muted-foreground">{when(r.created_at)}</span> },
  ];

  return (
    <DataState isLoading={isLoading} isError={isError} isEmpty={false} onRetry={() => void refetch()}>
      {data && (
        <div className="space-y-5">
          <StatStrip
            items={[
              { label: 'Reports against them', value: num(data.against.length), tone: data.against.length ? 'warn' : 'default' },
              { label: 'Blocked by', value: num(data.counts.blocked_by), hint: `they block ${num(data.counts.blocking)}` },
              { label: 'Reports on their posts', value: num(data.counts.post_reports + data.counts.job_reports), hint: `${num(data.counts.post_reports)} posts · ${num(data.counts.job_reports)} jobs` },
              { label: 'Taken down', value: num(data.counts.hidden_posts + data.counts.hidden_jobs), hint: `${num(data.counts.hidden_posts)} posts · ${num(data.counts.hidden_jobs)} jobs` },
            ]}
          />
          <Section title="Reports about them">
            <DataTable id="customer-reports-against" columns={againstColumns} rows={data.against} rowKey={(r) => r.id} isLoading={false} isError={false} empty="Nobody has reported them" />
          </Section>
          <Section title="Reports they made">
            <DataTable id="customer-reports-made" columns={madeColumns} rows={data.made} rowKey={(r) => r.id} isLoading={false} isError={false} empty="They have not reported anyone" />
          </Section>
        </div>
      )}
    </DataState>
  );
}

// ─── Devices ───────────────────────────────────────────────────────────────

export function DevicesTab({ id }: { id: string }) {
  const { can } = useMe();
  const { data, isLoading, isError, refetch } = useCustomerDevices(id);
  const signOutDevice = useSignOutCustomerDevice(id);
  const signOutAll = useSignOutCustomer(id);
  const security = can('users.security');

  const sessionColumns: Column<CustomerDevices['sessions'][number]>[] = [
    { id: 'device', header: 'Device', cell: (s) => <span className="font-medium">{describeAgent(s.user_agent)}</span> },
    { id: 'signedIn', header: 'Signed in', cell: (s) => <span className="text-muted-foreground" title={new Date(s.signed_in_at).toLocaleString()}>{when(s.signed_in_at)}</span> },
    { id: 'active', header: 'Last active', cell: (s) => <span className="text-muted-foreground" title={new Date(s.last_active_at).toLocaleString()}>{when(s.last_active_at)}</span> },
    ...(security
      ? [
          {
            id: 'out',
            header: '',
            className: 'text-right',
            cell: (s: CustomerDevices['sessions'][number]) => (
              <Button size="sm" variant="outline" disabled={signOutDevice.isPending} onClick={() => signOutDevice.mutate(s.family_id)}>
                Sign out
              </Button>
            ),
          } satisfies Column<CustomerDevices['sessions'][number]>,
        ]
      : []),
  ];
  const pushColumns: Column<CustomerDevices['push'][number]>[] = [
    { id: 'platform', header: 'Phone', cell: (p) => <span className="font-medium">{p.platform === 'ios' ? 'iPhone' : p.platform === 'android' ? 'Android' : p.platform}</span> },
    { id: 'version', header: 'App version', cell: (p) => <span className="font-mono text-xs">{p.app_version ?? '—'}</span> },
    { id: 'state', header: 'Push', cell: (p) => (p.disabled_at ? <StatusDot tone="muted">Off</StatusDot> : <StatusDot tone="ok">On</StatusDot>) },
    { id: 'updated', header: 'Last updated', cell: (p) => <span className="text-muted-foreground">{when(p.updated_at)}</span> },
  ];

  return (
    <DataState isLoading={isLoading} isError={isError} isEmpty={false} onRetry={() => void refetch()}>
      {data && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-xs text-muted-foreground">
              The kind of device each sign-in came from — never an IP address. Signing a device out ends
              its session; the app on it stops working within 15 minutes.
            </p>
            {security && data.sessions.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                disabled={signOutAll.isPending}
                onClick={() => confirm('Sign them out on every device?') && signOutAll.mutate(undefined)}
              >
                Sign out everywhere
              </Button>
            )}
          </div>
          <Section title={`Signed in · ${data.sessions.length}`}>
            <DataTable id="customer-sessions" columns={sessionColumns} rows={data.sessions} rowKey={(s) => s.family_id} isLoading={false} isError={false} empty="Not signed in anywhere" />
          </Section>
          <Section title="Phones with notifications">
            <DataTable id="customer-push" columns={pushColumns} rows={data.push} rowKey={(p) => p.id} isLoading={false} isError={false} empty="No phone has registered for notifications" />
          </Section>
        </div>
      )}
    </DataState>
  );
}
