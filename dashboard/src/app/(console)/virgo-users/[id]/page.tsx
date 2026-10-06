'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import {
  useMe,
  usePresence,
  useSetUserDisabled,
  useSetUserPlan,
  useUser,
} from '@/hooks/useConsole';
import { PresenceBar } from '@/components/console/presence';
import { DataTable, type Column } from '@/components/console/data-table';
import {
  DataState,
  Field,
  Panel,
  StatStrip,
  bytes,
  day,
  num,
  peso,
  when,
} from '@/components/console/primitives';
import { useRecordTab } from '@/components/console/record-tabs';
import { isPaused, isSuspended } from '@/lib/account-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Used only when the API is older than the list it now sends. */
const FALLBACK_PLANS = [
  { name: 'free', label: 'Free' },
  { name: 'freelance', label: 'Freelancer' },
  { name: 'studio', label: 'Studio' },
  { name: 'business', label: 'Business' },
];

const PRIORITY_VARIANT: Record<string, 'destructive' | 'default' | 'secondary' | 'outline'> = {
  urgent: 'destructive',
  high: 'default',
  normal: 'secondary',
  low: 'outline',
};

interface UserDetail {
  user: Record<string, string | boolean | null> & {
    disabled_at: string | null;
    /** Absent, not null, from an API older than suspensions. See isSuspended. */
    suspended_at?: string | null;
    disabled_until?: string | null;
  };
  storage: { bytes: number; files: number; limitBytes: number | null };
  limits: { workspaces: number | null; albumsPerWorkspace: number | null };
  workspaces: { id: string; name: string; created_at: string }[];
  albums: {
    id: string;
    name: string;
    status: string;
    item_count: number;
    share_links: number;
    created_at: string;
  }[];
  /** The latest one, whatever its status. */
  subscription: {
    id: string;
    plan_name: string;
    status: string;
    amount_minor: number | string;
    currency: string;
    kind: 'subscription' | 'one_time';
    current_period_end: string | null;
    cancelled_at: string | null;
    created_at: string;
  } | null;
  /** The latest 10. */
  tickets: {
    id: string;
    subject: string;
    status: string;
    priority: string;
    created_at: string;
  }[];
  /** What the plan picker may offer. Absent from an API older than it. */
  plans?: { name: string; label: string }[];
}

type Album = UserDetail['albums'][number];

/** Every album is already loaded, so these sort on the page. */
const ALBUM_COLUMNS: Column<Album>[] = [
  {
    id: 'name',
    header: 'Name',
    sort: (a) => a.name,
    cell: (a) => <span className="font-medium">{a.name}</span>,
  },
  {
    id: 'status',
    header: 'Status',
    sort: (a) => a.status,
    cell: (a) => <span className="capitalize text-muted-foreground">{a.status}</span>,
  },
  {
    id: 'items',
    header: 'Items',
    sort: (a) => a.item_count,
    className: 'text-right tabular-nums',
    cell: (a) => num(a.item_count),
  },
  {
    id: 'links',
    header: 'Live links',
    sort: (a) => a.share_links,
    className: 'text-right tabular-nums',
    cell: (a) => num(a.share_links),
  },
  {
    id: 'created',
    header: 'Created',
    sort: (a) => a.created_at,
    cell: (a) => <span className="text-muted-foreground">{when(a.created_at)}</span>,
  },
];

