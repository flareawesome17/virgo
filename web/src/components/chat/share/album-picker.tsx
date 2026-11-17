'use client';

/* eslint-disable @next/next/no-img-element -- signed thumbnails, already the size they are drawn at, as in the album grid */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Images, Loader2, Play, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useInfiniteAlbums } from '@/hooks/useAlbums';
import { useAlbumSections } from '@/hooks/useAlbumSections';
import { kindOf, useAlbumFiles } from '@/hooks/useAlbumFiles';
import { MAX_CARD_FILES, describeAlbumCount, type Album, type StoredFile } from '@/api';
import {
  PickerEmpty,
  PickerFailed,
  PickerLoading,
  PickRow,
  audienceName,
  capitalise,
  type Audience,
  type CardSender,
} from '@/components/chat/share/shared';

type Chosen = { key: string; kind: 'image' | 'video' };

/** Photos and films: what a client link shows. Recordings and other files stay out. */
function shareable(file: StoredFile): 'image' | 'video' | null {
  const kind = kindOf(file.contentType);
  return kind === 'image' || kind === 'video' ? kind : null;
}

/** "Send 12 photos", "Send 2 films", "Send 14 files" for a mix, as the server words the card. */
function sendLabel(chosen: Chosen[]): string {
  const n = chosen.length;
  if (n === 0) return 'Send';
  const films = chosen.filter((c) => c.kind === 'video').length;
  const noun = films === 0 ? 'photo' : films === n ? 'film' : 'file';
  return `Send ${n} ${noun}${n === 1 ? '' : 's'}`;
}

/**
 * Album photos (boards ChatPickAlbum, ChatWeb): an album you own or manage,
 * then what in it the chat sees. The server makes a client link for just
 * those, so nothing is copied and no storage is used.
 */
