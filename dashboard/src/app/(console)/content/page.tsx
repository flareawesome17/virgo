'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  useAlbums,
  useJobReports,
  useMe,
  useRevokeShareLink,
  useSetJobHidden,
  useShareLinks,
  useUserReports,
  useShowcaseReports,
  useSetShowcaseHidden,
} from '@/hooks/useConsole';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { DataTable, type Column } from '@/components/console/data-table';
import {
  DataState,
  PageHeader,
  StatusDot,
  bytes,
  num,
  when,
} from '@/components/console/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Row = Record<string, string | number | null>;

export default function ContentPage() {
  return (
    <>
      <PageHeader
        title="Content"
        description="Albums, the client links that expose them, and reports about people, posts and job posts."
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

/** Who owns a row, linked to their account. */
function Owner({ id, email, name }: { id: unknown; email: unknown; name?: unknown }) {
  return (
    <Link href={`/virgo-users/${String(id)}`} className="block min-w-0 max-w-64">
      {name ? (
        <>
          <span className="block truncate">{String(name)}</span>
          <span className="block truncate text-xs text-muted-foreground">{String(email)}</span>
        </>
      ) : (
        <span className="block truncate text-muted-foreground">{String(email)}</span>
      )}
    </Link>
  );
}

const ALBUM_COLUMNS: Column<Row>[] = [
  {
    id: 'name',
    header: 'Album',
    cell: (row) => <span className="font-medium">{String(row.name)}</span>,
    csv: (row) => row.name,
  },
  {
    id: 'owner',
    header: 'Owner',
    cell: (row) => <Owner id={row.owner_id} email={row.owner_email} name={row.owner_name} />,
    csv: (row) => row.owner_email,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => <span className="capitalize text-muted-foreground">{String(row.status)}</span>,
    csv: (row) => row.status,
  },
  {
    id: 'items',
    header: 'Items',
    className: 'text-right tabular-nums',
    cell: (row) => num(row.item_count),
    csv: (row) => row.item_count,
  },
  {
    id: 'size',
    header: 'Size',
    className: 'text-right tabular-nums',
    cell: (row) => bytes(row.bytes),
    csv: (row) => Number(row.bytes),
  },
  {
    id: 'links',
    header: 'Links',
    className: 'text-right tabular-nums',
    cell: (row) => num(row.share_links),
    csv: (row) => row.share_links,
  },
  {
    id: 'retention',
    header: 'Retention',
    cell: (row) => (
      <span className="text-muted-foreground">
        {row.retention_days ? `${row.retention_days} days` : 'Keep'}
      </span>
    ),
    csv: (row) => row.retention_days,
  },
  {
    id: 'created',
    header: 'Created',
    defaultHidden: true,
    cell: (row) => <span className="text-muted-foreground">{when(row.created_at as string)}</span>,
    csv: (row) => row.created_at,
  },
];

function Albums() {
  const [q, setQ] = useState('');
  const term = useDebouncedValue(q.trim(), 300);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const { data, isLoading, isError, isFetching, refetch } = useAlbums({
    q: term || undefined,
    limit,
    offset,
  });

  return (
    <DataTable
      id="albums"
      columns={ALBUM_COLUMNS}
      rows={data?.data as Row[] | undefined}
      rowKey={(row) => String(row.id)}
      isLoading={isLoading}
      isError={isError}
      isFetching={isFetching}
      onRetry={() => void refetch()}
      empty={term ? `No album matches “${term}”` : 'No albums yet'}
      search={{
        value: q,
        onChange: (v) => {
          setQ(v);
          setOffset(0);
        },
        placeholder: 'Album name or owner email',
      }}
      pagination={{
        offset,
        limit,
        total: data?.total ?? 0,
        onOffsetChange: setOffset,
        onLimitChange: setLimit,
      }}
      exportName="albums"
    />
  );
}

function ShareLinks() {
  const { can } = useMe();
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const { data, isLoading, isError, isFetching, refetch } = useShareLinks({ limit, offset });
  const revoke = useRevokeShareLink();
  const moderate = can('content.moderate');

  const columns: Column<Row>[] = [
    {
      id: 'album',
      header: 'Album',
      cell: (row) => <span className="font-medium">{String(row.album_name)}</span>,
      csv: (row) => row.album_name,
    },
    {
      id: 'owner',
      header: 'Owner',
      cell: (row) =>
        row.owner_id ? (
          <Owner id={row.owner_id} email={row.owner_email} />
        ) : (
          <span className="text-muted-foreground">{String(row.owner_email)}</span>
        ),
      csv: (row) => row.owner_email,
    },
    {
      id: 'purpose',
      header: 'Purpose',
      cell: (row) => <span className="capitalize text-muted-foreground">{String(row.purpose)}</span>,
      csv: (row) => row.purpose,
    },
    {
      id: 'created',
      header: 'Created',
      cell: (row) => <span className="text-muted-foreground">{when(row.created_at as string)}</span>,
      csv: (row) => row.created_at,
    },
    {
      id: 'status',
      header: 'Status',
      cell: (row) =>
        row.revoked_at ? (
          <StatusDot tone="muted">Revoked</StatusDot>
        ) : (
          <StatusDot tone="ok">Live</StatusDot>
        ),
      csv: (row) => (row.revoked_at ? 'revoked' : 'live'),
    },
    ...(moderate
      ? [
          {
            id: 'actions',
            header: '',
            className: 'text-right',
            hideable: false,
            cell: (row: Row) =>
              !row.revoked_at && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(String(row.id))}
                >
                  Revoke
                </Button>
              ),
          } satisfies Column<Row>,
        ]
      : []),
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Tokens are deliberately not shown. The token is the credential to somebody&rsquo;s
        private gallery, and a console list is not a reason to put it on the wire.
      </p>
      <DataTable
        id="share-links"
        columns={columns}
        rows={data?.data as Row[] | undefined}
        rowKey={(row) => String(row.id)}
        isLoading={isLoading}
        isError={isError}
        isFetching={isFetching}
        onRetry={() => void refetch()}
        empty="No client links have been created"
        pagination={{
          offset,
          limit,
          total: data?.total ?? 0,
          onOffsetChange: setOffset,
          onLimitChange: setLimit,
        }}
        exportName="client-links"
      />
    </div>
  );
}

