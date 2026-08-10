'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTickets } from '@/hooks/useConsole';
import { DataState, PageHeader, when } from '@/components/console/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

/** Urgency reads faster as colour than as a word in a column. */
const PRIORITY_VARIANT: Record<string, 'destructive' | 'default' | 'secondary' | 'outline'> = {
  urgent: 'destructive',
  high: 'default',
  normal: 'secondary',
  low: 'outline',
};

export default function SupportPage() {
  const [status, setStatus] = useState('');
  const { data, isLoading, isError, refetch } = useTickets({
    status: status || undefined,
    limit: 50,
  });

  const counts = new Map(
    (data?.counts ?? []).map((c) => [c.status, c.count] as const),
  );

  return (
    <>
      <PageHeader
        title="Support"
        description="Tickets raised from inside the app. Replies reach the customer; internal notes never leave the console."
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={status === f.value ? 'default' : 'outline'}
            onClick={() => setStatus(f.value)}
          >
            {f.label}
            {f.value && counts.get(f.value) ? (
              <span className="ml-1.5 tabular-nums opacity-70">
                {counts.get(f.value)}
              </span>
            ) : null}
          </Button>
        ))}
      </div>

      <DataState
        isLoading={isLoading}
        isError={isError}
        isEmpty={!!data && data.data.length === 0}
        emptyLabel={
          status ? `No ${status} tickets` : 'Nobody has written in yet'
        }
        onRetry={() => void refetch()}
      >
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>From</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.data.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link
                      href={`/support/${t.id}`}
                      className="font-medium hover:underline"
                    >
                      {t.subject}
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t.messages} message{t.messages === 1 ? '' : 's'}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.user_email}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={PRIORITY_VARIANT[t.priority] ?? 'secondary'}
                      className="capitalize"
                    >
                      {t.priority}
                    </Badge>
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {t.status}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.assigned_name ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {when(t.updated_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DataState>
    </>
  );
}
