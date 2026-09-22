'use client';

import Link from 'next/link';
import {
  useAlbums,
  useJobReports,
  useMe,
  useRevokeShareLink,
  useSetJobHidden,
  useShareLinks,
  useUserReports,
} from '@/hooks/useConsole';
import {
  DataState,
  PageHeader,
  bytes,
  when,
} from '@/components/console/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function ContentPage() {
  return (
    <>
      <PageHeader
        title="Content"
        description="Albums, the client links that expose them, and reports about people and job posts."
      />
      <Tabs defaultValue="albums">
        <TabsList>
          <TabsTrigger value="albums">Albums</TabsTrigger>
          <TabsTrigger value="links">Client links</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="albums" className="mt-4">
          <Albums />
        </TabsContent>
        <TabsContent value="links" className="mt-4">
          <ShareLinks />
        </TabsContent>
        <TabsContent value="reports" className="mt-4">
          <Reports />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Albums() {
  const { data, isLoading, isError, refetch } = useAlbums({ limit: 50 });
  return (
    <DataState
      isLoading={isLoading}
      isError={isError}
      isEmpty={!!data && data.data.length === 0}
      emptyLabel="No albums yet"
      onRetry={() => void refetch()}
    >
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Album</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Links</TableHead>
              <TableHead>Retention</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.data.map((a) => {
              const row = a as Record<string, string | number>;
              return (
                <TableRow key={String(row.id)}>
                  <TableCell className="font-medium">{String(row.name)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {String(row.owner_email)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {String(row.item_count)}
                  </TableCell>
                  <TableCell className="tabular-nums">{bytes(row.bytes)}</TableCell>
                  <TableCell className="tabular-nums">
                    {String(row.share_links)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.retention_days ? `${row.retention_days}d` : 'keep'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </DataState>
  );
}

function ShareLinks() {
  const { can } = useMe();
  const { data, isLoading, isError, refetch } = useShareLinks({ limit: 50 });
  const revoke = useRevokeShareLink();

  return (
    <DataState
      isLoading={isLoading}
      isError={isError}
      isEmpty={!!data && data.data.length === 0}
      emptyLabel="No client links have been created"
      onRetry={() => void refetch()}
    >
      <p className="mb-3 text-xs text-muted-foreground">
        Tokens are deliberately not shown. The token is the credential to
        somebody&rsquo;s private gallery, and a console list is not a reason to
        put it on the wire.
      </p>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Album</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Status</TableHead>
              {can('content.moderate') && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.data.map((l) => {
              const row = l as Record<string, string | null>;
              const revoked = !!row.revoked_at;
              return (
                <TableRow key={String(row.id)}>
                  <TableCell className="font-medium">
                    {String(row.album_name)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {String(row.owner_email)}
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {String(row.purpose)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {when(row.created_at)}
                  </TableCell>
                  <TableCell>
                    {revoked ? (
                      <Badge variant="outline">Revoked</Badge>
                    ) : (
                      <Badge variant="secondary">Live</Badge>
                    )}
                  </TableCell>
                  {can('content.moderate') && (
                    <TableCell className="text-right">
                      {!revoked && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={revoke.isPending}
                          onClick={() => revoke.mutate(String(row.id))}
                        >
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </DataState>
  );
}

function Reports() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold">People</h2>
        <PeopleReports />
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold">Job posts</h2>
        <JobReports />
      </section>
    </div>
  );
}

/**
 * Accounts somebody in the app reported, newest first.
 *
 * Nothing is actioned from here. Suspending lives on the account page behind
 * users.disable, and this list is content.read, so a viewer can read the
 * reports without being handed the switch.
 */
function PeopleReports() {
  const { data, isLoading, isError, refetch } = useUserReports({ limit: 50 });

  return (
    <DataState
      isLoading={isLoading}
      isError={isError}
      isEmpty={!!data && data.data.length === 0}
      emptyLabel="Nobody has been reported"
      onRetry={() => void refetch()}
    >
      <div className="space-y-3">
        {data?.data.map((row) => (
          <div key={row.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {row.target_name}{' '}
                  <span className="font-normal text-muted-foreground">
                    {row.target_handle ? `@${row.target_handle}` : 'no handle'}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Reported by {row.reporter_email ?? 'a deleted account'} ·{' '}
                  {when(row.created_at)}
                  {row.source ? ` · from ${row.source}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {row.target_suspended_at && (
                  <Badge variant="destructive">Suspended</Badge>
                )}
                {/* Every report against the account, not just this one: one
                    complaint reads differently from the fifth. */}
                <Badge variant="secondary">
                  {row.target_report_count}{' '}
                  {row.target_report_count === 1 ? 'report' : 'reports'}
                </Badge>
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/virgo-users/${row.target_id}`}>Open account</Link>
                </Button>
              </div>
            </div>
            <p className="mt-2 text-sm font-medium capitalize">{row.reason}</p>
            {row.note && (
              // Their own words, so line breaks are kept. `anywhere` rather
              // than `break-word`: only it lowers the min-content width, and a
              // pasted link otherwise stretches the whole console sideways.
              <p className="mt-2 whitespace-pre-wrap wrap-anywhere rounded bg-muted/50 px-3 py-2 text-sm">
                {row.note}
              </p>
            )}
          </div>
        ))}
      </div>
    </DataState>
  );
}

function JobReports() {
  const { can } = useMe();
  const { data, isLoading, isError, refetch } = useJobReports({ limit: 50 });
  const setHidden = useSetJobHidden();

  return (
    <DataState
      isLoading={isLoading}
      isError={isError}
      isEmpty={!!data && data.data.length === 0}
      emptyLabel="Nothing has been reported"
      onRetry={() => void refetch()}
    >
      <div className="space-y-3">
        {data?.data.map((r) => {
          const row = r as Record<string, string | null>;
          const hidden = !!row.hidden_at;
          return (
            <div key={String(row.id)} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{String(row.title)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Reported by {row.reporter_email ?? 'a deleted account'} ·{' '}
                    {when(row.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {hidden && <Badge variant="destructive">Hidden</Badge>}
                  {can('content.moderate') && (
                    <Button
                      size="sm"
                      variant={hidden ? 'secondary' : 'destructive'}
                      disabled={setHidden.isPending}
                      onClick={() =>
                        setHidden.mutate({
                          id: String(row.post_id),
                          hidden: !hidden,
                        })
                      }
                    >
                      {hidden ? 'Restore' : 'Hide post'}
                    </Button>
                  )}
                </div>
              </div>
              {row.reason && (
                <p className="mt-2 rounded bg-muted/50 px-3 py-2 text-sm">
                  {String(row.reason)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </DataState>
  );
}
