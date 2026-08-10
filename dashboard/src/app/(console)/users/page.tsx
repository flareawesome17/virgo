'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { useUsers } from '@/hooks/useConsole';
import {
  DataState,
  PageHeader,
  bytes,
  when,
} from '@/components/console/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const PAGE = 25;

export default function UsersPage() {
  const [q, setQ] = useState('');
  // The value actually sent. Kept separate from `q` so the list does not
  // refetch on every keystroke — a search box wired straight to a query key
  // fires a request per character.
  const [term, setTerm] = useState('');
  const [offset, setOffset] = useState(0);

  const { data, isLoading, isError, refetch } = useUsers({
    q: term || undefined,
    limit: PAGE,
    offset,
  });

  function search(e: React.FormEvent) {
    e.preventDefault();
    setTerm(q.trim());
    setOffset(0);
  }

  return (
    <>
      <PageHeader
        title="Users"
        description={
          data ? `${data.total} accounts` : 'Everyone with a Virgo account.'
        }
      />

      <form onSubmit={search} className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Email, name or handle"
            className="pl-8"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <DataState
        isLoading={isLoading}
        isError={isError}
        isEmpty={!!data && data.data.length === 0}
        emptyLabel={term ? `No account matches “${term}”` : 'No accounts yet'}
        onRetry={() => void refetch()}
      >
        {data && (
          <>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Storage</TableHead>
                    <TableHead>Albums</TableHead>
                    <TableHead>Last seen</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <Link
                          href={`/users/${u.id}`}
                          className="block min-w-0 hover:underline"
                        >
                          <span className="block truncate font-medium">
                            {u.display_name?.trim() || u.email.split('@')[0]}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {u.email}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {u.plan}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {bytes(u.storage_bytes)}
                      </TableCell>
                      <TableCell className="tabular-nums">{u.albums}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {when(u.last_seen_at)}
                      </TableCell>
                      <TableCell>
                        {u.disabled_at ? (
                          <Badge variant="destructive">Disabled</Badge>
                        ) : !u.email_verified_at ? (
                          <Badge variant="outline">Unverified</Badge>
                        ) : (
                          <Badge variant="secondary">Active</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {data.total > PAGE && (
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {offset + 1}–{Math.min(offset + PAGE, data.total)} of {data.total}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - PAGE))}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={offset + PAGE >= data.total}
                    onClick={() => setOffset(offset + PAGE)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DataState>
    </>
  );
}