export function AlbumPickerDialog({
  open,
  onOpenChange,
  audience,
  sender,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audience: Audience;
  sender: CardSender;
  onSent: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(46rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <AlbumPickerBody
          audience={audience}
          sender={sender}
          done={() => {
            onOpenChange(false);
            onSent();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function AlbumPickerBody({
  audience,
  sender,
  done,
}: {
  audience: Audience;
  sender: CardSender;
  done: () => void;
}) {
  const [album, setAlbum] = useState<Album | null>(null);
  return album ? (
    <FilesStep key={album.id} album={album} audience={audience} sender={sender} done={done} onBack={() => setAlbum(null)} />
  ) : (
    <AlbumStep audience={audience} onPick={setAlbum} />
  );
}

/** Yours, or one you were given Manage on. An API older than the field sent only your own. */
function canShareFrom(album: Album): boolean {
  return album.my_access === undefined || album.my_access === 'owner' || album.my_access === 'manage';
}

function AlbumStep({ audience, onPick }: { audience: Audience; onPick: (album: Album) => void }) {
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const pause = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { albums, isLoading, loadFailed, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteAlbums({ orderBy: 'updated_at', direction: 'desc', search: search || undefined });
  const yours = albums.filter(canShareFrom);

  return (
    <>
      <DialogHeader className="border-b px-4 pb-3 pt-4">
        <DialogTitle>Album photos</DialogTitle>
        <DialogDescription>
          Choose an album you own or manage. {capitalise(audienceName(audience))} gets a link to
          just the photos you pick, so it uses none of your storage.
        </DialogDescription>
        <div className="relative mt-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={typed}
            onChange={(e) => {
              const next = e.target.value;
              setTyped(next);
              // Asked once typing pauses, not on every key.
              clearTimeout(pause.current);
              pause.current = setTimeout(() => setSearch(next.trim()), 250);
            }}
            placeholder="Search albums"
            aria-label="Search albums"
            className="pl-9"
          />
        </div>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {isLoading && albums.length === 0 ? (
          <PickerLoading />
        ) : loadFailed && albums.length === 0 ? (
          <PickerFailed what="your albums" onRetry={() => void refetch()} />
        ) : yours.length === 0 && !hasNextPage ? (
          search ? (
            <PickerEmpty>No albums match “{search}”.</PickerEmpty>
          ) : (
            <PickerEmpty href="/albums" action="Open albums">
              No albums to share from yet. Albums you own or manage show here.
            </PickerEmpty>
          )
        ) : (
          <ul className="flex flex-col gap-0.5">
            {yours.map((a) => (
              <PickRow
                key={a.id}
                leading={
                  <span className="block size-11 overflow-hidden rounded-lg bg-muted">
                    {a.cover_url ? (
                      <img src={a.cover_url} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
                    ) : (
                      <span className="grid size-full place-items-center text-muted-foreground">
                        <Images className="size-4" aria-hidden />
                      </span>
                    )}
                  </span>
                }
                title={a.name}
                lines={[a.counts ? describeAlbumCount(a.counts) : null]}
                onPick={() => onPick(a)}
              />
            ))}
            {hasNextPage && (
              <li className="flex justify-center py-2">
                <Button variant="ghost" size="sm" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
                  {isFetchingNextPage && <Loader2 className="size-3.5 animate-spin" />}
                  Show more albums
                </Button>
              </li>
            )}
          </ul>
        )}
      </div>
    </>
  );
}

function FilesStep({
  album,
  audience,
  sender,
  done,
  onBack,
}: {
  album: Album;
  audience: Audience;
  sender: CardSender;
  done: () => void;
  onBack: () => void;
}) {
  /** Null is All. */
  const [section, setSection] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Chosen[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const { sections } = useAlbumSections(album.id);
  const {
    files,
    isLoading,
    loadFailed,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useAlbumFiles(album.id, { section: section ?? undefined });

  const shown = useMemo(() => files.filter((f) => shareable(f) !== null), [files]);
  const order = useMemo(() => new Map(chosen.map((c, i) => [c.key, i + 1])), [chosen]);
  const full = chosen.length >= MAX_CARD_FILES;
  const everyShownChosen = shown.length > 0 && !hasNextPage && shown.every((f) => order.has(f.key));
  const who = audienceName(audience);
  const sig = `album:${album.id}:${chosen.map((c) => c.key).join('|')}`;
  const sending = sender.sending === sig;

  // The next page as the end of the grid comes into view.
  const end = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = end.current;
    if (!target || !hasNextPage) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (!isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
      },
      { root: grid.current, rootMargin: '0px 0px 400px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  const toggle = (file: StoredFile) => {
    const kind = shareable(file);
    if (!kind) return;
    setChosen((current) => {
      if (current.some((c) => c.key === file.key)) return current.filter((c) => c.key !== file.key);
      if (current.length >= MAX_CARD_FILES) return current;
      return [...current, { key: file.key, kind }];
    });
  };

  /**
   * Everything in the section on screen, every page of it, up to what one
   * card carries. A second press, once all of it is chosen, takes it out.
   */
  const selectAll = async () => {
    if (everyShownChosen) {
      const out = new Set(shown.map((f) => f.key));
      setChosen((current) => current.filter((c) => !out.has(c.key)));
      return;
    }
    setLoadingAll(true);
    let list = files;
    let more = hasNextPage;
    let failed = false;
    try {
      while (more && list.length < MAX_CARD_FILES) {
        const result = await fetchNextPage();
        if (result.isError) {
          failed = true;
          break;
        }
        list = result.data?.pages.flatMap((page) => page.data) ?? list;
        more = result.hasNextPage;
      }
    } finally {
      setLoadingAll(false);
    }
    const already = new Set(chosen.map((c) => c.key));
    const adding = list.filter((f) => shareable(f) && !already.has(f.key)).length;
    if (failed) {
      toast.error("Couldn't load all of it", { description: 'Chose what had loaded. Try Select all again for the rest.' });
    } else if (chosen.length + adding > MAX_CARD_FILES || more) {
      toast(`Chose as many as fit. One card carries up to ${MAX_CARD_FILES}.`);
    }
    setChosen((current) => {
      const have = new Set(current.map((c) => c.key));
      const next = [...current];
      for (const file of list) {
        if (next.length >= MAX_CARD_FILES) break;
        const kind = shareable(file);
        if (!kind || have.has(file.key)) continue;
        next.push({ key: file.key, kind });
      }
      return next;
    });
  };

  const send = () => {
    if (chosen.length === 0) return;
    sender.sendCard(
      sig,
      { kind: 'album-photos', albumId: album.id, keys: chosen.map((c) => c.key) },
      done,
    );
  };

  const tabs = [{ id: null as string | null, name: 'All' }, ...sections.filter((s) => s.count > 0)];

  return (
    <>
      <div className="flex items-center gap-2 border-b px-3 pb-3 pt-3.5 pr-12">
        <Button type="button" size="icon-sm" variant="ghost" onClick={onBack} aria-label="Back to albums">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate font-bold">{album.name}</DialogTitle>
          <DialogDescription className="truncate text-xs">Choose what {who} sees</DialogDescription>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="font-semibold text-primary"
          disabled={shown.length === 0 || loadingAll}
          onClick={() => void selectAll()}
        >
          {loadingAll && <Loader2 className="size-3.5 animate-spin" />}
          {everyShownChosen ? 'Clear' : 'Select all'}
        </Button>
      </div>

      {tabs.length > 1 && (
        <nav aria-label="Album sections" className="flex gap-1 overflow-x-auto border-b px-3 py-2">
          {tabs.map((tab) => (
            <button
              key={tab.id ?? 'all'}
              type="button"
              aria-pressed={section === tab.id}
              disabled={loadingAll}
              onClick={() => setSection(tab.id)}
              className={cn(
                'h-8 shrink-0 rounded-full px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                section === tab.id
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      )}

      <div ref={grid} className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading && shown.length === 0 ? (
          <PickerLoading />
        ) : loadFailed && shown.length === 0 ? (
          <PickerFailed what="this album" onRetry={() => void refetch()} />
        ) : shown.length === 0 && !hasNextPage ? (
          <PickerEmpty>
            {section ? 'No photos or films in this section.' : 'No photos or films in this album yet.'}
          </PickerEmpty>
        ) : (
          <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4" aria-label="Photos and films">
            {shown.map((file, i) => {
              const kind = shareable(file);
              const at = order.get(file.key);
              const on = at !== undefined;
              const blocked = !on && full;
              const still = kind === 'video' ? file.posterUrl : (file.thumbnailUrl ?? file.displaySources[0]?.url ?? null);
              return (
                <li key={file.key} className="aspect-square">
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-disabled={blocked || undefined}
                    aria-label={`${kind === 'video' ? 'Film' : 'Photo'} ${i + 1}${on ? ', chosen' : ''}`}
                    onClick={() => !blocked && toggle(file)}
                    className={cn(
                      'relative block size-full overflow-hidden rounded-md bg-muted bg-cover bg-center outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring',
                      blocked && 'cursor-not-allowed opacity-50',
                    )}
                    style={file.blurDataUrl ? { backgroundImage: `url("${file.blurDataUrl}")` } : undefined}
                  >
                    {still && (
                      <img
                        src={still}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        className={cn('size-full object-cover transition-transform duration-150', on && 'scale-[0.92] rounded-md')}
                      />
                    )}
                    {kind === 'video' && (
                      <span className="absolute bottom-1 left-1 grid size-5 place-items-center rounded bg-black/65 text-white">
                        <Play className="size-3 fill-current" aria-hidden />
                      </span>
                    )}
                    <span
                      aria-hidden
                      className={cn(
                        'absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full text-xs font-bold tabular-nums ring-2 ring-white',
                        on ? 'bg-primary text-primary-foreground' : 'bg-black/15',
                      )}
                    >
                      {on && (at <= 99 ? at : <Check className="size-3.5" />)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {hasNextPage && (
          <div ref={end} className="flex justify-center py-3">
            {isFetchNextPageError ? (
              <button
                type="button"
                onClick={() => void fetchNextPage()}
                className="text-xs font-semibold text-primary underline underline-offset-2"
              >
                Couldn&apos;t load more. Try again
              </button>
            ) : (
              <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading more" />
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t bg-muted/50 px-4 py-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="text-sm font-semibold tabular-nums">{chosen.length} chosen</p>
          <p className="text-xs text-muted-foreground">
            {full
              ? `That's the most one card can carry: ${MAX_CARD_FILES}.`
              : `${capitalise(who)} gets a link to just these. Nothing is copied, so your storage doesn't change.`}
          </p>
        </div>
        <Button
          type="button"
          size="lg"
          className="sm:min-w-40"
          disabled={chosen.length === 0 || sender.pending}
          onClick={send}
        >
          {sending && <Loader2 className="size-4 animate-spin" />}
          {sendLabel(chosen)}
        </Button>
      </div>
    </>
  );
}
