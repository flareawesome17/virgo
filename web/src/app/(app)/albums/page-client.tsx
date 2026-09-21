'use client';
/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageIcon, Layers, Loader2, Music, Plus, Search, Video, X } from 'lucide-react';
import { AppShell, PageHeader } from '@/components/app-shell';
import { NewAlbumDialog } from '@/components/new-album-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useInfiniteAlbums } from '@/hooks/useAlbums';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import type { Album, AlbumStatus } from '@/api';
import { cn } from '@/lib/utils';

const STATUSES: { key: AlbumStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'review', label: 'In review' },
  { key: 'delivered', label: 'Delivered' },
];

const STATUS_PILL: Record<AlbumStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'text-muted-foreground' },
  review: { label: 'In review', className: 'text-warning' },
  delivered: { label: 'Delivered', className: 'text-success' },
};

function ago(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Every album, grouped by the workspace it belongs to.
 *
 * The web app had no list of albums at all: an album was reachable only by
 * first opening its workspace, and the "files cleaned up" notification linked
 * here to a page that did not exist. The phone app has had one all along.
 */
export default function AlbumsPage() {
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<AlbumStatus | 'all'>('all');
  const [creating, setCreating] = useState(false);

  // One request per settled word, not per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), 250);
    return () => clearTimeout(timer);
  }, [typed]);

  const albumsQuery = useInfiniteAlbums({
    status: status === 'all' ? undefined : status,
    search: search || undefined,
    orderBy: 'updated_at',
    direction: 'desc',
  });
  const { workspaces } = useWorkspaces({ limit: 100 });
  const names = useMemo(() => new Map(workspaces.map((w) => [w.id, w.name])), [workspaces]);

  const groups = useMemo(() => {
    const buckets = new Map<string, Album[]>();
    for (const album of albumsQuery.albums) {
      buckets.set(album.workspace_id, [...(buckets.get(album.workspace_id) ?? []), album]);
    }
    return [...buckets].map(([id, albums]) => ({ id, name: names.get(id) ?? 'Shared with you', albums }));
  }, [albumsQuery.albums, names]);

  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = albumsQuery;
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <AppShell title="Albums">
      <PageHeader
        title="Albums"
        description={
          albumsQuery.isLoading
            ? 'Everything you have shot, by workspace'
            : `${albumsQuery.total.toLocaleString()} album${albumsQuery.total === 1 ? '' : 's'}${groups.length > 1 ? ` in ${groups.length} workspaces` : ''}`
        }
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            New album
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[16rem] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder="Album, client or workspace"
              aria-label="Search albums"
              className="pl-9"
            />
            {typed && (
              <button
                type="button"
                onClick={() => setTyped('')}
                aria-label="Clear search"
                className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <div role="tablist" aria-label="Status" className="inline-flex rounded-lg bg-muted p-0.5">
            {STATUSES.map((option) => (
              <button
                key={option.key}
                type="button"
                role="tab"
                aria-selected={status === option.key}
                onClick={() => setStatus(option.key)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors',
                  status === option.key ? 'bg-card font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 space-y-10">
          {albumsQuery.isLoading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : albumsQuery.loadFailed && albumsQuery.albums.length === 0 ? (
            <div className="rounded-xl border border-dashed py-16 text-center">
              <p className="text-sm font-medium">Could not load your albums</p>
              <p className="mt-1 text-xs text-muted-foreground">This is a connection problem, not an empty list.</p>
              <Button size="sm" variant="outline" className="mt-4" onClick={() => void albumsQuery.refetch()}>
                Try again
              </Button>
            </div>
          ) : groups.length === 0 ? (
            search || status !== 'all' ? (
              <p className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
                {search ? `No album is called or described as “${search}”.` : 'No albums with that status.'}
              </p>
            ) : (
              <div className="rounded-xl border border-dashed px-6 py-16 text-center">
                <Layers className="mx-auto size-7 text-muted-foreground" aria-hidden />
                <p className="mt-3 text-base font-semibold">No albums yet</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  An album holds one shoot or one delivery — upload to it, sort it into sections, and send the client a link.
                </p>
                <Button className="mt-5" onClick={() => setCreating(true)}>
                  <Plus className="size-4" />
                  New album
                </Button>
              </div>
            )
          ) : (
            groups.map((group) => (
              <section key={group.id} aria-labelledby={`ws-${group.id}`}>
                <div className="mb-3 flex items-baseline gap-2">
                  <h2 id={`ws-${group.id}`} className="text-sm font-semibold uppercase tracking-[0.12em]">
                    {names.has(group.id) ? (
                      <Link href={`/workspaces/${group.id}`} className="hover:text-primary">
                        {group.name}
                      </Link>
                    ) : (
                      group.name
                    )}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {group.albums.length} album{group.albums.length === 1 ? '' : 's'}
                  </span>
                </div>
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
                  {group.albums.map((album) => (
                    <li key={album.id}>
                      <AlbumCard album={album} />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
          <div ref={sentinel} aria-hidden />
          {isFetchingNextPage && (
            <div className="flex justify-center py-6">
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading more albums" />
            </div>
          )}
        </div>
      </div>

      <NewAlbumDialog open={creating} onOpenChange={setCreating} />
    </AppShell>
  );
}

function AlbumCard({ album }: { album: Album }) {
  const pill = STATUS_PILL[album.status] ?? STATUS_PILL.draft;
  const counts = album.counts ?? { image: album.item_count, video: 0, audio: 0 };
  const parts = [
    { n: counts.image, Icon: ImageIcon, label: 'photos' },
    { n: counts.video, Icon: Video, label: 'films' },
    { n: counts.audio, Icon: Music, label: 'recordings' },
  ].filter((part) => part.n > 0);

  return (
    <Link
      href={`/albums/${album.id}`}
      className="group block overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <div className="relative aspect-[4/3] bg-muted">
        {album.cover_url ? (
          <img src={album.cover_url} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
        ) : (
          <span className="grid size-full place-items-center">
            <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
          </span>
        )}
        <span className={cn('absolute top-2 left-2 rounded-md bg-card/95 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', pill.className)}>
          {pill.label}
        </span>
      </div>
      <div className="space-y-1.5 p-3">
        <p className="truncate text-sm font-semibold">{album.name}</p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {parts.length > 0 ? (
            parts.map(({ n, Icon, label }) => (
              <span key={label} className="inline-flex items-center gap-1 tabular-nums" aria-label={`${n} ${label}`}>
                <Icon className="size-3.5" aria-hidden />
                {n.toLocaleString()}
              </span>
            ))
          ) : (
            <span>Empty</span>
          )}
          <span className="ml-auto">{ago(album.updated_at)}</span>
        </div>
      </div>
    </Link>
  );
}
