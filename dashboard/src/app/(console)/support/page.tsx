'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { SUPPORT_CATEGORIES, type Macro, type Ticket, type TicketQuery } from '@/api/console';
import {
  useMacros,
  useMe,
  useRemoveMacro,
  useSaveMacro,
  useSetSupportSettings,
  useSupportInsights,
  useSupportSettings,
  useTickets,
} from '@/hooks/useConsole';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { DataTable, FilterChips, type Column } from '@/components/console/data-table';
import {
  DataState,
  MiniBars,
  PageHeader,
  Panel,
  StatStrip,
  StatusDot,
  num,
  when,
} from '@/components/console/primitives';
import { PRIORITY_VARIANT, STATUS_TONE, dueLabel } from '@/components/console/support';
import { Stars } from '@/components/console/support-files';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

/** Hours, as a person would say them. */
function hoursLabel(h: number | null | undefined): string {
  if (h === null || h === undefined) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)} h`;
  return `${(h / 24).toFixed(1)} days`;
}

const COLUMNS: Column<Ticket>[] = [
  {
    id: 'subject',
    header: 'Subject',
    cell: (t) => (
      <Link href={`/support/${t.id}`} className="block min-w-0 max-w-96">
        <span className="block truncate font-medium">{t.subject}</span>
        <span className="block text-xs text-muted-foreground">
          {t.messages} message{t.messages === 1 ? '' : 's'}
          {t.waiting_since && ` · waiting ${when(t.waiting_since).replace(' ago', '')}`}
        </span>
      </Link>
    ),
    csv: (t) => t.subject,
  },
  {
    id: 'from',
    header: 'Customer',
    cell: (t) =>
      t.user_id ? (
        <Link href={`/virgo-users/${t.user_id}`} className="text-muted-foreground hover:underline">
          {t.user_email}
        </Link>
      ) : (
        <span className="text-muted-foreground">{t.user_email}</span>
      ),
    csv: (t) => t.user_email,
  },
  {
    id: 'category',
    header: 'Category',
    cell: (t) => <span className="capitalize text-muted-foreground">{t.category ?? '—'}</span>,
    csv: (t) => t.category,
  },
  {
    id: 'priority',
    header: 'Priority',
    cell: (t) => (
      <Badge variant={PRIORITY_VARIANT[t.priority] ?? 'secondary'} className="capitalize">
        {t.priority}
      </Badge>
    ),
    csv: (t) => t.priority,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (t) => (
      <StatusDot tone={STATUS_TONE[t.status] ?? 'muted'}>
        <span className="capitalize">{t.status}</span>
      </StatusDot>
    ),
    csv: (t) => t.status,
  },
  {
    id: 'due',
    header: 'First reply',
    cell: (t) => {
      if (t.first_replied_at) {
        return <span className="text-xs text-muted-foreground">answered</span>;
      }
      const due = dueLabel(t);
      return due ? (
        <span className={due.late ? 'text-xs font-semibold text-destructive' : 'text-xs text-muted-foreground'}>
          {due.text}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      );
    },
    csv: (t) => t.due_at,
  },
  {
    id: 'assigned',
    header: 'With',
    cell: (t) =>
      t.assigned_name ? (
        <span>{t.assigned_name}</span>
      ) : (
        <span className="text-xs text-muted-foreground">nobody yet</span>
      ),
    csv: (t) => t.assigned_name,
  },
  {
    id: 'rating',
    header: 'Rating',
    cell: (t) =>
      t.rating ? <Stars value={t.rating} /> : <span className="text-xs text-muted-foreground">—</span>,
    csv: (t) => t.rating ?? '',
  },
  {
    id: 'updated',
    header: 'Updated',
    cell: (t) => <span className="text-muted-foreground">{when(t.updated_at)}</span>,
    csv: (t) => t.updated_at,
  },
];

export default function SupportPage() {
  const [tab, setTab] = useState('tickets');
  return (
    <>
      <PageHeader
        title="Support"
        description="Tickets raised from inside the app. Replies reach the customer in the app, by push and by email; internal notes never leave the console."
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="replies">Canned replies</TabsTrigger>
        </TabsList>
        <TabsContent value="tickets" className="mt-4">
          <TicketsTab />
        </TabsContent>
        <TabsContent value="insights" className="mt-4">
          <InsightsTab />
        </TabsContent>
        <TabsContent value="replies" className="mt-4">
          <MacrosTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

const STATUSES = ['', 'open', 'pending', 'resolved', 'closed'] as const;

function TicketsTab() {
  const { can } = useMe();
  const [queue, setQueue] = useState<'' | NonNullable<TicketQuery['queue']>>('');
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const term = useDebouncedValue(q.trim(), 300);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const settings = useSupportSettings();
  const setSettings = useSetSupportSettings();

  const { data, isLoading, isError, isFetching, refetch } = useTickets({
    queue: queue || undefined,
    status: status || undefined,
    category: category || undefined,
    q: term || undefined,
    limit,
    offset,
  });
  const counts = new Map((data?.counts ?? []).map((c) => [c.status, c.count] as const));
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setOffset(0);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          value={queue}
          onChange={reset(setQueue)}
          options={[
            { value: '', label: 'All tickets' },
            { value: 'mine', label: 'Mine', count: data?.queues?.mine },
            { value: 'unassigned', label: 'Nobody yet', count: data?.queues?.unassigned },
            { value: 'overdue', label: 'Late', count: data?.queues?.overdue },
          ]}
        />
        {settings.data && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              aria-labelledby="support-auto-assign"
              checked={settings.data.autoAssign}
              disabled={!can('support.manage') || setSettings.isPending}
              onCheckedChange={(on) => setSettings.mutate(on)}
            />
            <span id="support-auto-assign">Give new tickets to whoever has fewest open</span>
          </label>
        )}
      </div>

      <DataTable
        id="support"
        columns={COLUMNS}
        rows={data?.data}
        rowKey={(t) => t.id}
        rowHref={(t) => `/support/${t.id}`}
        isLoading={isLoading}
        isError={isError}
        isFetching={isFetching}
        onRetry={() => void refetch()}
        empty={
          term
            ? `No ticket matches “${term}”`
            : queue === 'mine'
              ? 'Nothing waiting on you'
              : queue
                ? 'Nothing here'
                : 'Nobody has written in yet'
        }
        search={{ value: q, onChange: reset(setQ), placeholder: 'Subject or email' }}
        filters={
          <>
            <FilterChips
              value={status}
              onChange={reset(setStatus)}
              options={STATUSES.map((s) => ({
                value: s,
                label: s ? s[0].toUpperCase() + s.slice(1) : 'Any status',
                count: s ? counts.get(s) : undefined,
              }))}
            />
            <Select value={category || 'any'} onValueChange={(v) => reset(setCategory)(v === 'any' ? '' : v)}>
              <SelectTrigger className="h-8 w-36 text-xs capitalize">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any category</SelectItem>
                {SUPPORT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">
                    {c}
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
        exportName="support-tickets"
      />
    </div>
  );
}

const WINDOWS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
] as const;

function InsightsTab() {
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const { data, isLoading, isError, refetch } = useSupportInsights(Number(days));

  const agentColumns: Column<NonNullable<typeof data>['agents'][number]>[] = [
    { id: 'name', header: 'Agent', sort: (a) => a.name, cell: (a) => <span className="font-medium">{a.name}</span> },
    { id: 'open', header: 'Holding', sort: (a) => a.open, className: 'text-right tabular-nums', cell: (a) => num(a.open) },
    { id: 'replies', header: 'Replies', sort: (a) => a.replies, className: 'text-right tabular-nums', cell: (a) => num(a.replies) },
    { id: 'resolved', header: 'Resolved', sort: (a) => a.resolved, className: 'text-right tabular-nums', cell: (a) => num(a.resolved) },
    {
      id: 'speed',
      header: 'Median first reply',
      sort: (a) => a.first_reply_hours,
      className: 'text-right tabular-nums',
      cell: (a) => hoursLabel(a.first_reply_hours),
    },
    {
      id: 'satisfied',
      header: 'Satisfied',
      sort: (a) => (a.ratings ? (a.satisfied ?? 0) : -1),
      className: 'text-right tabular-nums',
      cell: (a) =>
        a.ratings ? (
          <span title={`${a.ratings} rating${a.ratings === 1 ? '' : 's'}`}>
            {Math.round((a.satisfied ?? 0) * 100)}%{' '}
            <span className="text-xs text-muted-foreground">of {num(a.ratings)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <FilterChips value={days} onChange={setDays} options={[...WINDOWS]} />
      <DataState isLoading={isLoading} isError={isError} isEmpty={false} onRetry={() => void refetch()}>
        {data && (
          <div className="space-y-4">
            <StatStrip
              items={[
                { label: 'Open', value: num(data.now.open), hint: `${num(data.now.pending)} waiting on customers` },
                { label: 'Nobody yet', value: num(data.now.unassigned), tone: data.now.unassigned ? 'warn' : 'default' },
                { label: 'Late', value: num(data.now.overdue), tone: data.now.overdue ? 'danger' : 'good', hint: 'first reply past its target' },
                { label: 'Median first reply', value: hoursLabel(data.speed.first_reply_hours), hint: `last ${days} days` },
                {
                  label: 'Answered on time',
                  value: data.speed.on_time === null ? '—' : `${Math.round(data.speed.on_time * 100)}%`,
                  hint: `median resolution ${hoursLabel(data.speed.resolution_hours)}`,
                },
                {
                  // The share who gave 4 or 5, which moves when service
                  // does; an average hides a run of ones behind a few fives.
                  label: 'Satisfied',
                  value:
                    data.ratings?.count && data.ratings.satisfied !== null
                      ? `${Math.round(data.ratings.satisfied * 100)}%`
                      : '—',
                  hint: data.ratings?.count
                    ? `${num(data.ratings.count)} rating${data.ratings.count === 1 ? '' : 's'}, average ${(data.ratings.average ?? 0).toFixed(1)}`
                    : 'no ratings yet',
                },
              ]}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Tickets opened per day">
                <MiniBars label={`Last ${days} days`} data={data.flow.map((f) => ({ day: f.day.slice(0, 10), value: f.opened }))} />
              </Panel>
              <Panel title="Tickets resolved per day">
                <MiniBars label={`Last ${days} days`} data={data.flow.map((f) => ({ day: f.day.slice(0, 10), value: f.resolved }))} />
              </Panel>
            </div>
            <section>
              <p className="caption mb-2">By agent</p>
              <DataTable
                id="support-agents"
                columns={agentColumns}
                rows={data.agents}
                rowKey={(a) => a.id}
                isLoading={false}
                isError={false}
                empty="Nobody has handled a ticket yet"
              />
            </section>
            <p className="text-xs text-muted-foreground">
              First-reply targets: urgent 1 hour, high 4 hours, normal 1 day, low 3 days — counted
              around the clock.
            </p>
          </div>
        )}
      </DataState>
    </div>
  );
}

function MacrosTab() {
  const { can } = useMe();
  const { data, isLoading, isError, refetch } = useMacros();
  const remove = useRemoveMacro();
  const [editing, setEditing] = useState<Macro | 'new' | null>(null);
  const manage = can('support.manage');

  const columns: Column<Macro>[] = [
    {
      id: 'title',
      header: 'Reply',
      cell: (m) => (
        <div className="min-w-0 max-w-xl">
          <span className="block font-medium">{m.title}</span>
          <span className="block truncate text-xs text-muted-foreground">{m.body}</span>
        </div>
      ),
    },
    {
      id: 'then',
      header: 'Then',
      cell: (m) => <span className="text-muted-foreground">{m.set_status ? `mark ${m.set_status}` : '—'}</span>,
    },
    { id: 'uses', header: 'Used', className: 'text-right tabular-nums', cell: (m) => num(m.use_count) },
    ...(manage
      ? [
          {
            id: 'remove',
            header: '',
            className: 'text-right',
            cell: (m: Macro) => (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => confirm(`Remove “${m.title}”?`) && remove.mutate(m.id)}
              >
                Remove
              </Button>
            ),
          } satisfies Column<Macro>,
        ]
      : []),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-xs text-muted-foreground">
          Answers the team gives often. Insert one from any ticket and edit it before sending.
          <code className="mx-1 rounded bg-muted px-1">{'{{name}}'}</code>
          <code className="mr-1 rounded bg-muted px-1">{'{{agent}}'}</code>
          and <code className="mx-1 rounded bg-muted px-1">{'{{subject}}'}</code>
          are filled in for you.
        </p>
        {manage && (
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="size-4" />
            New reply
          </Button>
        )}
      </div>
      <DataTable
        id="support-macros"
        columns={columns}
        rows={data}
        rowKey={(m) => m.id}
        onRowClick={manage ? (m) => setEditing(m) : undefined}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        empty="No canned replies yet"
        columnPicker={false}
      />
      {editing && (
        <MacroEditor
          key={editing === 'new' ? 'new' : editing.id}
          macro={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function MacroEditor({ macro, onClose }: { macro: Macro | null; onClose: () => void }) {
  const save = useSaveMacro();
  const [title, setTitle] = useState(macro?.title ?? '');
  const [body, setBody] = useState(macro?.body ?? '');
  const [then, setThen] = useState<string>(macro?.set_status ?? 'none');

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{macro ? 'Edit canned reply' : 'New canned reply'}</DialogTitle>
        </DialogHeader>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name it — “Zip download fixed”" maxLength={80} />
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={7}
          maxLength={4000}
          placeholder={'Hi {{name}},\n\nThanks for your patience — …\n\n{{agent}}'}
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          After sending,
          <Select value={then} onValueChange={setThen}>
            <SelectTrigger size="sm" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">leave the status</SelectItem>
              <SelectItem value="pending">mark it pending</SelectItem>
              <SelectItem value="resolved">mark it resolved</SelectItem>
              <SelectItem value="closed">close it</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!title.trim() || !body.trim() || save.isPending}
            onClick={() =>
              save.mutate(
                { id: macro?.id, input: { title, body, setStatus: then === 'none' ? null : then } },
                { onSuccess: onClose },
              )
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
