'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useMe, useOverview } from '@/hooks/useConsole';
import {
  DataState,
  MiniBars,
  PageHeader,
  Panel,
  StatStrip,
  bytes,
  num,
} from '@/components/console/primitives';
import { FilterChips } from '@/components/console/data-table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const WINDOWS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
] as const;

export default function OverviewPage() {
  const { can } = useMe();
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const { data, isLoading, isError, refetch } = useOverview(Number(days));

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Virgo at a glance, over the last ${days} days.`}
        action={<FilterChips value={days} onChange={setDays} options={[...WINDOWS]} />}
      />

      <DataState
        isLoading={isLoading}
        isError={isError}
        isEmpty={false}
        onRetry={() => void refetch()}
      >
        {data && (
          <div className="space-y-4">
            <StatStrip
              items={[
                {
                  label: 'Total users',
                  value: num(data.totals.users),
                  hint: `${num(data.totals.newUsers)} new in ${days} days`,
                },
                {
                  label: 'Active (7 days)',
                  value: num(data.totals.activeUsers),
                  hint: `${num(data.totals.verifiedUsers)} verified`,
                },
                {
                  label: 'Site visits',
                  value: num(data.visits.views),
                  hint: `${num(data.visits.visitors)} unique`,
                },
                {
                  label: 'Storage used',
                  value: bytes(data.totals.storageBytes),
                  hint: `${num(data.totals.files)} files`,
                },
              ]}
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Signups per day">
                <MiniBars
                  label={`Last ${days} days`}
                  data={data.signups.map((s) => ({ day: s.day, value: s.count }))}
                />
              </Panel>
              <Panel title="Site visits per day">
                <MiniBars
                  label={`Last ${days} days`}
                  data={data.visits.daily.map((v) => ({ day: v.day, value: v.views }))}
                />
              </Panel>
            </div>

            <StatStrip
              items={[
                { label: 'Workspaces', value: num(data.totals.workspaces) },
                { label: 'Albums', value: num(data.totals.albums) },
                { label: 'Live client links', value: num(data.totals.shareLinks) },
                {
                  label: 'Open jobs',
                  value: num(data.totals.openJobs),
                  hint: `${num(data.totals.applications)} applications`,
                },
              ]}
            />

            <div className="grid gap-4 lg:grid-cols-3">
              <Panel title="Needs attention" bodyClassName="p-1.5">
                <AttentionRow
                  label="Open tickets"
                  value={data.totals.openTickets}
                  href={can('support.read') ? '/support' : undefined}
                />
                <AttentionRow
                  label="Reported people"
                  value={data.totals.userReports ?? 0}
                  href={can('content.read') ? '/content' : undefined}
                />
                <AttentionRow
                  label="Reported job posts"
                  value={data.totals.reports}
                  href={can('content.read') ? '/content' : undefined}
                />
              </Panel>

              <Panel title="Accounts by plan" bodyClassName="py-2">
                {data.byPlan.map((p) => (
                  <div key={p.plan} className="flex items-center justify-between py-1 text-sm">
                    <span className="capitalize text-muted-foreground">{p.plan}</span>
                    <span className="font-medium tabular-nums">{num(p.count)}</span>
                  </div>
                ))}
              </Panel>

              <Panel title="Most visited" bodyClassName="py-2">
                {data.visits.topPaths.length === 0 ? (
                  <p className="py-1 text-xs text-muted-foreground">
                    Nothing recorded yet. Visits appear once the beacon is live on the site.
                  </p>
                ) : (
                  data.visits.topPaths.slice(0, 6).map((p) => (
                    <div
                      key={`${p.host}${p.path}`}
                      className="flex items-baseline justify-between gap-3 py-1"
                    >
                      {/* The host is shown, not just the path. Rows are
                          grouped by host *and* path, so virgo.ph/s and
                          client.virgo.ph/s are two different things that
                          rendered as one line repeated. */}
                      <span className="min-w-0 truncate font-mono text-xs">
                        <span className="text-muted-foreground">{p.host}</span>
                        {p.path === '/' ? '' : p.path}
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {num(p.views)}
                      </span>
                    </div>
                  ))
                )}
              </Panel>
            </div>

            {data.visits.referrers.length > 0 && (
              <section>
                <p className="caption mb-2">Where visitors came from</p>
                <div className="flex flex-wrap gap-1.5">
                  {data.visits.referrers.map((r) => (
                    <Badge key={r.host} variant="secondary">
                      {r.host} · {num(r.views)}
                    </Badge>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </DataState>
    </>
  );
}

/** A count that wants someone, linked to where it is dealt with. */
function AttentionRow({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <>
      <span className="flex-1 text-muted-foreground">{label}</span>
      <span
        className={cn(
          'tabular-nums',
          value > 0 ? 'font-semibold text-warning' : 'font-medium text-muted-foreground',
        )}
      >
        {num(value)}
      </span>
      {href && <ChevronRight className="size-3.5 text-muted-foreground" />}
    </>
  );
  const row = 'flex items-center gap-2 rounded-md px-2.5 py-2 text-sm';
  return href ? (
    <Link href={href} className={cn(row, 'hover:bg-muted/60')}>
      {body}
    </Link>
  ) : (
    <div className={row}>{body}</div>
  );
}
