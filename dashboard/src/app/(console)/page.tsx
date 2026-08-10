'use client';

import { useState } from 'react';
import { useOverview } from '@/hooks/useConsole';
import {
  DataState,
  MiniBars,
  PageHeader,
  StatCard,
  bytes,
} from '@/components/console/primitives';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const WINDOWS = [7, 30, 90];

export default function OverviewPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading, isError, refetch } = useOverview(days);

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Virgo at a glance, over the last ${days} days.`}
        action={
          <div className="flex gap-1">
            {WINDOWS.map((d) => (
              <Button
                key={d}
                size="sm"
                variant={d === days ? 'default' : 'outline'}
                onClick={() => setDays(d)}
              >
                {d}d
              </Button>
            ))}
          </div>
        }
      />

      <DataState
        isLoading={isLoading}
        isError={isError}
        isEmpty={false}
        onRetry={() => void refetch()}
      >
        {data && (
          <div className="space-y-6">
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="Total users"
                value={data.totals.users}
                hint={`${data.totals.newUsers} new in ${days}d`}
              />
              <StatCard
                label="Active (7d)"
                value={data.totals.activeUsers}
                hint={`${data.totals.verifiedUsers} verified`}
              />
              <StatCard
                label="Site visits"
                value={data.visits.views}
                hint={`${data.visits.visitors} unique`}
              />
              <StatCard
                label="Storage used"
                value={bytes(data.totals.storageBytes)}
                hint={`${data.totals.files} files`}
              />
            </section>

            <section className="grid gap-3 lg:grid-cols-2">
              <Card>
                <CardContent className="p-4">
                  <MiniBars
                    label="Signups per day"
                    data={data.signups.map((s) => ({ day: s.day, value: s.count }))}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <MiniBars
                    label="Site visits per day"
                    data={data.visits.daily.map((v) => ({
                      day: v.day,
                      value: v.views,
                    }))}
                  />
                </CardContent>
              </Card>
            </section>

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Workspaces" value={data.totals.workspaces} />
              <StatCard label="Albums" value={data.totals.albums} />
              <StatCard
                label="Live client links"
                value={data.totals.shareLinks}
              />
              <StatCard
                label="Open jobs"
                value={data.totals.openJobs}
                hint={`${data.totals.applications} applications`}
              />
            </section>

            <section className="grid gap-3 lg:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Needs attention</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 p-4 pt-0 text-sm">
                  <Row
                    label="Open tickets"
                    value={data.totals.openTickets}
                    warn={data.totals.openTickets > 0}
                  />
                  <Row
                    label="Job reports"
                    value={data.totals.reports}
                    warn={data.totals.reports > 0}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Accounts by plan</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 p-4 pt-0 text-sm">
                  {data.byPlan.map((p) => (
                    <Row key={p.plan} label={p.plan} value={p.count} />
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Most visited</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 p-4 pt-0 text-sm">
                  {data.visits.topPaths.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Nothing recorded yet. Visits appear once the beacon is
                      live on the site.
                    </p>
                  ) : (
                    data.visits.topPaths.slice(0, 6).map((p) => (
                      <div
                        key={`${p.host}${p.path}`}
                        className="flex items-baseline justify-between gap-3"
                      >
                        {/* The host is shown, not just the path. Rows are
                            grouped by host *and* path, so virgo.ph/s and
                            client.virgo.ph/s are two different things that
                            rendered as one line repeated. */}
                        <span className="min-w-0 truncate font-mono text-xs">
                          <span className="text-muted-foreground">{p.host}</span>
                          {p.path === '/' ? '' : p.path}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {p.views}
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </section>

            {data.visits.referrers.length > 0 && (
              <section>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Where visitors came from
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {data.visits.referrers.map((r) => (
                    <Badge key={r.host} variant="secondary">
                      {r.host} · {r.views}
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

function Row({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="capitalize text-muted-foreground">{label}</span>
      <span
        className={
          warn ? 'font-bold tabular-nums text-amber-600' : 'font-medium tabular-nums'
        }
      >
        {value}
      </span>
    </div>
  );
}
