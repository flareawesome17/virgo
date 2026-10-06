'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Popover } from 'radix-ui';
import { Bookmark, Download, Filter, Gift, Trash2, X } from 'lucide-react';
import type { AdminUserRow, SavedView, UserSort, UsersQuery } from '@/api/console';
import {
  useBulkTags,
  useGrantPromo,
  useMe,
  usePromos,
  useRemoveView,
  useSaveView,
  useTags,
  useUsers,
  useViews,
} from '@/hooks/useConsole';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  DataTable,
  FilterChips,
  type Column,
  type SortState,
} from '@/components/console/data-table';
import { PageHeader, StatusDot, bytes, num, when } from '@/components/console/primitives';
import { TagButton, TagChip, TagPicker } from '@/components/console/tags';
import { isPaused, isSuspended } from '@/lib/account-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const STATUSES = [
  { value: '', label: 'Everyone' },
  { value: 'active', label: 'Active' },
  { value: 'unverified', label: 'Unconfirmed' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'paused', label: 'Paused' },
];

const PLANS = [
  { value: '', label: 'Any plan' },
  { value: 'free', label: 'Free' },
  { value: 'freelance', label: 'Freelancer' },
  { value: 'studio', label: 'Studio' },
  { value: 'business', label: 'Business' },
  { value: 'pro', label: 'Pro (old)' },
];

/** The filters a view can save, beyond the search and the order. */
type Filters = Pick<UsersQuery, 'plan' | 'status' | 'seen' | 'tag' | 'platform' | 'twoFactor' | 'full'>;

function status(u: AdminUserRow) {
  if (isSuspended(u)) return { tone: 'danger', label: 'Suspended' } as const;
  if (isPaused(u)) return { tone: 'muted', label: 'Paused' } as const;
  if (!u.email_verified_at) return { tone: 'warn', label: 'Unconfirmed' } as const;
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
    id: 'tags',
    header: 'Tags',
    cell: (u) =>
      u.tags?.length ? (
        <span className="flex max-w-56 flex-wrap gap-1">
          {u.tags.map((t) => (
            <TagChip key={t.id} tag={t} />
          ))}
        </span>
      ) : null,
    csv: (u) => (u.tags ?? []).map((t) => t.label).join('; '),
  },
  {
    id: 'storage',
    header: 'Storage used',
    sort: true,
    className: 'tabular-nums',
    cell: (u) => {
      const share = u.storage_limit_bytes ? Number(u.storage_bytes) / u.storage_limit_bytes : 0;
      return (
        <span className={cn(share >= 0.8 && 'font-medium text-warning')}>
          {bytes(u.storage_bytes)}
          <span className="ml-1 text-xs text-muted-foreground">
            of {bytes(u.storage_limit_bytes)}
          </span>
        </span>
      );
    },
    csv: (u) => Number(u.storage_bytes),
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

/** Excel-friendly CSV of the rows picked, wherever they were picked from. */
function exportRows(rows: AdminUserRow[]) {
  const visible = COLUMNS.filter((c) => c.csv);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = `﻿${[
    visible.map((c) => escape(c.header)).join(','),
    ...rows.map((r) => visible.map((c) => escape(c.csv!(r))).join(',')),
  ].join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `virgo-users-selected-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function VirgoUsersPage() {
  const { can } = useMe();
  const [q, setQ] = useState('');
  // Sent once typing pauses, so the list does not refetch on every keystroke.
  const term = useDebouncedValue(q.trim(), 300);
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>({ key: 'joined', dir: 'desc' });
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);
  // Picked rows, kept with their data so a selection can span pages.
  const [picked, setPicked] = useState<Map<string, AdminUserRow>>(new Map());

  const query: UsersQuery = {
    q: term || undefined,
    ...filters,
    sort: sort.key as UserSort,
    dir: sort.dir,
    limit,
    offset,
  };
  const { data, isLoading, isError, isFetching, refetch } = useUsers(query);

  function apply(next: Filters) {
    setFilters(Object.fromEntries(Object.entries(next).filter(([, v]) => v)) as Filters);
    setOffset(0);
  }

  const selected = useMemo(() => new Set(picked.keys()), [picked]);
  const extraFilters = Object.entries(filters).filter(([k, v]) => v && k !== 'status').length;
  const filtered = !!(term || Object.values(filters).some(Boolean));

  return (
    <>
      <PageHeader
        title="Virgo users"
        description={
          data
            ? `${num(data.total)} ${filtered ? 'matching accounts' : 'accounts on the platform'}. Not console access — see Users for that.`
            : 'Everyone with a Virgo account. Not console access — see Users for that.'
        }
        action={
          <ViewsMenu
            current={{ q: term || undefined, ...filters, sort: sort.key as UserSort, dir: sort.dir }}
            onApply={(v) => {
              const { q: viewQ, sort: viewSort, dir, ...rest } = v.query;
              setQ(viewQ ?? '');
              apply(rest as Filters);
              if (viewSort) setSort({ key: viewSort, dir: dir ?? 'desc' });
            }}
          />
        }
      />

      {picked.size > 0 && (
        <BulkBar
          rows={[...picked.values()]}
          onClear={() => setPicked(new Map())}
          canTag={can('users.notes')}
          canPromo={can('promos.manage')}
        />
      )}

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
        empty={filtered ? 'No account matches these filters' : 'No accounts yet'}
        search={{
          value: q,
          onChange: (v) => {
            setQ(v);
            setOffset(0);
          },
          placeholder: 'Email, name or handle',
        }}
        filters={
          <>
            <FilterChips
              value={filters.status ?? ''}
              onChange={(v) => apply({ ...filters, status: v || undefined })}
              options={STATUSES}
            />
            <MoreFilters filters={filters} count={extraFilters} onChange={apply} />
            {filtered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQ('');
                  apply({});
                }}
              >
                Clear
              </Button>
            )}
          </>
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
        selection={{
          selected,
          onChange: (next) =>
            setPicked((prev) => {
              const map = new Map(prev);
              for (const id of map.keys()) if (!next.has(id)) map.delete(id);
              for (const row of data?.data ?? []) if (next.has(row.id)) map.set(row.id, row);
              return map;
            }),
        }}
        exportName="virgo-users"
      />
    </>
  );
}