export default function VirgoUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useMe();
  const { data, isLoading, isError, refetch } = useUser(id);
  const setDisabled = useSetUserDisabled(id);
  const setPlan = useSetUserPlan(id);
  const [reason, setReason] = useState('');

  const d = data as unknown as UserDetail | undefined;
  const u = d?.user;
  const suspended = !!u && isSuspended(u);
  // Shown beside a suspension rather than instead of it: restoring access
  // does not end a pause the person chose, and the console should not look
  // as if it had.
  const paused = !!u && isPaused(u);
  const name = u ? String(u.display_name || u.email || 'Account') : undefined;

  useRecordTab({ href: `/virgo-users/${id}`, kind: 'user', title: name });
  const others = usePresence('user', id);

  // An account can carry a plan the catalogue no longer lists — `pro`, the old
  // name for Freelancer. Offered as-is, so the picker shows what it has rather
  // than going blank.
  const plans = d?.plans ?? FALLBACK_PLANS;
  const planOptions =
    u && !plans.some((p) => p.name === u.plan)
      ? [...plans, { name: String(u.plan), label: String(u.plan) }]
      : plans;

  return (
    <>
      <Link
        href="/virgo-users"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Virgo users
      </Link>

      <DataState
        isLoading={isLoading}
        isError={isError}
        isEmpty={false}
        onRetry={() => void refetch()}
      >
        {d && u && (
          <div className="space-y-4">
            <header className="flex flex-wrap items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                {(name ?? '?').slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-semibold tracking-tight">{name}</h1>
                <p className="truncate text-sm text-muted-foreground">
                  {String(u.email)}
                  {u.handle ? ` · @${String(u.handle)}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <PresenceBar others={others} />
                <Badge variant="secondary" className="capitalize">
                  {String(u.plan)}
                </Badge>
                {suspended && <Badge variant="destructive">Suspended</Badge>}
                {paused && <Badge variant="outline">Paused</Badge>}
              </div>
            </header>

            <StatStrip
              items={[
                {
                  label: 'Storage',
                  value: bytes(d.storage.bytes),
                  hint: d.storage.limitBytes ? `of ${bytes(d.storage.limitBytes)}` : 'unlimited',
                },
                { label: 'Files', value: num(d.storage.files) },
                {
                  label: 'Workspaces',
                  value: num(d.workspaces.length),
                  hint:
                    d.limits.workspaces === null ? 'unlimited' : `limit ${d.limits.workspaces}`,
                },
                { label: 'Albums', value: num(d.albums.length) },
              ]}
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Account" bodyClassName="py-2">
                <Field label="Joined" value={when(u.created_at as string)} />
                <Field label="Last seen" value={when(u.last_seen_at as string)} />
                <Field label="Email verified" value={u.email_verified_at ? 'Yes' : 'No'} />
                <Field label="Handle" value={(u.handle as string) || '—'} />
                <Field label="Public profile" value={u.public_profile ? 'Published' : 'Private'} />
                <Field label="Discoverable" value={u.discoverable ? 'Yes' : 'No'} />
                <Field label="Location" value={(u.location as string) || '—'} />
              </Panel>

              <Panel title="Actions" bodyClassName="space-y-4">
                {can('users.setPlan') ? (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Plan</p>
                    <Select value={String(u.plan)} onValueChange={(v) => setPlan.mutate(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {planOptions.map((p) => (
                          <SelectItem key={p.name} value={p.name} className="capitalize">
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Changes limits immediately. No payment is taken and no subscription is
                      created.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Your role cannot change plans.</p>
                )}

                {can('users.disable') && (
                  <div className="border-t pt-4">
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Access</p>
                    {!suspended && (
                      <Input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Reason (recorded in the audit log)"
                        className="mb-2"
                      />
                    )}
                    <Button
                      variant={suspended ? 'secondary' : 'destructive'}
                      size="sm"
                      disabled={setDisabled.isPending}
                      onClick={() =>
                        setDisabled.mutate({
                          disabled: !suspended,
                          reason: reason || undefined,
                        })
                      }
                    >
                      {suspended ? 'Restore access' : 'Suspend account'}
                    </Button>
                    {/* Said here because it was not always true: the old
                        switch only stamped a column nothing enforced. The
                        15 minutes is the life of an access token already
                        issued; refresh and sign-in are refused at once. */}
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {suspended
                        ? 'Lets them sign in again. '
                        : 'Signs them out everywhere within 15 minutes and stops them signing back in. '}
                      Their media is untouched either way.
                    </p>
                  </div>
                )}
              </Panel>

              <Panel title="Subscription" bodyClassName="py-2">
                {d.subscription ? (
                  <>
                    <Field label="Plan" value={d.subscription.plan_name} />
                    <Field label="Status" value={d.subscription.status} />
                    <Field
                      label="Amount"
                      value={`${peso(Number(d.subscription.amount_minor))} · ${
                        d.subscription.kind === 'subscription' ? 'monthly' : 'one month'
                      }`}
                    />
                    <Field label="Period ends" value={day(d.subscription.current_period_end)} />
                    {d.subscription.cancelled_at && (
                      <Field label="Cancelled" value={day(d.subscription.cancelled_at)} />
                    )}
                    <Field label="Started" value={day(d.subscription.created_at)} />
                  </>
                ) : (
                  <p className="py-1 text-xs text-muted-foreground">
                    Never subscribed. Their plan was set at sign-up or here.
                  </p>
                )}
              </Panel>

              <Panel
                title={d.tickets.length === 10 ? 'Support tickets · latest 10' : 'Support tickets'}
                bodyClassName="p-1.5"
              >
                {d.tickets.length === 0 ? (
                  <p className="px-2.5 py-2 text-xs text-muted-foreground">No tickets.</p>
                ) : (
                  <ul className="space-y-0.5">
                    {d.tickets.map((t) => {
                      const row = (
                        <>
                          <span className="min-w-0 flex-1 truncate font-medium">{t.subject}</span>
                          {(t.priority === 'high' || t.priority === 'urgent') && (
                            <Badge variant={PRIORITY_VARIANT[t.priority]} className="capitalize">
                              {t.priority}
                            </Badge>
                          )}
                          <Badge variant="outline" className="capitalize">
                            {t.status}
                          </Badge>
                          <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                            {when(t.created_at)}
                          </span>
                        </>
                      );
                      return (
                        <li key={t.id}>
                          {can('support.read') ? (
                            <Link
                              href={`/support/${t.id}`}
                              className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-muted"
                            >
                              {row}
                            </Link>
                          ) : (
                            <div className="flex items-center gap-2 px-2.5 py-1.5 text-sm">
                              {row}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
            </div>

            {d.albums.length > 0 && (
              <section>
                <p className="caption mb-2">Albums</p>
                <DataTable
                  id="user-albums"
                  columns={ALBUM_COLUMNS}
                  rows={d.albums}
                  rowKey={(a) => a.id}
                  isLoading={false}
                  isError={false}
                />
              </section>
            )}
          </div>
        )}
      </DataState>
    </>
  );
}