function Reports() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="caption mb-3">People</h2>
        <PeopleReports />
      </section>
      <section>
        <h2 className="caption mb-3">Posts</h2>
        <ShowcaseReports />
      </section>
      <section>
        <h2 className="caption mb-3">Job posts</h2>
        <JobReports />
      </section>
    </div>
  );
}

/** The frame every report sits in. */
function ReportCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border bg-card p-4">{children}</div>;
}

/**
 * Somebody reported a post.
 *
 * Unlike the people list, this one IS actionable: taking a post down is a
 * content decision and this screen is where content decisions are made, where
 * suspending an account is not. Taking down needs content.moderate, which a
 * viewer does not have, so the button is only offered to those who do.
 */
function ShowcaseReports() {
  const { can } = useMe();
  const { data, isLoading, isError, refetch } = useShowcaseReports({ limit: 50 });
  const setHidden = useSetShowcaseHidden();

  return (
    <DataState
      isLoading={isLoading}
      isError={isError}
      isEmpty={!!data && data.data.length === 0}
      emptyLabel="No posts have been reported"
      onRetry={() => void refetch()}
    >
      <div className="space-y-3">
        {data?.data.map((row) => (
          <ReportCard key={row.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {row.title ?? 'Untitled post'}{' '}
                  <span className="font-normal text-muted-foreground">
                    by {row.author_name}
                    {row.author_handle ? ` @${row.author_handle}` : ''}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Reported by {row.reporter_email ?? 'a deleted account'} · {when(row.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {row.hidden_at && <Badge variant="destructive">Taken down</Badge>}
                {row.author_suspended_at && <Badge variant="destructive">Author suspended</Badge>}
                <Badge variant="secondary">
                  {row.showcase_report_count}{' '}
                  {row.showcase_report_count === 1 ? 'report' : 'reports'}
                </Badge>
                {can('content.moderate') && (
                  <Button
                    size="sm"
                    variant={row.hidden_at ? 'secondary' : 'destructive'}
                    disabled={setHidden.isPending}
                    onClick={() => setHidden.mutate({ id: row.showcase_id, hidden: !row.hidden_at })}
                  >
                    {row.hidden_at ? 'Put it back' : 'Take it down'}
                  </Button>
                )}
                <Button asChild size="sm" variant="outline">
                  <Link href={`/virgo-users/${row.author_id}`}>Open account</Link>
                </Button>
              </div>
            </div>
            <p className="mt-2 text-sm font-medium capitalize">{row.reason.replace('_', ' ')}</p>
            {row.note && (
              <p className="mt-2 whitespace-pre-wrap wrap-anywhere rounded bg-muted/50 px-3 py-2 text-sm">
                {row.note}
              </p>
            )}
            {row.caption && (
              <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{row.caption}</p>
            )}
          </ReportCard>
        ))}
      </div>
    </DataState>
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
          <ReportCard key={row.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {row.target_name}{' '}
                  <span className="font-normal text-muted-foreground">
                    {row.target_handle ? `@${row.target_handle}` : 'no handle'}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Reported by {row.reporter_email ?? 'a deleted account'} · {when(row.created_at)}
                  {row.source ? ` · from ${row.source}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {row.target_suspended_at && <Badge variant="destructive">Suspended</Badge>}
                {/* Every report against the account, not just this one: one
                    complaint reads differently from the fifth. */}
                <Badge variant="secondary">
                  {row.target_report_count}{' '}
                  {row.target_report_count === 1 ? 'report' : 'reports'}
                </Badge>
                <Button asChild size="sm" variant="outline">
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
          </ReportCard>
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
            <ReportCard key={String(row.id)}>
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
                <p className="mt-2 rounded bg-muted/50 px-3 py-2 text-sm">{String(row.reason)}</p>
              )}
            </ReportCard>
          );
        })}
      </div>
    </DataState>
  );
}
