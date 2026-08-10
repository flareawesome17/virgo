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
import type { AdminRole } from '@/api/console';
import { DataState, PageHeader, when } from '@/components/console/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

export default function ConsoleUsersPage() {
  const { me, can } = useMe();
  const { data, isLoading, isError, refetch } = useAccounts();
  const create = useCreateAccount();
  const setRole = useSetAccountRole();
  const setDisabled = useSetAccountDisabled();
  const remove = useRemoveAccount();
  const [open, setOpen] = useState(false);

  const manage = can('admins.manage');
  const roles = me?.roles ?? [];

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
        <Card className="mb-5">
          <CardContent className="p-4">
            <NewAccountForm
              roles={roles}
              busy={create.isPending}
              onSubmit={(input) =>
                create.mutate(input, { onSuccess: () => setOpen(false) })
              }
            />
          </CardContent>
        </Card>
      )}

      {roles.length > 0 && (
        <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {roles.map((r) => (
            <div key={r.name} className="rounded-lg border p-3">
              <p className="text-sm font-semibold">{r.label}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {r.description}
              </p>
            </div>
          ))}
        </div>
      )}

      <DataState
        isLoading={isLoading}
        isError={isError}
        isEmpty={false}
        onRetry={() => void refetch()}
      >
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead>Status</TableHead>
                {manage && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((a) => {
                const self = a.id === me?.id;
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <span className="block font-medium">
                        {a.name}
                        {self && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            you
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {a.email}
                      </span>
                    </TableCell>
                    <TableCell>
                      {/* Your own role is never editable here — an owner who
                          could demote themselves can lock the console, and one
                          who could promote themselves makes every other
                          permission check decorative. The server refuses it
                          too. */}
                      {manage && !self ? (
                        <Select
                          value={a.role}
                          onValueChange={(v) =>
                            setRole.mutate({ id: a.id, role: v as AdminRole })
                          }
                        >
                          <SelectTrigger className="w-32 capitalize">
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
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {when(a.last_login_at)}
                    </TableCell>
                    <TableCell>
                      {a.disabled_at ? (
                        <Badge variant="destructive">Disabled</Badge>
                      ) : (
                        <Badge variant="secondary">Active</Badge>
                      )}
                    </TableCell>
                    {manage && (
                      <TableCell className="text-right">
                        {!self && (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setDisabled.mutate({
                                  id: a.id,
                                  disabled: !a.disabled_at,
                                })
                              }
                            >
                              {a.disabled_at ? 'Enable' : 'Disable'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => {
                                if (
                                  confirm(
                                    `Remove ${a.email} from the console? Their audit history stays.`,
                                  )
                                ) {
                                  remove.mutate(a.id);
                                }
                              }}
                            >
                              Remove
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </DataState>
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
          Shown as text so you can copy it to them. They should change it.
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
