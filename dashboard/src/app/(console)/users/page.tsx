'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  useAccounts,
  useCreateAccount,
  useMe,
  useRemoveAccount,
  useSetAccountDisabled,
  useSetAccountRole,
} from '@/hooks/useConsole';
import type { AdminRole, ConsoleAccount } from '@/api/console';
import { DataTable, type Column } from '@/components/console/data-table';
import { PageHeader, StatusDot, when } from '@/components/console/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function ConsoleUsersPage() {
  const { me, can } = useMe();
  const { data, isLoading, isError, isFetching, refetch } = useAccounts();
  const create = useCreateAccount();
  const setRole = useSetAccountRole();
  const setDisabled = useSetAccountDisabled();
  const remove = useRemoveAccount();
  const [open, setOpen] = useState(false);

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
            <SelectTrigger size="sm" className="w-32 capitalize">
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
          <Badge variant="secondary" className="capitalize">
            {a.role}
          </Badge>
        ),
      csv: (a) => a.role,
    },
    {
      id: 'login',
      header: 'Last sign-in',
      sort: (a) => a.last_login_at,
      cell: (a) => <span className="text-muted-foreground">{when(a.last_login_at)}</span>,
      csv: (a) => a.last_login_at,
    },
    {
      id: 'status',
      header: 'Status',
      cell: (a) =>
        a.disabled_at ? (
          <StatusDot tone="danger">Disabled</StatusDot>
        ) : (
          <StatusDot tone="ok">Active</StatusDot>
        ),
      csv: (a) => (a.disabled_at ? 'disabled' : 'active'),
    },
    ...(manage
      ? [
          {
            id: 'actions',
            header: '',
            className: 'text-right',
            cell: (a: ConsoleAccount) =>
              a.id !== me?.id && (
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDisabled.mutate({ id: a.id, disabled: !a.disabled_at })}
                  >
                    {a.disabled_at ? 'Enable' : 'Disable'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => {
                      if (confirm(`Remove ${a.email} from the console? Their audit history stays.`)) {
                        remove.mutate(a.id);
                      }
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ),
          } satisfies Column<ConsoleAccount>,
        ]
      : []),
  ];

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

      {open && manage && (
        <div className="mb-5 rounded-lg border bg-card p-4">
          <NewAccountForm
            roles={roles}
            busy={create.isPending}
            onSubmit={(input) => create.mutate(input, { onSuccess: () => setOpen(false) })}
          />
        </div>
      )}

      {roles.length > 0 && (
        <div className="mb-5 grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {roles.map((r) => (
            <div key={r.name} className="bg-card p-3">
              <p className="caption">{r.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{r.description}</p>
            </div>
          ))}
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
    </>
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
