'use client';

import { useMemo, useState } from 'react';
import { Bell, Megaphone, Plus, Send } from 'lucide-react';
import type { AudienceFilters, AppUpdateRow, Broadcast, Segment } from '@/api/console';
import {
  useAnnounceUpdate,
  useAppUpdates,
  useAudience,
  useBroadcasts,
  useCancelBroadcast,
  useCreateBroadcast,
  useMe,
  useRemoveSegment,
  useSaveSegment,
  useSegments,
  useSendBroadcastNow,
  useTags,
} from '@/hooks/useConsole';
import { DataTable, type Column } from '@/components/console/data-table';
import { PageHeader, StatusDot, num, when } from '@/components/console/primitives';
import { AudienceCount, AudienceEditor, describeAudience } from '@/components/console/audience';
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
import { cn } from '@/lib/utils';

export default function OutreachPage() {
  const [tab, setTab] = useState('broadcasts');
  return (
    <>
      <PageHeader
        title="Outreach"
        description="Messages to many customers at once: broadcasts to a segment or to everyone, the segments themselves, and app-update announcements."
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="broadcasts">Broadcasts</TabsTrigger>
          <TabsTrigger value="segments">Segments</TabsTrigger>
          <TabsTrigger value="updates">App updates</TabsTrigger>
        </TabsList>
        <TabsContent value="broadcasts" className="mt-4">
          <BroadcastsTab />
        </TabsContent>
        <TabsContent value="segments" className="mt-4">
          <SegmentsTab />
        </TabsContent>
        <TabsContent value="updates" className="mt-4">
          <UpdatesTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

// ─── Broadcasts ─────────────────────────────────────────────────────────────

function StatusOf({ b }: { b: Broadcast }) {
  if (b.status === 'scheduled') return <StatusDot tone="info">Scheduled {when(b.send_at)}</StatusDot>;
  if (b.status === 'sending') {
    return (
      <StatusDot tone="warn">
        Sending {num(b.delivered)}/{num(b.recipients ?? 0)}
      </StatusDot>
    );
  }
  if (b.status === 'cancelled') {
    return <StatusDot tone="muted">Cancelled{b.cancelled_by_name ? ` by ${b.cancelled_by_name}` : ''}</StatusDot>;
  }
  return <StatusDot tone="ok">Sent {when(b.finished_at)}</StatusDot>;
}

function BroadcastsTab() {
  const { can } = useMe();
  const manage = can('outreach.manage');
  const { data, isLoading, isError, isFetching, refetch } = useBroadcasts();
  const { data: tags } = useTags();
  const cancel = useCancelBroadcast();
  const sendNow = useSendBroadcastNow();
  const [composing, setComposing] = useState(false);

  const columns: Column<Broadcast>[] = [
    {
      id: 'message',
      header: 'Message',
      cell: (b) => (
        <div className="min-w-0 max-w-sm">
          <p className="truncate font-medium">{b.title}</p>
          <p className="truncate text-xs text-muted-foreground">{b.body}</p>
        </div>
      ),
      csv: (b) => b.title,
    },
    {
      id: 'audience',
      header: 'To',
      cell: (b) => (
        <span className="block max-w-[14rem] truncate text-muted-foreground">
          {b.segment_name ?? describeAudience(b.filters, tags)}
        </span>
      ),
      csv: (b) => b.segment_name ?? describeAudience(b.filters),
    },
    { id: 'status', header: 'Status', cell: (b) => <StatusOf b={b} />, csv: (b) => b.status },
    {
      id: 'reach',
      header: 'Reached',
      className: 'tabular-nums',
      cell: (b) =>
        b.status === 'scheduled' ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="text-xs">
            <span className="text-sm font-semibold">{num(b.delivered)}</span> in the app
            {b.push && (
              <span className="text-muted-foreground">
                {' '}
                · {num(b.pushed)} pushed{b.push_failed ? `, ${num(b.push_failed)} failed` : ''}
              </span>
            )}
          </span>
        ),
      csv: (b) => b.delivered,
    },
    {
      id: 'opened',
      header: 'Opened',
      className: 'tabular-nums',
      cell: (b) =>
        b.delivered ? (
          <span>
            {num(b.opened)}
            <span className="ml-1 text-xs text-muted-foreground">{Math.round((b.opened / b.delivered) * 100)}%</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      csv: (b) => b.opened,
    },
    { id: 'by', header: 'By', cell: (b) => <span className="text-muted-foreground">{b.created_by_name ?? '—'}</span>, csv: (b) => b.created_by_name },
    ...(manage
      ? [
          {
            id: 'actions',
            header: '',
            className: 'text-right',
            cell: (b: Broadcast) => (
              <span className="inline-flex gap-1.5">
                {b.status === 'scheduled' && (
                  <Button size="xs" variant="outline" disabled={sendNow.isPending} onClick={() => sendNow.mutate(b.id)}>
                    Send now
                  </Button>
                )}
                {(b.status === 'scheduled' || b.status === 'sending') && (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="text-destructive"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate(b.id)}
                  >
                    Cancel
                  </Button>
                )}
              </span>
            ),
          } satisfies Column<Broadcast>,
        ]
      : []),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          A broadcast lands in the app&apos;s notifications for everyone it reaches, and as a push on phones where people
          allow update notifications. Suspended accounts are always left out.
        </p>
        {manage && (
          <Button size="sm" onClick={() => setComposing(true)}>
            <Plus className="size-4" />
            New broadcast
          </Button>
        )}
      </div>
      <DataTable
        id="broadcasts"
        columns={columns}
        rows={data}
        rowKey={(b) => b.id}
        isLoading={isLoading}
        isError={isError}
        isFetching={isFetching}
        onRetry={() => void refetch()}
        empty="Nothing sent yet"
        exportName="broadcasts"
      />
      <BroadcastComposer open={composing} onClose={() => setComposing(false)} />
    </div>
  );
}

const EVERYONE = '__everyone';
const PACES = [
  { value: '200', label: '200 a minute' },
  { value: '1000', label: '1,000 a minute' },
  { value: '5000', label: '5,000 a minute' },
];

function BroadcastComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: segments } = useSegments(open);
  const create = useCreateBroadcast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [segmentId, setSegmentId] = useState(EVERYONE);
  const [push, setPush] = useState(true);
  const [later, setLater] = useState(false);
  const [sendAt, setSendAt] = useState('');
  const [pace, setPace] = useState('1000');
  const [confirming, setConfirming] = useState(false);

  const segment = segments?.find((s) => s.id === segmentId) ?? null;
  const filters: AudienceFilters = useMemo(() => segment?.filters ?? {}, [segment]);
  const { data: reach } = useAudience(filters, open);
  const urlOk = !url.trim() || /^https:\/\/\S+$/.test(url.trim());
  const whenOk = !later || !!sendAt;
  // Checked on Review rather than while drawing: the clock is not render state.
  const [past, setPast] = useState(false);
  const ready = title.trim() && body.trim() && urlOk && whenOk;

  const reset = () => {
    setTitle('');
    setBody('');
    setUrl('');
    setSegmentId(EVERYONE);
    setPush(true);
    setLater(false);
    setSendAt('');
    setPace('1000');
    setConfirming(false);
    setPast(false);
  };
  const close = () => {
    if (create.isPending) return;
    reset();
    onClose();
  };
  const submit = () =>
    create.mutate(
      {
        title: title.trim(),
        body: body.trim(),
        url: url.trim() || null,
        segmentId: segment?.id ?? null,
        push,
        sendAt: later ? new Date(sendAt).toISOString() : null,
        perMinute: Number(pace),
      },
      { onSuccess: close },
    );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{confirming ? 'Send this?' : 'New broadcast'}</DialogTitle>
          <DialogDescription>
            {confirming
              ? 'A broadcast cannot be taken back once it has gone. It can be cancelled while it is still sending.'
              : 'In the app for everyone it reaches, and pushed where people allow it.'}
          </DialogDescription>
        </DialogHeader>

        {confirming ? (
          <div className="space-y-3 text-sm">
            <Preview title={title} body={body} />
            <p>
              To <strong>{segment ? segment.name : 'everyone'}</strong>:{' '}
              <strong className="tabular-nums">{num(reach?.count ?? 0)}</strong> people
              {push ? `, ${num(reach?.withPhone ?? 0)} of them with a phone app` : ', in the app only'}.{' '}
              {later ? `On ${new Date(sendAt).toLocaleString()}` : 'Starting within a minute'}, {Number(pace).toLocaleString()} a
              minute.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <Label htmlFor="b-title">Title</Label>
                  <span className="text-xs text-muted-foreground">{title.length}/80</span>
                </div>
                <Input id="b-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Faster uploads are here" />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <Label htmlFor="b-body">Message</Label>
                  <span className="text-xs text-muted-foreground">{body.length}/600</span>
                </div>
                <Textarea id="b-body" rows={4} value={body} maxLength={600} onChange={(e) => setBody(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-url">Link (optional)</Label>
                <Input id="b-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://virgo.ph/…" />
                {!urlOk && <p className="text-xs text-destructive">The link must start with https://</p>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="b-segment">To</Label>
                  <Select value={segmentId} onValueChange={setSegmentId}>
                    <SelectTrigger id="b-segment" size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EVERYONE}>Everyone</SelectItem>
                      {segments?.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} · {num(s.count)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="b-pace">Pace</Label>
                  <Select value={pace} onValueChange={setPace}>
                    <SelectTrigger id="b-pace" size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PACES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <AudienceCount filters={filters} compact />
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={push} onCheckedChange={setPush} aria-label="Push to phones as well" />
                Push to phones as well, where people allow update notifications
              </label>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name="b-when" checked={!later} onChange={() => setLater(false)} className="accent-primary" />
                  Now
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="b-when" checked={later} onChange={() => setLater(true)} className="accent-primary" />
                  Later
                </label>
                {later && (
                  <Input
                    type="datetime-local"
                    value={sendAt}
                    onChange={(e) => setSendAt(e.target.value)}
                    aria-label="Send at"
                    className="h-8 w-56"
                  />
                )}
                {later && past && <span className="text-xs text-destructive">Pick a time ahead.</span>}
              </div>
            </div>
            <div className="space-y-2">
              <p className="caption">How it shows</p>
              <Preview title={title} body={body} />
            </div>
          </div>
        )}

        <DialogFooter>
          {confirming ? (
            <>
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={create.isPending}>
                Back
              </Button>
              <Button onClick={submit} disabled={create.isPending}>
                <Send className="size-4" />
                {later ? 'Schedule it' : `Send to ${num(reach?.count ?? 0)}`}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button
                disabled={!ready}
                onClick={() => {
                  const behind = later && new Date(sendAt).getTime() <= Date.now();
                  setPast(behind);
                  if (!behind) setConfirming(true);
                }}
              >
                Review
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Roughly how a phone draws it. */
function Preview({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border bg-muted/40 p-3">
      <div className="flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Bell className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="flex justify-between gap-2 text-[11px] text-muted-foreground">
            <span>Virgo</span>
            <span>now</span>
          </p>
          <p className="truncate text-sm font-semibold">{title || 'Title'}</p>
          <p className="line-clamp-3 text-xs text-muted-foreground">{body || 'Your message'}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Segments ───────────────────────────────────────────────────────────────

function SegmentsTab() {
  const { can } = useMe();
  const manage = can('outreach.manage');
  const { data, isLoading, isError, isFetching, refetch } = useSegments();
  const { data: tags } = useTags();
  const remove = useRemoveSegment();
  const [editing, setEditing] = useState<Segment | 'new' | null>(null);

  const columns: Column<Segment>[] = [
    {
      id: 'name',
      header: 'Segment',
      cell: (s) => (
        <div className="min-w-0 max-w-xs">
          <p className="truncate font-medium">{s.name}</p>
          {s.description && <p className="truncate text-xs text-muted-foreground">{s.description}</p>}
        </div>
      ),
      csv: (s) => s.name,
    },
    {
      id: 'who',
      header: 'Who',
      cell: (s) => <span className="block max-w-sm truncate text-muted-foreground">{describeAudience(s.filters, tags)}</span>,
      csv: (s) => describeAudience(s.filters),
    },
    { id: 'count', header: 'People', className: 'text-right tabular-nums', sort: (s) => s.count, cell: (s) => <span className="font-semibold">{num(s.count)}</span>, csv: (s) => s.count },
    { id: 'by', header: 'By', cell: (s) => <span className="text-muted-foreground">{s.created_by_name ?? '—'}</span> },
    { id: 'updated', header: 'Changed', cell: (s) => <span className="text-muted-foreground">{when(s.updated_at)}</span> },
    ...(manage
      ? [
          {
            id: 'remove',
            header: '',
            className: 'text-right',
            cell: (s: Segment) => (
              <Button
                size="xs"
                variant="ghost"
                className="text-destructive"
                disabled={remove.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Delete “${s.name}”? Broadcasts already sent to it keep their numbers.`)) remove.mutate(s.id);
                }}
              >
                Delete
              </Button>
            ),
          } satisfies Column<Segment>,
        ]
      : []),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Saved audiences, counted as they are today. Broadcasts and promo offers can go to any of them.
        </p>
        {manage && (
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="size-4" />
            New segment
          </Button>
        )}
      </div>
      <DataTable
        id="segments"
        columns={columns}
        rows={data}
        rowKey={(s) => s.id}
        onRowClick={manage ? (s) => setEditing(s) : undefined}
        isLoading={isLoading}
        isError={isError}
        isFetching={isFetching}
        onRetry={() => void refetch()}
        empty="No segments yet"
        exportName="segments"
      />
      <SegmentDialog segment={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function SegmentDialog({ segment, onClose }: { segment: Segment | 'new' | null; onClose: () => void }) {
  const save = useSaveSegment();
  const existing = segment && segment !== 'new' ? segment : null;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [filters, setFilters] = useState<AudienceFilters>({});
  // Loaded as it opens: the dialog is one component for every segment.
  const [loaded, setLoaded] = useState<Segment | 'new' | null>(null);
  if (segment !== loaded) {
    setLoaded(segment);
    setName(existing?.name ?? '');
    setDescription(existing?.description ?? '');
    setFilters(existing?.filters ?? {});
  }

  return (
    <Dialog open={!!segment} onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{existing ? `Edit “${existing.name}”` : 'New segment'}</DialogTitle>
          <DialogDescription>
            The people list&apos;s filters, saved. Who it reaches is counted again every time it is used.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="seg-name">Name</Label>
                <Input id="seg-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Studios quiet for a month" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="seg-desc">What it is for (optional)</Label>
                <Input id="seg-desc" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </div>
            <AudienceEditor value={filters} onChange={setFilters} />
          </div>
          <div className="space-y-2">
            <p className="caption">Who it reaches</p>
            <AudienceCount filters={filters} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || save.isPending}
            onClick={() =>
              save.mutate(
                { id: existing?.id, input: { name: name.trim(), description: description.trim() || null, filters } },
                { onSuccess: onClose },
              )
            }
          >
            Save segment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── App updates ────────────────────────────────────────────────────────────

const PLATFORM_LABEL: Record<string, string> = {
  ios: 'iPhone',
  android: 'Android',
  web: 'Web',
  windows: 'Windows',
  macos: 'macOS',
};

function UpdatesTab() {
  const { can } = useMe();
  const { data, isLoading, isError, isFetching, refetch } = useAppUpdates();
  const [announcing, setAnnouncing] = useState(false);

  const columns: Column<AppUpdateRow>[] = [
    {
      id: 'title',
      header: 'Announcement',
      cell: (u) => (
        <div className="min-w-0 max-w-sm">
          <p className="truncate font-medium">{u.title}</p>
          <p className="truncate text-xs text-muted-foreground">{u.body}</p>
        </div>
      ),
      csv: (u) => u.title,
    },
    {
      id: 'where',
      header: 'Where',
      cell: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.platforms.map((p) => (
            <Badge key={p} variant="secondary" className="font-normal">
              {PLATFORM_LABEL[p] ?? p}
            </Badge>
          ))}
        </div>
      ),
      csv: (u) => u.platforms.join(' '),
    },
    {
      id: 'versions',
      header: 'Versions',
      cell: (u) => (
        <span className="font-mono text-xs text-muted-foreground">
          {u.version ? `v${u.version}` : ''}
          {u.min_version || u.max_version ? ` (${u.min_version ?? '…'}–${u.max_version ?? '…'})` : ''}
          {!u.version && !u.min_version && !u.max_version ? 'any' : ''}
        </span>
      ),
    },
    { id: 'reads', header: 'Read', className: 'text-right tabular-nums', cell: (u) => num(u.reads), csv: (u) => u.reads },
    { id: 'pushed', header: 'Pushed', className: 'text-right tabular-nums', cell: (u) => (u.pushed === null ? '—' : num(u.pushed)), csv: (u) => u.pushed },
    { id: 'by', header: 'By', cell: (u) => <span className="text-muted-foreground">{u.created_by_name ?? 'the workflow'}</span> },
    { id: 'when', header: 'When', cell: (u) => <span className="text-muted-foreground">{when(u.published_at)}</span>, csv: (u) => u.published_at },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          What&apos;s new, shown in the app to the platforms and versions it is about, and pushed to those phones.
        </p>
        {can('outreach.manage') && (
          <Button size="sm" onClick={() => setAnnouncing(true)}>
            <Megaphone className="size-4" />
            Announce an update
          </Button>
        )}
      </div>
      <DataTable
        id="app-updates"
        columns={columns}
        rows={data}
        rowKey={(u) => u.id}
        isLoading={isLoading}
        isError={isError}
        isFetching={isFetching}
        onRetry={() => void refetch()}
        empty="No announcements yet"
        exportName="app-updates"
      />
      <AnnounceDialog open={announcing} onClose={() => setAnnouncing(false)} />
    </div>
  );
}

/** "1.16.0 faster albums" + today → "1-16-0-faster-albums-20261007". */
function slugFor(version: string, title: string): string {
  const base = `${version} ${title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${base || 'update'}-${day}`;
}

const VERSION = /^v?\d{1,6}(\.\d{1,6}){0,3}$/;

function AnnounceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const announce = useAnnounceUpdate();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [version, setVersion] = useState('');
  const [minVersion, setMinVersion] = useState('');
  const [maxVersion, setMaxVersion] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(['ios', 'android']);
  const [push, setPush] = useState(true);
  const [slug, setSlug] = useState('');
  const auto = slugFor(version, title);
  const finalSlug = slug.trim() || auto;

  const versionOk = [version, minVersion, maxVersion].every((v) => !v.trim() || VERSION.test(v.trim()));
  const urlOk = !url.trim() || /^https:\/\/\S+$/.test(url.trim());
  const ready = title.trim() && body.trim() && platforms.length > 0 && versionOk && urlOk && /^[a-z0-9][a-z0-9.-]{2,79}$/.test(finalSlug);

  const close = () => {
    if (announce.isPending) return;
    setTitle('');
    setBody('');
    setUrl('');
    setVersion('');
    setMinVersion('');
    setMaxVersion('');
    setPlatforms(['ios', 'android']);
    setPush(true);
    setSlug('');
    onClose();
  };
  const toggle = (p: string) => setPlatforms((list) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Announce an update</DialogTitle>
          <DialogDescription>
            Shown under What&apos;s new on the platforms you pick, to the versions you pick, and pushed to those phones.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <div className="space-y-1.5">
              <Label htmlFor="u-title">Title</Label>
              <Input id="u-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Albums load twice as fast" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-version">Version</Label>
              <Input id="u-version" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.16.0" className="font-mono" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-body">What changed</Label>
            <Textarea id="u-body" rows={3} value={body} maxLength={600} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-url">Link (optional)</Label>
            <Input id="u-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://virgo.ph/download" />
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Where</legend>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(PLATFORM_LABEL).map(([p, label]) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={platforms.includes(p)}
                  onClick={() => toggle(p)}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-xs font-medium',
                    platforms.includes(p) ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="u-min">Only from version (optional)</Label>
              <Input id="u-min" value={minVersion} onChange={(e) => setMinVersion(e.target.value)} placeholder="1.15.0" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-max">Up to version (optional)</Label>
              <Input id="u-max" value={maxVersion} onChange={(e) => setMaxVersion(e.target.value)} placeholder="1.15.9" className="font-mono" />
            </div>
          </div>
          {!versionOk && <p className="text-xs text-destructive">Versions are numbers like 1.16.0.</p>}
          {!urlOk && <p className="text-xs text-destructive">The link must start with https://</p>}
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={push} onCheckedChange={setPush} aria-label="Push to those phones" />
            Push to those phones, where people allow update notifications
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="u-slug">Its name, so it is never announced twice</Label>
            <Input id="u-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={auto} className="font-mono text-xs" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={!ready || announce.isPending}
            onClick={() =>
              announce.mutate(
                {
                  slug: finalSlug,
                  platforms,
                  title: title.trim(),
                  body: body.trim(),
                  ...(version.trim() ? { version: version.trim() } : {}),
                  ...(minVersion.trim() ? { minVersion: minVersion.trim() } : {}),
                  ...(maxVersion.trim() ? { maxVersion: maxVersion.trim() } : {}),
                  ...(url.trim() ? { url: url.trim() } : {}),
                  push,
                },
                { onSuccess: close },
              )
            }
          >
            <Megaphone className="size-4" />
            Announce
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
