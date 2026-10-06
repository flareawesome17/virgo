'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAlbums, useMe, useRevokeShareLink, useShareLinks } from '@/hooks/useConsole';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { DataTable, type Column } from '@/components/console/data-table';
import {
  PageHeader,
  StatusDot,
  bytes,
  num,
  when,
} from '@/components/console/primitives';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Row = Record<string, string | number | null>;

export default function ContentPage() {
  return (
    <>
      <PageHeader
        title="Content"
        description="Albums and the client links that expose them. Reports live in Moderation."
      />
      <Tabs defaultValue="albums">
        <TabsList>
          <TabsTrigger value="albums">Albums</TabsTrigger>
          <TabsTrigger value="links">Client links</TabsTrigger>
        </TabsList>
        <TabsContent value="albums" className="mt-4">
          <Albums />
        </TabsContent>
        <TabsContent value="links" className="mt-4">
          <ShareLinks />
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