/** Everything that is not a status chip: plan, last seen, tag, phone, two-factor, nearly full. */
function MoreFilters({
  filters,
  count,
  onChange,
}: {
  filters: Filters;
  count: number;
  onChange: (next: Filters) => void;
}) {
  const { data: tags } = useTags();
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const ANY = 'any';

  const row = (label: string, control: React.ReactNode) => (
    <label className="grid grid-cols-[6.5rem_1fr] items-center gap-2 text-xs text-muted-foreground">
      {label}
      {control}
    </label>
  );
  const select = (
    value: string | undefined,
    options: { value: string; label: string }[],
    onPick: (v: string | undefined) => void,
  ) => (
    <Select value={value || ANY} onValueChange={(v) => onPick(v === ANY ? undefined : v)}>
      <SelectTrigger size="sm" className="w-full text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value || ANY} value={o.value || ANY}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors',
            count
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'bg-background text-muted-foreground hover:text-foreground',
          )}
        >
          <Filter className="size-3.5" />
          Filters{count ? ` · ${count}` : ''}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-80 space-y-2.5 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg"
        >
          {row('Plan', select(filters.plan, PLANS, (v) => set({ plan: v })))}
          {row(
            'Last seen',
            select(
              filters.seen,
              [
                { value: '', label: 'Any time' },
                { value: 'week', label: 'In the last 7 days' },
                { value: 'quiet', label: 'Not for 30 days' },
              ],
              (v) => set({ seen: v }),
            ),
          )}
          {row(
            'Tag',
            select(
              filters.tag,
              [{ value: '', label: 'Any tag' }, ...(tags ?? []).map((t) => ({ value: t.id, label: t.label }))],
              (v) => set({ tag: v }),
            ),
          )}
          {row(
            'Notifications',
            select(
              filters.platform,
              [
                { value: '', label: 'Any' },
                { value: 'ios', label: 'On, iPhone' },
                { value: 'android', label: 'On, Android' },
              ],
              (v) => set({ platform: v }),
            ),
          )}
          {row(
            'Two-factor',
            select(
              filters.twoFactor,
              [
                { value: '', label: 'Any' },
                { value: 'on', label: 'On' },
                { value: 'off', label: 'Off' },
              ],
              (v) => set({ twoFactor: v as Filters['twoFactor'] }),
            ),
          )}
          <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs">
            <input
              type="checkbox"
              checked={filters.full === 'true'}
              onChange={(e) => set({ full: e.target.checked ? 'true' : undefined })}
              className="size-3.5 accent-primary"
            />
            Nearly full — 80% or more of what they may store
          </label>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Saved filters: yours, and those colleagues shared. */
