'use client';

import { useState } from 'react';
import { Lock, Plus } from 'lucide-react';
import type { PermissionGroup, Role } from '@/api/console';
import {
  useCreateRole,
  useMe,
  useRemoveRole,
  useRoles,
  useUpdateRole,
} from '@/hooks/useConsole';
import { DataTable, type Column } from './data-table';
import { StatusDot } from './primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/** Mirrors OWNER_ONLY in api/src/admin/rbac.ts. The server refuses them regardless. */
const OWNER_ONLY = ['admins.manage'];

/**
 * Roles: the four built in, and any an owner makes — "Support lead" with
 * promos, "Night shift" that can read but not suspend.
 */
export function RolesTab() {
  const { can } = useMe();
  const manage = can('admins.manage');
  const { data, isLoading, isError, isFetching, refetch } = useRoles();
  const remove = useRemoveRole();
  const [editing, setEditing] = useState<Role | 'new' | null>(null);

  const columns: Column<Role>[] = [
    {
      id: 'role',
      header: 'Role',
      cell: (r) => (
        <div className="min-w-0 max-w-md">
          <span className="font-medium">{r.label}</span>
          {r.system && (
            <Badge variant="outline" className="ml-2">
              Built in
            </Badge>
          )}
          {r.description && (
            <span className="block truncate text-xs text-muted-foreground">{r.description}</span>
          )}
        </div>
      ),
    },
    {
      id: 'members',
      header: 'Members',
      className: 'text-right tabular-nums',
      cell: (r) => r.members,
    },
    {
      id: 'permissions',
      header: 'Can do',
      className: 'tabular-nums',
      cell: (r) => (
        <span className="text-muted-foreground">
          {r.permissions.length} permission{r.permissions.length === 1 ? '' : 's'}
        </span>
      ),
    },
    {
      id: 'twoFactor',
      header: 'Two-factor',
      cell: (r) =>
        r.requiresTwoFactor ? (
          <StatusDot tone="ok">Required</StatusDot>
        ) : (
          <StatusDot tone="muted">Optional</StatusDot>
        ),
    },
    {
      id: 'actions',
      header: '',
      className: 'text-right',
      cell: (r) =>
        manage && !r.system ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={r.members > 0 || remove.isPending}
            title={r.members > 0 ? 'Move its members to another role first' : undefined}
            onClick={() => {
              if (confirm(`Delete the ${r.label} role?`)) remove.mutate(r.name);
            }}
          >
            Delete
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-xs text-muted-foreground">
          Built-in roles keep their permissions; you can change whether they need two-factor.
          Make a custom role to give someone exactly what they need — Support plus promos, say.
          Managing staff stays with owners.
        </p>
        {manage && (
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="size-4" />
            New role
          </Button>
        )}
      </div>

      <DataTable
        id="console-roles"
        columns={columns}
        rows={data?.roles}
        rowKey={(r) => r.name}
        onRowClick={(r) => setEditing(r)}
        isLoading={isLoading}
        isError={isError}
        isFetching={isFetching}
        onRetry={() => void refetch()}
        columnPicker={false}
      />

      {data && editing && (
        <RoleEditor
          // Keyed so switching roles starts the form afresh.
          key={editing === 'new' ? 'new' : editing.name}
          role={editing === 'new' ? null : editing}
          catalog={data.catalog}
          readOnly={!manage}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function RoleEditor({
  role,
  catalog,
  readOnly,
  onClose,
}: {
  role: Role | null;
  catalog: PermissionGroup[];
  readOnly: boolean;
  onClose: () => void;
}) {
  const create = useCreateRole();
  const update = useUpdateRole();
  const system = role?.system ?? false;
  const [label, setLabel] = useState(role?.label ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [requires, setRequires] = useState(role?.requiresTwoFactor ?? false);
  // What is stored: individual permissions and `area.*` wildcards. A built-in
  // role shows what it allows, which nobody can change here.
  const [grants, setGrants] = useState<Set<string>>(
    () => new Set(system ? (role?.permissions ?? []) : (role?.grants ?? [])),
  );

  const lockedPermissions = readOnly || system;
  const has = (group: string, key: string) => grants.has(key) || grants.has(`${group}.*`);
  const groupHasOwnerOnly = (g: PermissionGroup) => g.permissions.some((p) => OWNER_ONLY.includes(p.key));

  function toggleGroup(g: PermissionGroup) {
    setGrants((prev) => {
      const next = new Set(prev);
      const all = `${g.key}.*`;
      const on = next.has(all) || g.permissions.every((p) => next.has(p.key));
      for (const p of g.permissions) next.delete(p.key);
      next.delete(all);
      // A wildcard also takes permissions a later release adds to the area.
      if (!on) next.add(all);
      return next;
    });
  }

  function toggleOne(g: PermissionGroup, key: string) {
    setGrants((prev) => {
      const next = new Set(prev);
      const all = `${g.key}.*`;
      if (next.has(all)) {
        // Unpicking one from "all of it" becomes the explicit rest.
        next.delete(all);
        for (const p of g.permissions) if (p.key !== key) next.add(p.key);
      } else if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const busy = create.isPending || update.isPending;
  const count = catalog
    .flatMap((g) => g.permissions.map((p) => [g.key, p.key] as const))
    .filter(([g, k]) => has(g, k)).length;

  function save() {
    const permissions = system ? undefined : [...grants];
    const input = system
      ? { description, requiresTwoFactor: requires }
      : { label, description, permissions, requiresTwoFactor: requires };
    if (role) update.mutate({ name: role.name, input }, { onSuccess: onClose });
    else create.mutate(input, { onSuccess: onClose });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{role ? role.label : 'New role'}</DialogTitle>
          <DialogDescription>
            {system
              ? 'A built-in role. Its permissions are fixed; its description and two-factor requirement are yours to set.'
              : 'Changes apply to everyone holding the role on their next request.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="role-label">Name</Label>
            <Input
              id="role-label"
              value={label}
              disabled={readOnly || system}
              maxLength={40}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Support lead"
            />
          </div>
          <div className="flex items-end justify-between gap-3 rounded-md border px-3 py-2">
            <div>
              <p className="text-sm font-medium">Require two-factor</p>
              <p className="text-xs text-muted-foreground">
                {role?.name === 'owner' ? 'Always on for owners.' : 'Members set it up at next sign-in.'}
              </p>
            </div>
            <Switch
              checked={requires}
              disabled={readOnly || role?.name === 'owner'}
              onCheckedChange={setRequires}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="role-description">Description</Label>
            <Textarea
              id="role-description"
              rows={2}
              maxLength={200}
              value={description}
              disabled={readOnly}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What someone with this role is here to do."
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="caption">
            Permissions · {count} selected
          </p>
          <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2">
            {catalog.map((g) => {
              const all = grants.has(`${g.key}.*`);
              const every = all || g.permissions.every((p) => has(g.key, p.key));
              const groupLocked = lockedPermissions || groupHasOwnerOnly(g);
              return (
                <fieldset key={g.key} className="bg-card p-3">
                  <legend className="sr-only">{g.label}</legend>
                  <label
                    className={cn(
                      'mb-1.5 flex items-center gap-2 text-sm font-semibold',
                      !groupLocked && 'cursor-pointer',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={every}
                      disabled={groupLocked}
                      onChange={() => toggleGroup(g)}
                    />
                    {g.label}
                    {all && <span className="text-[11px] font-normal text-muted-foreground">all, including new ones</span>}
                  </label>
                  <ul className="space-y-1 pl-6">
                    {g.permissions.map((p) => {
                      const ownerOnly = OWNER_ONLY.includes(p.key);
                      const disabled = lockedPermissions || ownerOnly;
                      return (
                        <li key={p.key}>
                          <label className={cn('flex items-start gap-2 text-sm', !disabled && 'cursor-pointer')}>
                            <input
                              type="checkbox"
                              className="mt-0.5 size-3.5 accent-primary"
                              checked={has(g.key, p.key)}
                              disabled={disabled}
                              onChange={() => toggleOne(g, p.key)}
                            />
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5">
                                {p.label}
                                {ownerOnly && !system && (
                                  <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                                    <Lock className="size-3" /> owner only
                                  </span>
                                )}
                              </span>
                              <span className="block text-xs text-muted-foreground">{p.description}</span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              );
            })}
          </div>
        </div>

        {!readOnly && (
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy || (!system && (!label.trim() || count === 0))}>
              {busy ? 'Saving…' : role ? 'Save role' : 'Create role'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
