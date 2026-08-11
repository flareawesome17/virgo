'use client';

import { Fragment, useMemo, useState } from 'react';
import { Check, Gift, Search, Users2 } from 'lucide-react';
import type { Promo } from '@/api/console';
import {
  useCreatePromo,
  useGrantPromo,
  useMe,
  usePromoGrants,
  usePromos,
  useSetPromoActive,
  useUsers,
} from '@/hooks/useConsole';
import {
  DataState,
  PageHeader,
  bytes,
  until,
  when,
} from '@/components/console/primitives';
import { Badge } from '@/components/ui/badge';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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

/** Who holds a promo and who took it. Loaded only when a row is opened. */
function GrantList({ promoId }: { promoId: string }) {
  const { data, isLoading } = usePromoGrants(promoId);

  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  }
  if (!data?.length) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Nobody has been offered this yet.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Account</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Offered</TableHead>
          <TableHead>Expires</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((g) => (
          <TableRow key={g.id}>
            <TableCell>
              <span className="block text-sm font-medium">
                {g.displayName || g.email}
              </span>
              <span className="block text-xs text-muted-foreground">
                {g.referredName ? `earned when ${g.referredName} joined` : g.email}
              </span>
            </TableCell>
            <TableCell>
              {g.claimedAt ? (
                <Badge variant="secondary">Claimed</Badge>
              ) : g.expiresAt && new Date(g.expiresAt) < new Date() ? (
                <Badge variant="outline">Expired</Badge>
              ) : (
                <Badge>Waiting</Badge>
              )}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {when(g.createdAt)}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {until(g.expiresAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function PromosPage() {
  const { can } = useMe();
  const { data, isLoading, isError, refetch } = usePromos();
  const setActive = useSetPromoActive();
  const [openRow, setOpenRow] = useState<string | null>(null);
  const manage = can('promos.manage');

  return (
    <>
      <PageHeader
        title="Promos"
        description="Rewards you hand out. A promo adds to what an account's plan already gives — storage, workspaces, albums, or any combination — and the recipient claims it in the app."
        action={manage ? <CreatePromoDialog /> : undefined}
      />

      <DataState
        isLoading={isLoading}
        isError={isError}
        isEmpty={!!data && data.length === 0}
        emptyLabel="No promos yet. Create one to offer storage or extra workspaces to a group of accounts."
        onRetry={() => void refetch()}
      >
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Promo</TableHead>
                <TableHead>Gives</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Offered</TableHead>
                <TableHead>Claimed</TableHead>
                <TableHead>Active</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((p) => (
                // A keyed Fragment, not `<>`: the shorthand takes no key, and a
                // promo renders two sibling rows when its grants are open.
                <Fragment key={p.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => setOpenRow(openRow === p.id ? null : p.id)}
                  >
                    <TableCell>
                      <span className="block font-medium">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {p.kind === 'referral' ? 'Referral' : 'Targeted'}
                        {p.description ? ` · ${p.description}` : ''}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{rewardLabel(p)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.claimWindowDays ? `${p.claimWindowDays} days` : 'Never'}
                    </TableCell>
                    <TableCell className="text-sm">{p.granted}</TableCell>
                    <TableCell className="text-sm">{p.claimed}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={p.active}
                        disabled={!manage || setActive.isPending}
                        onCheckedChange={(active) =>
                          setActive.mutate({ id: p.id, active })
                        }
                      />
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {manage && p.kind === 'targeted' && <GrantDialog promo={p} />}
                    </TableCell>
                  </TableRow>
                  {openRow === p.id && (
                    <TableRow>
                      <TableCell colSpan={7} className="bg-muted/30 p-0">
                        <GrantList promoId={p.id} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </DataState>

      <p className="mt-4 text-xs text-muted-foreground">
        Switching a promo off stops new offers. It never takes back a reward
        somebody already claimed — that storage is holding their work.
      </p>
    </>
  );
}