function ViewsMenu({
  current,
  onApply,
}: {
  current: Partial<UsersQuery>;
  onApply: (view: SavedView) => void;
}) {
  const { data: views } = useViews();
  const remove = useRemoveView();
  const [saving, setSaving] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Bookmark className="size-3.5" />
            Views
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="caption">Saved views</DropdownMenuLabel>
          {views?.length ? (
            views.map((v) => (
              <DropdownMenuItem key={v.id} onSelect={() => onApply(v)} className="group">
                <span className="min-w-0 flex-1 truncate">{v.name}</span>
                {!v.mine && (
                  <span className="text-[10px] text-muted-foreground">{v.owner_name}</span>
                )}
                {v.shared && v.mine && <span className="text-[10px] text-muted-foreground">shared</span>}
                {v.mine && (
                  <button
                    type="button"
                    aria-label={`Remove ${v.name}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      remove.mutate(v.id);
                    }}
                    className="ml-1 hidden rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
                  >
                    <Trash2 className="size-3" />
                  </button>
                )}
              </DropdownMenuItem>
            ))
          ) : (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">None yet.</p>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setSaving(true)}>Save these filters as a view…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {saving && <SaveViewDialog query={current} onClose={() => setSaving(false)} />}
    </>
  );
}

function SaveViewDialog({ query, onClose }: { query: Partial<UsersQuery>; onClose: () => void }) {
  const save = useSaveView();
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save this view</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder="Quiet studios, Unconfirmed this week…"
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={shared}
            onChange={(e) => setShared(e.target.checked)}
            className="size-4 accent-primary"
          />
          Share with every staff member
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || save.isPending}
            onClick={() => save.mutate({ name, query, shared }, { onSuccess: onClose })}
          >
            Save view
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** What can be done to the picked accounts at once. */
function BulkBar({
  rows,
  onClear,
  canTag,
  canPromo,
}: {
  rows: AdminUserRow[];
  onClear: () => void;
  canTag: boolean;
  canPromo: boolean;
}) {
  const bulk = useBulkTags();
  const grant = useGrantPromo();
  const { data: promos } = usePromos(canPromo);
  const ids = rows.map((r) => r.id);
  const offerable = (promos ?? []).filter((p) => p.active && p.kind === 'targeted');
  // A tag is ticked when every picked account already has it.
  const everyone = new Set(
    rows.length
      ? (rows[0].tags ?? [])
          .map((t) => t.id)
          .filter((tagId) => rows.every((r) => r.tags?.some((t) => t.id === tagId)))
      : [],
  );

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
      <span className="text-sm font-medium">
        {rows.length} selected
      </span>
      {canTag && (
        <TagPicker
          selected={everyone}
          canCreate
          onToggle={(tag, on) =>
            bulk.mutate({ userIds: ids, add: on ? [tag.id] : [], remove: on ? [] : [tag.id] })
          }
          trigger={<TagButton label="Tag…" />}
        />
      )}
      {canPromo && offerable.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Gift className="size-3.5" />
              Offer a promo…
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {offerable.map((p) => (
              <DropdownMenuItem key={p.id} onSelect={() => grant.mutate({ id: p.id, userIds: ids })}>
                {p.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Button variant="outline" size="sm" onClick={() => exportRows(rows)}>
        <Download className="size-3.5" />
        Export
      </Button>
      <Button variant="ghost" size="sm" className="ml-auto" onClick={onClear}>
        <X className="size-3.5" />
        Clear
      </Button>
    </div>
  );
}
