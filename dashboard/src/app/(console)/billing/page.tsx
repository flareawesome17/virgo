'use client';

import { useSubscriptions } from '@/hooks/useConsole';
import {
  DataState,
  PageHeader,
  StatCard,
  peso,
  when,
} from '@/components/console/primitives';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function BillingPage() {
  const { data, isLoading, isError, refetch } = useSubscriptions({ limit: 50 });

  return (
    <>
      <PageHeader
        title="Billing"
        description="Subscriptions and what they are worth. Nothing is purchasable during the pre-release, so this stays quiet by design."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Monthly recurring"
          value={data ? peso(data.mrrMinor) : '—'}
          hint="active subscriptions only"
        />
        <StatCard label="Active" value={data?.activeCount ?? '—'} />
        <StatCard label="Records" value={data?.total ?? '—'} />
      </div>

      <DataState
        isLoading={isLoading}
        isError={isError}
        isEmpty={!!data && data.data.length === 0}
        emptyLabel="No subscriptions. Expected while paid plans are switched off."
        onRetry={() => void refetch()}
      >
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Period ends</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.data.map((s) => {
                const row = s as Record<string, string | number | null>;
                return (
                  <TableRow key={String(row.id)}>
                    <TableCell>
                      <span className="block font-medium">
                        {String(row.user_name || row.user_email)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {String(row.user_email)}
                      </span>
                    </TableCell>
                    <TableCell className="capitalize">
                      {String(row.plan_name)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {peso(Number(row.amount_minor ?? 0))}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.kind === 'subscription' ? 'Recurring' : 'One month'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.status === 'active' ? 'secondary' : 'outline'
                        }
                        className="capitalize"
                      >
                        {String(row.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {when(row.current_period_end as string)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </DataState>
    </>
  );
}
