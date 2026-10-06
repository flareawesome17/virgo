'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronRight, Gift, Search, Users2 } from 'lucide-react';
import type { Promo, PromoGrant } from '@/api/console';
import {
  useCreatePromo,
  useGrantPromo,
  useMe,
  usePromoGrants,
  usePromos,
  useSetPromoActive,
  useUsers,
} from '@/hooks/useConsole';
import { DataTable, type Column } from '@/components/console/data-table';
import {
  PageHeader,
  StatusDot,
  bytes,
  num,
  until,
  when,
} from '@/components/console/primitives';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

const GB = 1024 ** 3;

/** What a promo gives, in one line. Same wording the app and the API use. */
function rewardLabel(p: {
  storageBytes: number;
  extraWorkspaces: number;
  extraAlbumsPerWorkspace: number;
}): string {
  const parts: string[] = [];
  if (p.storageBytes > 0) parts.push(bytes(p.storageBytes));
  if (p.extraWorkspaces > 0) parts.push(`+${p.extraWorkspaces} workspaces`);
  if (p.extraAlbumsPerWorkspace > 0) {
    parts.push(`+${p.extraAlbumsPerWorkspace} albums/workspace`);
  }
  return parts.length ? parts.join(' · ') : '—';
}

/**
 * Creating a promo.
 *
 * The three reward fields map one-to-one onto the limits the server enforces,
 * so a promo is addition rather than a special case — which is why any
 * combination is allowed and why "all three empty" is the only invalid one.
 */
function CreatePromoDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<'targeted' | 'referral'>('targeted');
  const [storageGb, setStorageGb] = useState('5');
  const [workspaces, setWorkspaces] = useState('0');
  const [albums, setAlbums] = useState('0');
  const [expiry, setExpiry] = useState('14');
  const create = useCreatePromo();

  const num = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const givesSomething =
    num(storageGb) > 0 || num(workspaces) > 0 || num(albums) > 0;

  const submit = async () => {
    await create.mutateAsync({
      name: name.trim(),
      description: description.trim() || undefined,
      kind,
      storageBytes: Math.round(num(storageGb) * GB),
      extraWorkspaces: num(workspaces),
      extraAlbumsPerWorkspace: num(albums),
      // Blank means it never expires, which is different from zero.
      claimWindowDays: expiry.trim() === '' ? null : num(expiry) || null,
    });
    setOpen(false);
    setName('');
    setDescription('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Gift className="size-4" />
          New promo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New promo</DialogTitle>
          <DialogDescription>
            What it gives, and how it reaches people. Nothing is handed out until
            you select accounts — except a referral promo, which pays out on its
            own.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="promo-name">Name</Label>
            <Input
              id="promo-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Beta storage boost"
            />
            <p className="text-xs text-muted-foreground">
              Recipients see this, so write it as an offer rather than a code.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="promo-description">Description</Label>
            <Textarea
              id="promo-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Thanks for being one of the first."
            />
          </div>

          <div className="grid gap-2">
            <Label>Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="targeted">
                  Targeted — you pick who gets it
                </SelectItem>
                <SelectItem value="referral">
                  Referral — pays whoever invited a new account
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {kind === 'targeted'
                ? 'Offered to the accounts you select. They claim it in the app.'
                : 'Pays the referrer only, once the account they invited confirms its email address. Only the newest active referral promo is used.'}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="promo-storage">Storage (GB)</Label>
              <Input
                id="promo-storage"
                inputMode="decimal"
                value={storageGb}
                onChange={(e) => setStorageGb(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="promo-workspaces">Workspaces</Label>
              <Input
                id="promo-workspaces"
                inputMode="numeric"
                value={workspaces}
                onChange={(e) => setWorkspaces(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="promo-albums">Albums each</Label>
              <Input
                id="promo-albums"
                inputMode="numeric"
                value={albums}
                onChange={(e) => setAlbums(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="promo-expiry">Claim window (days)</Label>
            <Input
              id="promo-expiry"
              inputMode="numeric"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              placeholder="Leave blank for no expiry"
            />
            <p className="text-xs text-muted-foreground">
              Counted from when each person is offered it, not from today — so a
              promo that runs for months still gives everyone the same window.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={name.trim().length < 2 || !givesSomething || create.isPending}
          >
            {create.isPending ? 'Creating…' : 'Create promo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Picking who gets a promo.
 *
 * Search-driven rather than a full list: selecting from thousands of rows is
 * not a thing anybody does accurately, and the selection survives changing the
 * search so a batch can be assembled across several queries.
 */
function GrantDialog({ promo }: { promo: Promo }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Record<string, string>>({});
  const { data, isLoading } = useUsers({ q: q.trim() || undefined, limit: 50 });
  const grant = useGrantPromo();

  const ids = useMemo(() => Object.keys(selected), [selected]);

  const toggle = (id: string, label: string) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = label;
      return next;
    });

  const send = async () => {
    await grant.mutateAsync({ id: promo.id, userIds: ids });
    setOpen(false);
    setSelected({});
    setQ('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={!promo.active}>
          <Users2 className="size-4" />
          Offer to…
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Offer “{promo.name}”</DialogTitle>
          <DialogDescription>
            {rewardLabel(promo)}. They see it next time they open the app and
            claim it themselves.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email"
          />
        </div>

        <ScrollArea className="h-64 rounded-md border">
          <div className="divide-y">
            {isLoading && (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            )}
            {!isLoading && data?.data.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                Nobody matches that.
              </p>
            )}
            {data?.data.map((u) => {
              const label = u.display_name || u.email;
              const on = !!selected[u.id];
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggle(u.id, label)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/60"
                >
                  <span
                    className={`grid size-5 shrink-0 place-items-center rounded border ${
                      on ? 'border-primary bg-primary text-primary-foreground' : ''
                    }`}
                  >
                    {on && <Check className="size-3.5" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {u.email}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="sm:justify-between">
          <span className="self-center text-sm text-muted-foreground">
            {ids.length === 0
              ? 'Nobody selected'
              : `${ids.length} selected${q ? ' (kept while you search)' : ''}`}
          </span>
          <span className="flex gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void send()}
              disabled={ids.length === 0 || grant.isPending}
            >
              {grant.isPending ? 'Sending…' : `Offer to ${ids.length || ''}`.trim()}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const GRANT_COLUMNS: Column<PromoGrant>[] = [
  {
    id: 'account',
    header: 'Account',
    sort: (g) => g.displayName || g.email,
    cell: (g) => (
      <>
        <span className="block text-sm font-medium">{g.displayName || g.email}</span>
        <span className="block text-xs text-muted-foreground">
          {g.referredName ? `earned when ${g.referredName} joined` : g.email}
        </span>
      </>
    ),
    csv: (g) => g.email,
  },
  {
    id: 'status',
    header: 'Status',
    sort: (g) => (g.claimedAt ? 2 : g.expiresAt && new Date(g.expiresAt) < new Date() ? 0 : 1),
    cell: (g) =>
      g.claimedAt ? (
        <StatusDot tone="ok">Claimed</StatusDot>
      ) : g.expiresAt && new Date(g.expiresAt) < new Date() ? (
        <StatusDot tone="muted">Expired</StatusDot>
      ) : (
        <StatusDot tone="info">Waiting</StatusDot>
      ),
    csv: (g) => (g.claimedAt ? 'claimed' : g.expiresAt && new Date(g.expiresAt) < new Date() ? 'expired' : 'waiting'),
  },
  {
    id: 'offered',
    header: 'Offered',
    sort: (g) => g.createdAt,
    cell: (g) => <span className="text-muted-foreground">{when(g.createdAt)}</span>,
    csv: (g) => g.createdAt,
  },
  {
    id: 'expires',
    header: 'Expires',
    sort: (g) => g.expiresAt,
    cell: (g) => <span className="text-muted-foreground">{until(g.expiresAt)}</span>,
    csv: (g) => g.expiresAt,
  },
];

/** Who holds a promo and who took it. Loaded only when a row is opened. */
function GrantList({ promoId }: { promoId: string }) {
  const { data, isLoading, isError, refetch } = usePromoGrants(promoId);
  return (
    <div className="p-3 pl-10">
      <DataTable
        id="promo-grants"
        columns={GRANT_COLUMNS}
        rows={data}
        rowKey={(g) => g.id}
        rowHref={(g) => `/virgo-users/${g.userId}`}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        empty="Nobody has been offered this yet."
        exportName="promo-grants"
      />
    </div>
  );
}

export default function PromosPage() {
  const { can } = useMe();
  const { data, isLoading, isError, isFetching, refetch } = usePromos();
  const setActive = useSetPromoActive();
  const [openRow, setOpenRow] = useState<string | null>(null);
  const manage = can('promos.manage');

  const columns: Column<Promo>[] = [
    {
      id: 'name',
      header: 'Promo',
      sort: (p) => p.name,
      cell: (p) => (
        <div className="flex items-start gap-2">
          <ChevronRight
            className={`mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform ${
              openRow === p.id ? 'rotate-90' : ''
            }`}
          />
          <div className="min-w-0">
            <span className="block font-medium">{p.name}</span>
            <span className="block text-xs text-muted-foreground">
              {p.kind === 'referral' ? 'Referral' : 'Targeted'}
              {p.description ? ` · ${p.description}` : ''}
            </span>
          </div>
        </div>
      ),
      csv: (p) => p.name,
    },
    { id: 'gives', header: 'Gives', cell: (p) => rewardLabel(p), csv: (p) => rewardLabel(p) },
    {
      id: 'expiry',
      header: 'Claim window',
      cell: (p) => (
        <span className="text-muted-foreground">
          {p.claimWindowDays ? `${p.claimWindowDays} days` : 'Never expires'}
        </span>
      ),
      csv: (p) => p.claimWindowDays,
    },
    {
      id: 'offered',
      header: 'Offered',
      sort: (p) => p.granted,
      className: 'text-right tabular-nums',
      cell: (p) => num(p.granted),
      csv: (p) => p.granted,
    },
    {
      id: 'claimed',
      header: 'Claimed',
      sort: (p) => p.claimed,
      className: 'text-right tabular-nums',
      cell: (p) => num(p.claimed),
      csv: (p) => p.claimed,
    },
    {
      id: 'active',
      header: 'Active',
      cell: (p) => (
        <Switch
          checked={p.active}
          disabled={!manage || setActive.isPending}
          onCheckedChange={(active) => setActive.mutate({ id: p.id, active })}
        />
      ),
      csv: (p) => (p.active ? 'yes' : 'no'),
    },
    {
      id: 'offer',
      header: '',
      className: 'text-right',
      cell: (p) => (manage && p.kind === 'targeted' ? <GrantDialog promo={p} /> : null),
    },
  ];

  return (
    <>
      <PageHeader
        title="Promos"
        description="Rewards you hand out. A promo adds to what an account's plan already gives — storage, workspaces, albums, or any combination — and the recipient claims it in the app."
        action={manage ? <CreatePromoDialog /> : undefined}
      />

      <DataTable
        id="promos"
        columns={columns}
        rows={data}
        rowKey={(p) => p.id}
        onRowClick={(p) => setOpenRow(openRow === p.id ? null : p.id)}
        expanded={(p) => (openRow === p.id ? <GrantList promoId={p.id} /> : null)}
        isLoading={isLoading}
        isError={isError}
        isFetching={isFetching}
        onRetry={() => void refetch()}
        empty="No promos yet. Create one to offer storage or extra workspaces to a group of accounts."
        exportName="promos"
      />

      <p className="mt-4 text-xs text-muted-foreground">
        Switching a promo off stops new offers. It never takes back a reward somebody already
        claimed — that storage is holding their work.
      </p>
    </>
  );
}
