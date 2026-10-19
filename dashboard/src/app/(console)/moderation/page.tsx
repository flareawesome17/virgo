'use client';
/* eslint-disable @next/next/no-img-element -- signed thumbnails, already the size they are drawn at */

import Link from 'next/link';
import { useState } from 'react';
import { EyeOff, MessageSquareWarning, UserX } from 'lucide-react';
import type { CaseKind, ModerationCase, ModerationComment } from '@/api/console';
import { useMe, useModerationCases, useModerationComments } from '@/hooks/useConsole';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { DataTable, FilterChips, type Column } from '@/components/console/data-table';
import { PageHeader, StatusDot, num, when } from '@/components/console/primitives';
import { KIND_LABEL, RESOLUTION_LABEL, reasonLabel } from '@/components/console/moderation';
import { RemoveCommentDialog } from '@/components/console/moderation-ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function ModerationPage() {
  const [tab, setTab] = useState('open');
  return (
    <>
      <PageHeader
        title="Moderation"
        description="Everything people reported — accounts, posts and job posts — one case per thing reported. A decision closes every report on it."
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="open">Queue</TabsTrigger>
          <TabsTrigger value="closed">Decided</TabsTrigger>
          <TabsTrigger value="comments">Comments</TabsTrigger>
        </TabsList>
        <TabsContent value="open" className="mt-4">
          <CasesTab state="open" />
        </TabsContent>
        <TabsContent value="closed" className="mt-4">
          <CasesTab state="closed" />
        </TabsContent>
        <TabsContent value="comments" className="mt-4">
          <CommentsTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

/** What was reported: a person by name, a post or job by its title and maker. */
function Subject({ c }: { c: ModerationCase }) {
  const person = c.subject_name ?? 'A deleted account';
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {c.thumb_url ? (
        <img src={c.thumb_url} alt="" className="size-9 shrink-0 rounded object-cover" />
      ) : (
        <span className="grid size-9 shrink-0 place-items-center rounded bg-muted text-xs font-semibold text-muted-foreground">
          {(c.kind === 'user' ? person : (c.title ?? '?')).slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate font-medium">
          <span className="truncate">{c.kind === 'user' ? person : (c.title ?? 'Untitled')}</span>
          {c.hidden_at && <EyeOff className="size-3.5 shrink-0 text-muted-foreground" aria-label="Hidden" />}
          {c.subject_suspended_at && <UserX className="size-3.5 shrink-0 text-destructive" aria-label="Suspended" />}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {KIND_LABEL[c.kind]}
          {c.kind === 'user' ? (c.subject_email ? ` · ${c.subject_email}` : '') : ` · by ${person}`}
        </p>
      </div>
    </div>
  );
}

function CasesTab({ state }: { state: 'open' | 'closed' }) {
  const [kind, setKind] = useState<'' | CaseKind>('');
  const [q, setQ] = useState('');
  const term = useDebouncedValue(q.trim(), 300);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const { data, isLoading, isError, isFetching, refetch } = useModerationCases({
    state,
    kind: kind || undefined,
    q: term || undefined,
    limit,
    offset,
  });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setOffset(0);
  };
  const counts = data?.counts ?? {};

  const columns: Column<ModerationCase>[] = [
    { id: 'subject', header: 'Reported', cell: (c) => <Subject c={c} />, csv: (c) => (c.kind === 'user' ? c.subject_email : c.title) },
    {
      id: 'reasons',
      header: 'Why',
      cell: (c) => (
        <div className="flex flex-wrap gap-1">
          {(state === 'open' ? (c.open_reasons ?? c.reasons) : c.reasons).map((r) => (
            <Badge key={r} variant="secondary" className="font-normal">
              {reasonLabel(r)}
            </Badge>
          ))}
        </div>
      ),
      csv: (c) => c.reasons.join(' '),
    },
    {
      id: 'reports',
      header: 'Reports',
      className: 'tabular-nums',
      cell: (c) => {
        const people = state === 'open' ? (c.open_reporters ?? c.reporters) : c.reporters;
        return (
          <span>
            <span className="font-semibold">{num(state === 'open' ? c.open : c.total)}</span>
            <span className="text-xs text-muted-foreground">
              {' '}
              from {num(people)} {people === 1 ? 'person' : 'people'}
            </span>
          </span>
        );
      },
      csv: (c) => c.total,
    },
    {
      id: 'signals',
      header: 'Signals',
      cell: (c) => (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {c.strikes > 0 && (
            <StatusDot tone="danger">
              {c.strikes} strike{c.strikes === 1 ? '' : 's'}
            </StatusDot>
          )}
          {c.blocked_by > 0 && <StatusDot tone="warn">blocked by {num(c.blocked_by)}</StatusDot>}
          {c.has_evidence && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <MessageSquareWarning className="size-3.5" />
              chat
            </span>
          )}
          {!c.strikes && !c.blocked_by && !c.has_evidence && <span className="text-muted-foreground">—</span>}
        </div>
      ),
      csv: (c) => `${c.strikes} strikes, blocked by ${c.blocked_by}`,
    },
    state === 'open'
      ? {
          id: 'waiting',
          header: 'Waiting',
          cell: (c) => <span className="text-muted-foreground">{when(c.waiting_since)}</span>,
          csv: (c) => c.waiting_since,
        }
      : {
          id: 'decision',
          header: 'Decision',
          cell: (c) => (
            <span>
              {RESOLUTION_LABEL[c.last_resolution ?? ''] ?? '—'}
              <span className="ml-1.5 text-xs text-muted-foreground">{when(c.resolved_at)}</span>
            </span>
          ),
          csv: (c) => c.last_resolution,
        },
  ];

  return (
    <DataTable
      id={`moderation-${state}`}
      columns={columns}
      rows={data?.data}
      rowKey={(c) => `${c.kind}:${c.target_id}`}
      rowHref={(c) => `/moderation/${c.kind}/${c.target_id}`}
      isLoading={isLoading}
      isError={isError}
      isFetching={isFetching}
      onRetry={() => void refetch()}
      empty={term ? `Nothing matches “${term}”` : state === 'open' ? 'Nothing waiting. Nobody has reported anything new.' : 'No decisions yet'}
      search={{ value: q, onChange: reset(setQ), placeholder: 'Name, email or title' }}
      filters={
        <FilterChips
          value={kind}
          onChange={reset(setKind)}
          options={[
            { value: '', label: 'Everything' },
            { value: 'user', label: 'People', count: state === 'open' ? counts.user : undefined },
            { value: 'showcase', label: 'Posts', count: state === 'open' ? counts.showcase : undefined },
            { value: 'job', label: 'Job posts', count: state === 'open' ? counts.job : undefined },
          ]}
        />
      }
      pagination={{ offset, limit, total: data?.total ?? 0, onOffsetChange: setOffset, onLimitChange: setLimit }}
      exportName={`moderation-${state}`}
    />
  );
}

function CommentsTab() {
  const { can } = useMe();
  const [q, setQ] = useState('');
  const term = useDebouncedValue(q.trim(), 300);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [removing, setRemoving] = useState<ModerationComment | null>(null);
  const { data, isLoading, isError, isFetching, refetch } = useModerationComments({
    q: term || undefined,
    limit,
    offset,
  });

  const columns: Column<ModerationComment>[] = [
    {
      id: 'body',
      header: 'Comment',
      cell: (c) => <p className="line-clamp-2 max-w-md whitespace-pre-wrap wrap-anywhere">{c.body}</p>,
      csv: (c) => c.body,
    },
    {
      id: 'author',
      header: 'By',
      cell: (c) => (
        <span className="flex flex-wrap items-center gap-x-2">
          <Link href={`/virgo-users/${c.author_id}`} className="hover:underline">
            {c.author_name}
          </Link>
          {c.author_strikes > 0 && (
            <StatusDot tone="danger">
              {c.author_strikes} strike{c.author_strikes === 1 ? '' : 's'}
            </StatusDot>
          )}
        </span>
      ),
      csv: (c) => c.author_email,
    },
    {
      id: 'on',
      header: 'On',
      cell: (c) => (
        <span className="text-muted-foreground">
          {c.showcase_title ?? 'Untitled'}
          {c.showcase_hidden_at && ' (hidden)'}
        </span>
      ),
      csv: (c) => c.showcase_title,
    },
    { id: 'when', header: 'When', cell: (c) => <span className="text-muted-foreground">{when(c.created_at)}</span>, csv: (c) => c.created_at },
    ...(can('content.moderate')
      ? [
          {
            id: 'remove',
            header: '',
            className: 'text-right',
            cell: (c: ModerationComment) => (
              <Button size="sm" variant="outline" onClick={() => setRemoving(c)}>
                Remove
              </Button>
            ),
          } satisfies Column<ModerationComment>,
        ]
      : []),
  ];

  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">
        Comments on posts, newest first, for what nobody reported. Removing one deletes it from the app and keeps what it
        said in the author&apos;s record.
      </p>
      <DataTable
        id="moderation-comments"
        columns={columns}
        rows={data?.data}
        rowKey={(c) => c.id}
        isLoading={isLoading}
        isError={isError}
        isFetching={isFetching}
        onRetry={() => void refetch()}
        empty={term ? `No comment matches “${term}”` : 'Nobody has commented yet'}
        search={{
          value: q,
          onChange: (v) => {
            setQ(v);
            setOffset(0);
          },
          placeholder: 'Words, author or post',
        }}
        pagination={{ offset, limit, total: data?.total ?? 0, onOffsetChange: setOffset, onLimitChange: setLimit }}
        exportName="comments"
      />
      <RemoveCommentDialog comment={removing} onClose={() => setRemoving(null)} />
    </>
  );
}
