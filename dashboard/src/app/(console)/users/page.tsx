'use client';

import { useState } from 'react';
import { MoreHorizontal, Plus } from 'lucide-react';
import {
  useAccounts,
  useCreateAccount,
  useEndSession,
  useLogins,
  useMe,
  useRemoveAccount,
  useResetTwoFactor,
  useSessions,
  useSetAccountDisabled,
  useSetAccountRole,
  useUnlockAccount,
} from '@/hooks/useConsole';
import type { AdminRole, ConsoleAccount, LoginEvent, SessionRow } from '@/api/console';
import { DataTable, FilterChips, type Column } from '@/components/console/data-table';
import { LOGIN_OUTCOME } from '@/components/console/login-outcome';
import { PageHeader, StatusDot, when } from '@/components/console/primitives';
import { RolesTab } from '@/components/console/roles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { describeAgent } from '@/lib/user-agent';

/**
 * The console's own people: their accounts, the roles they hold, how they sign
 * in and where they are signed in. Not Virgo's users — see Virgo users.
 */
export default function ConsoleUsersPage() {
  const { can } = useMe();
  const manage = can('admins.manage');
  const [open, setOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="Users"
        description="Who can sign in to this console. These credentials are not Virgo accounts and do not work in the app — see Virgo users for the people using the product."
        action={
          manage && (
            <Button size="sm" onClick={() => setOpen((v) => !v)}>
              <Plus className="size-4" />
              New user
            </Button>
          )
        }
      />

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="logins">Sign-ins</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
        </TabsList>
        <TabsContent value="accounts" className="mt-4">
          <AccountsTab creating={open && manage} onCreated={() => setOpen(false)} />
        </TabsContent>
        <TabsContent value="roles" className="mt-4">
          <RolesTab />
        </TabsContent>
        <TabsContent value="logins" className="mt-4">
          <LoginsTab />
        </TabsContent>
        <TabsContent value="sessions" className="mt-4">
          <SessionsTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

function AccountsTab({ creating, onCreated }: { creating: boolean; onCreated: () => void }) {
  const { me, can } = useMe();
  const { data, isLoading, isError, isFetching, refetch } = useAccounts();
  const create = useCreateAccount();
  const setRole = useSetAccountRole();
  const manage = can('admins.manage');
  const roles = me?.roles ?? [];
  const roleOrder = roles.map((r) => r.name);

  const columns: Column<ConsoleAccount>[] = [
    {
      id: 'name',
      header: 'Name',
      sort: (a) => a.name,
      cell: (a) => (
        <>
          <span className="block font-medium">
            {a.name}
            {a.id === me?.id && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">you</span>
            )}
          </span>
          <span className="block text-xs text-muted-foreground">{a.email}</span>
        </>
      ),
      csv: (a) => a.email,
    },
    {
      id: 'role',
      header: 'Role',
      sort: (a) => roleOrder.indexOf(a.role),
      cell: (a) =>
        // Your own role is never editable here — an owner who could demote
        // themselves can lock the console, and one who could promote
        // themselves makes every other permission check decorative. The
        // server refuses it too.
        manage && a.id !== me?.id ? (
          <Select
            value={a.role}
            onValueChange={(v) => setRole.mutate({ id: a.id, role: v as AdminRole })}
          >
            <SelectTrigger size="sm" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.name} value={r.name}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="secondary">{a.role_label}</Badge>
        ),
      csv: (a) => a.role_label,
    },
    {
      id: 'twoFactor',
      header: 'Two-factor',
      sort: (a) => (a.two_factor ? 2 : a.role_requires_two_factor ? 0 : 1),
      cell: (a) =>
        a.two_factor ? (
          <StatusDot tone="ok">On</StatusDot>
        ) : a.role_requires_two_factor ? (
          <StatusDot tone="warn">Setup pending</StatusDot>
        ) : (
          <StatusDot tone="muted">Off</StatusDot>
        ),
      csv: (a) => (a.two_factor ? 'on' : 'off'),
    },
    {
      id: 'login',
      header: 'Last sign-in',
      sort: (a) => a.last_login_at,
      cell: (a) => <span className="text-muted-foreground">{when(a.last_login_at)}</span>,
      csv: (a) => a.last_login_at,
    },
    {
      id: 'sessions',
      header: 'Sessions',
      sort: (a) => a.sessions,
      className: 'text-right tabular-nums',
      cell: (a) => a.sessions,
      csv: (a) => a.sessions,
    },
    {
      id: 'status',
      header: 'Status',
      cell: (a) =>
        a.disabled_at ? (
          <StatusDot tone="danger">Disabled</StatusDot>
        ) : a.locked_until ? (
          <span title={`Until ${new Date(a.locked_until).toLocaleTimeString()}`}>
            <StatusDot tone="danger">Locked</StatusDot>
          </span>
        ) : a.must_change_password ? (
          <StatusDot tone="info">New password due</StatusDot>
        ) : (
          <StatusDot tone="ok">Active</StatusDot>
        ),
      csv: (a) => (a.disabled_at ? 'disabled' : a.locked_until ? 'locked' : 'active'),
    },
    ...(manage
      ? [
          {
            id: 'actions',
            header: '',
            className: 'w-10 text-right',
            cell: (a: ConsoleAccount) => (a.id === me?.id ? null : <AccountActions account={a} />),
          } satisfies Column<ConsoleAccount>,
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      {creating && (
        <div className="rounded-lg border bg-card p-4">
          <NewAccountForm
            roles={roles}
            busy={create.isPending}
            onSubmit={(input) => create.mutate(input, { onSuccess: onCreated })}
          />
        </div>
      )}

      <DataTable
        id="console-users"
        columns={columns}
        rows={data}
        rowKey={(a) => a.id}
        isLoading={isLoading}
        isError={isError}
        isFetching={isFetching}
        onRetry={() => void refetch()}
        empty="No console accounts"
        exportName="console-users"
      />
    </div>
  );
}

/** Everything an owner can do to somebody else's console account. */
function AccountActions({ account: a }: { account: ConsoleAccount }) {
  const setDisabled = useSetAccountDisabled();
  const unlock = useUnlockAccount();
  const resetTwoFactor = useResetTwoFactor();
  const remove = useRemoveAccount();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${a.name}`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {a.locked_until && (
          <DropdownMenuItem onSelect={() => unlock.mutate(a.id)}>Unlock now</DropdownMenuItem>
        )}
        {a.two_factor && (
          <DropdownMenuItem
            onSelect={() => {
              if (
                confirm(
                  `Reset two-factor for ${a.email}? They are signed out everywhere and set it up again at their next sign-in. Do this for a lost phone.`,
                )
              ) {
                resetTwoFactor.mutate(a.id);
              }
            }}
          >
            Reset two-factor
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={() => setDisabled.mutate({ id: a.id, disabled: !a.disabled_at })}
        >
          {a.disabled_at ? 'Enable' : 'Disable'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            if (confirm(`Remove ${a.email} from the console? Their audit history stays.`)) {
              remove.mutate(a.id);
            }
          }}
        >
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const OUTCOMES = [
  { value: '', label: 'All' },
  { value: 'failed', label: 'Failed' },
  { value: 'success', label: 'Signed in' },
  { value: 'locked', label: 'Locked out' },
  { value: 'unknown', label: 'Unknown email' },
];

const LOGIN_COLUMNS: Column<LoginEvent>[] = [
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
    header: 'Account',
    cell: (e) => (
      <>
        <span className="block font-medium">{e.admin_name ?? e.email}</span>
        {e.admin_name && <span className="block text-xs text-muted-foreground">{e.email}</span>}
      </>
    ),
    csv: (e) => e.email,
  },
  {
    id: 'outcome',
    header: 'Outcome',
    cell: (e) => {
      const o = LOGIN_OUTCOME[e.outcome];
      return <StatusDot tone={o.tone}>{o.label}</StatusDot>;
    },
    csv: (e) => e.outcome,
  },
  {
    id: 'device',
    header: 'Device',
    cell: (e) => <span className="text-muted-foreground">{describeAgent(e.user_agent)}</span>,
    csv: (e) => e.user_agent,
  },
  {
    id: 'ip',
    header: 'IP',
    cell: (e) => <span className="font-mono text-xs text-muted-foreground">{e.ip ?? '—'}</span>,
    csv: (e) => e.ip,
  },
];

/** Every attempt, with who and from where: the place to notice someone guessing. */
function LoginsTab() {
  const { data: accounts } = useAccounts();
  const [outcome, setOutcome] = useState('');
  const [adminId, setAdminId] = useState('');
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const { data, isLoading, isError, isFetching, refetch } = useLogins({
    outcome: outcome || undefined,
    adminId: adminId || undefined,
    limit,
    offset,
  });

  return (
    <DataTable
      id="console-logins"
      columns={LOGIN_COLUMNS}
      rows={data?.data}
      rowKey={(e) => e.id}
      isLoading={isLoading}
      isError={isError}
      isFetching={isFetching}
      onRetry={() => void refetch()}
      empty="No sign-ins match"
      filters={
        <>
          <FilterChips
            value={outcome}
            onChange={(v) => {
              setOutcome(v);
              setOffset(0);
            }}
            options={OUTCOMES}
          />
          <Select
            value={adminId || 'all'}
            onValueChange={(v) => {
              setAdminId(v === 'all' ? '' : v);
              setOffset(0);
            }}
          >
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              {accounts?.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      }
      pagination={{
        offset,
        limit,
        total: data?.total ?? 0,
        onOffsetChange: setOffset,
        onLimitChange: setLimit,
      }}
      exportName="console-sign-ins"
    />
  );
}

/** Every browser signed in to the console right now, and a way to end any of them. */
function SessionsTab() {
  const { me, can } = useMe();
  const { data, isLoading, isError, isFetching, refetch } = useSessions();
  const end = useEndSession();

  const columns: Column<SessionRow>[] = [
    {
      id: 'who',
      header: 'Account',
      sort: (s) => s.admin_name,
      cell: (s) => (
        <>
          <span className="block font-medium">
            {s.admin_name}
            {s.id === me?.sessionId && (
              <Badge variant="secondary" className="ml-2">
                This browser
              </Badge>
            )}
          </span>
          <span className="block text-xs text-muted-foreground">{s.admin_email}</span>
        </>
      ),
      csv: (s) => s.admin_email,
    },
    {
      id: 'device',
      header: 'Device',
      cell: (s) => <span className="text-muted-foreground">{describeAgent(s.user_agent)}</span>,
      csv: (s) => s.user_agent,
    },
    {
      id: 'ip',
      header: 'IP',
      cell: (s) => <span className="font-mono text-xs text-muted-foreground">{s.ip ?? '—'}</span>,
      csv: (s) => s.ip,
    },
    {
      id: 'started',
      header: 'Signed in',
      sort: (s) => s.created_at,
      cell: (s) => <span className="text-muted-foreground">{when(s.created_at)}</span>,
      csv: (s) => s.created_at,
    },
    {
      id: 'active',
      header: 'Last active',
      sort: (s) => s.last_seen_at,
      cell: (s) => <span className="text-muted-foreground">{when(s.last_seen_at)}</span>,
      csv: (s) => s.last_seen_at,
    },
    ...(can('admins.manage')
      ? [
          {
            id: 'end',
            header: '',
            className: 'text-right',
            cell: (s: SessionRow) =>
              s.id === me?.sessionId ? null : (
                <Button size="sm" variant="outline" disabled={end.isPending} onClick={() => end.mutate(s.id)}>
                  End
                </Button>
              ),
          } satisfies Column<SessionRow>,
        ]
      : []),
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Ending a session signs that browser out on its next request. &ldquo;Last active&rdquo;
        updates when the browser renews its sign-in, about every 30 minutes.
      </p>
      <DataTable
        id="console-sessions"
        columns={columns}
        rows={data}
        rowKey={(s) => s.id}
        isLoading={isLoading}
        isError={isError}
        isFetching={isFetching}
        onRetry={() => void refetch()}
        empty="Nobody is signed in"
        exportName="console-sessions"
      />
    </div>
  );
}

function NewAccountForm({
  roles,
  busy,
  onSubmit,
}: {
  roles: { name: AdminRole; label: string }[];
  busy: boolean;
  onSubmit: (input: {
    email: string;
    name: string;
    password: string;
    role: AdminRole;
  }) => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AdminRole>('viewer');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ email: email.trim(), name: name.trim(), password, role });
      }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <div className="space-y-1.5">
        <Label htmlFor="na-name">Name</Label>
        <Input id="na-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="na-email">Email</Label>
        <Input
          id="na-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="na-pw">Password</Label>
        <Input
          id="na-pw"
          type="text"
          required
          minLength={12}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 12 characters"
        />
        <p className="text-[11px] text-muted-foreground">
          Shown as text so you can copy it to them. They choose their own the
          first time they sign in.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label>Role</Label>
        <Select value={role} onValueChange={(v) => setRole(v as AdminRole)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.name} value={r.name}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy}>
          Create account
        </Button>
      </div>
    </form>
  );
}
