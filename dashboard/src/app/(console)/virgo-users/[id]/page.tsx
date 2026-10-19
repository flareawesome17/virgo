'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Plus, ShieldCheck } from 'lucide-react';
import { useMe, usePresence, useSetCustomerTags, useUser } from '@/hooks/useConsole';
import { CustomerActions } from '@/components/console/customer/actions';
import { NotesTab } from '@/components/console/customer/notes';
import { OverviewTab } from '@/components/console/customer/overview';
import {
  BillingTab,
  ContentTab,
  DevicesTab,
  MarketplaceTab,
  SafetyTab,
  SupportTab,
} from '@/components/console/customer/tabs';
import { TimelineTab } from '@/components/console/customer/timeline';
import { PresenceBar } from '@/components/console/presence';
import { DataState, StatStrip, bytes, num } from '@/components/console/primitives';
import { useRecordTab } from '@/components/console/record-tabs';
import { TagChip, TagPicker } from '@/components/console/tags';
import { isPaused, isSuspended } from '@/lib/account-state';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Customer 360: one account, all the way round.
 *
 * The header says who they are and what state the account is in; the tabs
 * hold everything else, each loaded only when opened. Every action here is
 * the same one the API audits, so whatever staff do shows on the timeline.
 */
export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useMe();
  const { data: d, isLoading, isError, refetch } = useUser(id);
  const setTags = useSetCustomerTags(id);
  const [tab, setTab] = useState('overview');

  const u = d?.user;
  const name = u ? u.display_name?.trim() || u.email : undefined;
  useRecordTab({ href: `/virgo-users/${id}`, kind: 'user', title: name });
  const others = usePresence('user', id);

  const suspended = !!u && isSuspended(u);
  // Shown beside a suspension rather than instead of it: restoring access does
  // not end a pause the person chose, and the console should not look as if it
  // had.
  const paused = !!u && isPaused(u);
  const tagIds = new Set((d?.tags ?? []).map((t) => t.id));
  const openTickets = d?.tickets.filter((t) => t.status === 'open' || t.status === 'pending').length ?? 0;

  return (
    <>
      <Link
        href="/virgo-users"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Virgo users
      </Link>

      <DataState isLoading={isLoading} isError={isError} isEmpty={false} onRetry={() => void refetch()}>
        {d && u && (
          <div className="space-y-4">
            <header className="flex flex-wrap items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/15 text-sm font-bold text-primary">
                {u.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.avatar_url} alt="" className="size-full object-cover" />
                ) : (
                  (name ?? '?').slice(0, 2).toUpperCase()
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-lg font-semibold tracking-tight">{name}</h1>
                  <Badge variant="secondary" className="capitalize">
                    {u.plan}
                  </Badge>
                  {suspended && <Badge variant="destructive">Suspended</Badge>}
                  {paused && <Badge variant="outline">Paused</Badge>}
                  {!u.email_verified_at && <Badge variant="outline">Unconfirmed email</Badge>}
                  {u.two_factor && (
                    <Badge variant="outline" className="gap-1">
                      <ShieldCheck className="size-3" /> Two-factor
                    </Badge>
                  )}
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {u.email}
                  {u.handle ? ` · @${u.handle}` : ''}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {(d.tags ?? []).map((t) => (
                    <TagChip key={t.id} tag={t} />
                  ))}
                  {can('users.notes') && (
                    <TagPicker
                      selected={tagIds}
                      canCreate
                      onToggle={(tag, on) => {
                        const next = new Set(tagIds);
                        if (on) next.add(tag.id);
                        else next.delete(tag.id);
                        setTags.mutate([...next]);
                      }}
                      trigger={
                        <button
                          type="button"
                          className="inline-flex h-5 items-center gap-1 rounded-full border border-dashed px-2 text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          <Plus className="size-3" />
                          {tagIds.size ? 'Tag' : 'Add a tag'}
                        </button>
                      }
                    />
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <PresenceBar others={others} />
                <CustomerActions customer={d} />
              </div>
            </header>

            <StatStrip
              items={[
                {
                  label: 'Storage',
                  value: bytes(d.storage.bytes),
                  hint: d.storage.limitBytes
                    ? `of ${bytes(d.storage.limitBytes)}${d.storage.bonusBytes ? ` incl. ${bytes(d.storage.bonusBytes)} promo` : ''}`
                    : 'unlimited',
                  tone:
                    d.storage.limitBytes && d.storage.bytes / d.storage.limitBytes >= 0.8 ? 'warn' : 'default',
                },
                { label: 'Files', value: num(d.storage.files) },
                {
                  label: 'Workspaces',
                  value: num(d.workspaces.length),
                  hint: d.limits.workspaces === null ? 'unlimited' : `limit ${d.limits.workspaces}`,
                },
                { label: 'Albums', value: num(d.albums.length) },
                {
                  label: 'Open tickets',
                  value: num(openTickets),
                  tone: openTickets ? 'warn' : 'default',
                },
              ]}
            />

            <Tabs value={tab} onValueChange={setTab}>
              <div className="overflow-x-auto [scrollbar-width:none]">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  <TabsTrigger value="notes">Notes</TabsTrigger>
                  <TabsTrigger value="support">Support · {d.tickets.length}</TabsTrigger>
                  <TabsTrigger value="content">Content</TabsTrigger>
                  {can('billing.read') && <TabsTrigger value="billing">Billing</TabsTrigger>}
                  <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
                  {can('content.read') && <TabsTrigger value="safety">Safety</TabsTrigger>}
                  <TabsTrigger value="devices">Devices</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="overview" className="mt-4">
                <OverviewTab customer={d} onOpenNotes={() => setTab('notes')} />
              </TabsContent>
              <TabsContent value="timeline" className="mt-4">
                <TimelineTab id={id} />
              </TabsContent>
              <TabsContent value="notes" className="mt-4">
                <NotesTab id={id} />
              </TabsContent>
              <TabsContent value="support" className="mt-4">
                <SupportTab customer={d} />
              </TabsContent>
              <TabsContent value="content" className="mt-4">
                <ContentTab customer={d} />
              </TabsContent>
              {can('billing.read') && (
                <TabsContent value="billing" className="mt-4">
                  <BillingTab id={id} />
                </TabsContent>
              )}
              <TabsContent value="marketplace" className="mt-4">
                <MarketplaceTab id={id} />
              </TabsContent>
              {can('content.read') && (
                <TabsContent value="safety" className="mt-4">
                  <SafetyTab id={id} />
                </TabsContent>
              )}
              <TabsContent value="devices" className="mt-4">
                <DevicesTab id={id} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DataState>
    </>
  );
}
