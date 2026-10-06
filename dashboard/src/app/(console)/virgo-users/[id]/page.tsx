'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import {
  useMe,
  useSetUserDisabled,
  useSetUserPlan,
  useUser,
} from '@/hooks/useConsole';
import {
  DataState,
  PageHeader,
  StatCard,
  bytes,
  day,
  peso,
  when,
} from '@/components/console/primitives';
import { isPaused, isSuspended } from '@/lib/account-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Virgo users
      </Link>

      <DataState
        isLoading={isLoading}
        isError={isError}
        isEmpty={false}
        onRetry={() => void refetch()}
      >
        {d && u && (
          <>
            <PageHeader
              title={String(u.display_name || u.email || 'Account')}
              description={String(u.email)}
              action={
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="capitalize">
                    {String(u.plan)}
                  </Badge>
                  {suspended && <Badge variant="destructive">Suspended</Badge>}
                  {paused && <Badge variant="outline">Paused</Badge>}
                </div>
              }
            />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="Storage"
                value={bytes(d.storage.bytes)}
                hint={
                  d.storage.limitBytes
                    ? `of ${bytes(d.storage.limitBytes)}`
                    : 'unlimited'
                }
              />
              <StatCard label="Files" value={d.storage.files} />
              <StatCard
                label="Workspaces"
                value={d.workspaces.length}
                hint={
                  d.limits.workspaces === null
                    ? 'unlimited'
                    : `limit ${d.limits.workspaces}`
                }
              />
              <StatCard label="Albums" value={d.albums.length} />
            </div>

            <div className="mt-6 grid gap-3 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Account</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 p-4 pt-0 text-sm">
                  <Field label="Joined" value={when(u.created_at as string)} />
                  <Field label="Last seen" value={when(u.last_seen_at as string)} />
                  <Field
                    label="Email verified"
                    value={u.email_verified_at ? 'Yes' : 'No'}
                  />
                  <Field label="Handle" value={(u.handle as string) || '—'} />
                  <Field
                    label="Public profile"
                    value={u.public_profile ? 'Published' : 'Private'}
                  />
                  <Field
                    label="Discoverable"
                    value={u.discoverable ? 'Yes' : 'No'}
                  />
                  <Field label="Location" value={(u.location as string) || '—'} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 p-4 pt-0">
                  {can('users.setPlan') ? (
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                        Plan
                      </p>
                      <Select
                        value={String(u.plan)}
                        onValueChange={(v) => setPlan.mutate(v)}
                      >
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
                        Changes limits immediately. No payment is taken and no
                        subscription is created.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Your role cannot change plans.
                    </p>
                  )}

                  {can('users.disable') && (
                    <div className="border-t pt-4">
                      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                        Access
                      </p>
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
                </CardContent>
              </Card>
            </div>

            <div className="mt-6 grid gap-3 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Subscription</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 p-4 pt-0 text-sm">
                  {d.subscription ? (
                    <>
                      <Field
                        label="Plan"
                        value={String(d.subscription.plan_name)}
                      />
                      <Field label="Status" value={d.subscription.status} />
                      <Field
                        label="Amount"
                        value={`${peso(Number(d.subscription.amount_minor))} · ${
                          d.subscription.kind === 'subscription'
                            ? 'monthly'
                            : 'one month'
                        }`}
                      />
                      <Field
                        label="Period ends"
                        value={day(d.subscription.current_period_end)}
                      />
                      {d.subscription.cancelled_at && (
                        <Field
                          label="Cancelled"
                          value={day(d.subscription.cancelled_at)}
                        />
                      )}
                      <Field label="Started" value={day(d.subscription.created_at)} />
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Never subscribed. Their plan was set at sign-up or here.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    Support tickets
                    {d.tickets.length === 10 && (
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        · latest 10
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 text-sm">
                  {d.tickets.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No tickets.</p>
                  ) : (
                    <ul className="-mx-2 space-y-0.5">
                      {d.tickets.map((t) => {
                        const row = (
                          <>
                            <span className="min-w-0 flex-1 truncate font-medium">
                              {t.subject}
                            </span>
                            {(t.priority === 'high' || t.priority === 'urgent') && (
                              <Badge
                                variant={PRIORITY_VARIANT[t.priority]}
                                className="capitalize"
                              >
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
                                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                              >
                                {row}
                              </Link>
                            ) : (
                              <div className="flex items-center gap-2 px-2 py-1.5">
                                {row}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            {d.albums.length > 0 && (
              <Card className="mt-6">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Albums</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Live links</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {d.albums.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.name}</TableCell>
                          <TableCell className="capitalize text-muted-foreground">
                            {a.status}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {a.item_count}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {a.share_links}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {when(a.created_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </DataState>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}
