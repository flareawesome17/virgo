'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Eye } from 'lucide-react';
import type { AuditEntry } from '@/api/console';
import { useAudit, useAuditFacets } from '@/hooks/useConsole';
import { DataTable, type Column } from '@/components/console/data-table';
import { PageHeader, when } from '@/components/console/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** Destructive actions should be findable at a glance. */
const LOUD = [
  'user.disable',
  'admin.delete',
  'admin.disable',
  'admin.twoFactorReset',
  'admin.twoFactorDisable',
  'job.hide',
  'showcase.hide',
  'shareLink.revoke',
  'role.delete',
];

const COLUMNS: Column<AuditEntry>[] = [
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
    header: 'Who',
    cell: (e) => (
      <>
        <span className="block font-medium">{e.admin_name ?? e.admin_email}</span>
        {e.admin_name && <span className="block text-xs text-muted-foreground">{e.admin_email}</span>}
      </>
    ),
    csv: (e) => e.admin_email,
  },
  {
    id: 'action',
    header: 'Action',
    cell: (e) =>
      e.action.endsWith('.view') ? (
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
          <Eye className="size-3" />
          {e.action}
        </span>
      ) : (
        <Badge
          variant={LOUD.includes(e.action) ? 'destructive' : 'secondary'}
          className="font-mono text-[11px]"
        >
          {e.action}
        </Badge>
      ),
    csv: (e) => e.action,
  },
  {
    id: 'target',
    header: 'Target',
    cell: (e) =>
      e.target_type === 'user' && e.target_id ? (
        <Link href={`/virgo-users/${e.target_id}`} className="hover:underline">
          {e.target_label ?? `user ${shortId(e.target_id)}`}
        </Link>
      ) : e.target_type ? (
        <span className="whitespace-nowrap text-muted-foreground" title={e.target_id ?? undefined}>
          {e.target_type}
          {e.target_id ? ` ${shortId(e.target_id)}` : ''}
        </span>
      ) : (
        '—'
      ),
    csv: (e) => (e.target_type ? `${e.target_type} ${e.target_id ?? ''}`.trim() : ''),
  },
  {
    id: 'detail',
    header: 'Detail',
    cell: (e) =>
      Object.keys(e.detail ?? {}).length > 0 ? (
        <code className="block max-w-md truncate rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {JSON.stringify(e.detail)}
        </code>
      ) : null,
    csv: (e) => JSON.stringify(e.detail ?? {}),
  },
];

const ANY = 'any';

/** A UUID is shortened to its first block; a readable id, like a role's name, is not. */
function shortId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id) ? id.slice(0, 8) : id;
}

export default function AuditPage() {
  const facets = useAuditFacets();
  const [adminId, setAdminId] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [views, setViews] = useState(false);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(50);

  const { data, isLoading, isError, isFetching, refetch } = useAudit({
    limit,
    offset,
    adminId: adminId || undefined,
    action: action || undefined,
    from: from || undefined,
    to: to || undefined,
    includeViews: views ? 'true' : undefined,
  });

  // Every filter change starts from the first page.
  const set =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setOffset(0);
    };
  const filtered = !!(adminId || action || from || to || views);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change a console account has made, newest first, and who opened whose account. Append-only — nothing here can be edited or deleted from the console."
      />

      <DataTable
        id="audit"
        columns={COLUMNS}
        rows={data?.data}
        rowKey={(e) => e.id}
        isLoading={isLoading}
        isError={isError}
        isFetching={isFetching}
        onRetry={() => void refetch()}
        empty={filtered ? 'Nothing matches these filters' : 'No console actions recorded yet'}
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={adminId || ANY} onValueChange={(v) => set(setAdminId)(v === ANY ? '' : v)}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Anyone</SelectItem>
                {facets.data?.admins.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={action || ANY} onValueChange={(v) => set(setAction)(v === ANY ? '' : v)}>
              <SelectTrigger className="h-8 w-48 font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY} className="font-sans">
                  Any action
                </SelectItem>
                {facets.data?.actions.map((a) => (
                  <SelectItem key={a} value={a} className="font-mono text-xs">
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              From
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => set(setFrom)(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              to
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => set(setTo)(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
              />
            </label>
            <button
              type="button"
              role="switch"
              aria-checked={views}
              onClick={() => set(setViews)(!views)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors',
                views
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              <Eye className="size-3.5" />
              Include views
            </button>
            {filtered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAdminId('');
                  setAction('');
                  setFrom('');
                  setTo('');
                  setViews(false);
                  setOffset(0);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        }
        pagination={{
          offset,
          limit,
          total: data?.total ?? 0,
          onOffsetChange: setOffset,
          onLimitChange: setLimit,
        }}
        exportName="audit-log"
      />
    </>
  );
}
