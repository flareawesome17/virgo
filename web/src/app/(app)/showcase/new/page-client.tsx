'use client';
/* eslint-disable @next/next/no-img-element -- thumbnails and posters, already the size they are drawn at, as in the album grid */

import Link from 'next/link';
import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CloudOff,
  Globe,
  ImagePlus,
  Loader2,
  Lock,
  Play,
  Plus,
  Star,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Screen } from '@/components/app-shell';
import { CenteredSpinner, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { faultyPiece, showcaseActionMessage } from '@/components/showcase/action-message';
import { useAlbums } from '@/hooks/useAlbums';
import { useShowcase, useShowcaseActions } from '@/hooks/useShowcases';
import { leaveIfDiscarded, useDiscardGuard } from '@/lib/discard-guard';
import { cn } from '@/lib/utils';
import {
  MAX_CRAFT_TAGS,
  MAX_SHOWCASE_ITEMS,
  canPostTogether,
  kindOf,
  showcaseStatus,
  storageApi,
  type Showcase,
  type StoredFile,
} from '@/api';

/** A profile photo is never a piece of work; the server refuses them too. */
const PROFILE_PICTURE_KEY = /^users\/[^/]+\/(avatars|covers)\//;

/**
 * Offered, so most craft facts are a click. Anything else can be typed. The
 * phone's list, so a tag means the same on both.
 */
const TAG_SUGGESTIONS = [
  '24mm', '35mm', '50mm', '85mm', '135mm',
  'f/1.4', 'f/2', 'f/2.8', 'f/8',
  'Natural light', 'Backlight', 'Golden hour', 'Blue hour', 'Flash', 'One light',
];
const FILM_TAG_SUGGESTIONS = ['Gimbal', 'Handheld', 'Drone', 'Slow motion', '24fps', 'Log', 'Same-day edit'];
/** The server's own limit on one tag. */
const MAX_TAG_LENGTH = 32;
/** The API's limits on the three texts. */
const TITLE_MAX = 120;
const CAPTION_MAX = 2200;
const NOTE_MAX = 600;

/** "1:05" for a film's length. */
function clock(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** A tile's still: the thumbnail or poster, never the original. */
function stillOf(file: StoredFile): string | null {
  return kindOf(file.contentType) === 'video' ? file.posterUrl : (file.thumbnailUrl ?? file.url);
}

/**
 * Posting a showcase, or with `?edit=<id>` changing one.
 *
 * The phone's form (mobile/app/(app)/showcase/new.tsx), laid out for a wide
 * screen: the work on the left, what you say about it on the right.
 */
function NewShowcase() {
  const params = useSearchParams();
  const edit = params.get('edit') ?? undefined;
  const { showcase, isLoading, loadFailed, refetch } = useShowcase(edit);

  if (!edit) return <ShowcaseForm />;
  if (!showcase) {
    return (
      <Screen title="Edit showcase">
        {isLoading ? (
          <CenteredSpinner />
        ) : (
          <EmptyState
            icon={CloudOff}
            title={loadFailed ? 'Could not load this showcase' : 'This showcase has gone'}
            description={loadFailed ? 'Check your connection and try again.' : 'It has been deleted.'}
            action={loadFailed ? <Button onClick={() => void refetch()}>Try again</Button> : undefined}
          />
        )}
      </Screen>
    );
  }
  // Keyed, so the form starts from the showcase without an effect copying it in.
  return <ShowcaseForm key={showcase.id} existing={showcase} />;
}

export default function NewShowcasePage() {
  return (
    <Suspense fallback={null}>
      <NewShowcase />
    </Suspense>
  );
}

function ShowcaseForm({ existing }: { existing?: Showcase }) {
  const router = useRouter();
  const { create, update, setPublished } = useShowcaseActions();
  const editing = Boolean(existing);
  const busy = create.isPending || update.isPending || setPublished.isPending;

  const [picked, setPicked] = useState<string[]>(
    () => existing?.pieces.map((piece) => piece.fileKey) ?? [],
  );
  const [title, setTitle] = useState(existing?.title ?? '');
  const [caption, setCaption] = useState(existing?.caption ?? '');
  const [craftNote, setCraftNote] = useState(existing?.craftNote ?? '');
  const [tags, setTags] = useState<string[]>(existing?.craftTags ?? []);
  const [tagDraft, setTagDraft] = useState('');
  const [allowComments, setAllowComments] = useState(existing?.allowComments ?? true);
  const [showHire, setShowHire] = useState(existing?.showHire ?? true);
  /** The piece the server turned down, and why, until it is dealt with. */
  const [faulty, setFaulty] = useState<{ key: string; message: string } | null>(null);
  // A still for everything chosen, whichever album it was picked from: the
  // grid only holds the album on screen.
  const [stills, setStills] = useState<Record<string, string>>(() =>
    Object.fromEntries(existing?.pieces.map((piece) => [piece.fileKey, piece.url]) ?? []),
  );
  // What each chosen piece is, whichever album it came from: a film goes out
  // on its own, so the form has to know which of the chosen are films.
  const [kinds, setKinds] = useState<Record<string, 'image' | 'video'>>(() =>
    Object.fromEntries(existing?.pieces.map((piece) => [piece.fileKey, piece.kind]) ?? []),
  );
  const [albumId, setAlbumId] = useState<string | undefined>(undefined);

  /*
   * Who sees it. Private is a post saved and not put out, or taken back in;
   * a post shown only to connections keeps that unless its author picks
   * something else here — the form never changes it on their behalf.
   */
  const status = existing ? showcaseStatus(existing) : null;
  const [audience, setAudience] = useState<Audience>(() =>
    !existing
      ? 'public'
      : status !== 'live'
        ? 'private'
        : existing.visibility === 'connections'
          ? 'connections'
          : 'public',
  );

  // A chosen set of work and a written caption are worth asking about.
  const { dirty, allowLeave } = useDiscardGuard({
    picked,
    title,
    caption,
    craftNote,
    tags,
    allowComments,
    showHire,
    audience,
  });

  const { albums } = useAlbums({ orderBy: 'created_at', direction: 'desc', limit: 100 });
  // Its own key: the album pages read the same files in a different shape.
  const files = useInfiniteQuery({
    queryKey: ['showcase-picker', albumId ?? 'all'],
    queryFn: ({ pageParam }) => storageApi.listFiles({ albumId, cursor: pageParam, limit: 60 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  /**
   * What can go in: photographs, and films that have a poster frame. The
   * server refuses a film without one, and it is written a minute or so after
   * the upload, so leaving those out says the rule before it is broken.
   */
  const available = useMemo(
    () =>
      (files.data?.pages.flatMap((page) => page.data) ?? []).filter((f) => {
        if (PROFILE_PICTURE_KEY.test(f.key)) return false;
        const kind = kindOf(f.contentType);
        if (kind === 'image') return Boolean(f.thumbnailUrl || f.url);
        return kind === 'video' && Boolean(f.posterUrl);
      }),
    [files.data],
  );

  const kindAt = (key: string) => kinds[key] ?? 'image';

  /*
   * Choosing, or taking out. A film is posted on its own, so choosing a film
   * takes out whatever was chosen, and choosing a photograph takes out a
   * film — said, with Undo, because a set of twenty arranged by hand is not
   * something to lose to one click. Greying out the other kind instead hid
   * the rule until somebody wondered why half the grid had stopped working.
   */
  const toggle = (key: string, still?: string | null, kind?: 'image' | 'video') => {
    if (still) setStills((current) => ({ ...current, [key]: still }));
    if (kind) setKinds((current) => ({ ...current, [key]: kind }));
    if (faulty?.key === key) setFaulty(null);
    if (picked.includes(key)) {
      setPicked(picked.filter((k) => k !== key));
      return;
    }
    const film = (kind ?? kindAt(key)) === 'video';
    const clashes = film ? picked.length > 0 : picked.some((k) => kindAt(k) === 'video');
    if (clashes) {
      const before = picked;
      setPicked([key]);
      toast('A film is posted on its own.', {
        description: `${describePieces(before.map(kindAt))} you had chosen ${
          before.length === 1 ? 'was' : 'were'
        } taken out.`,
        action: { label: 'Undo', onClick: () => setPicked(before) },
      });
      return;
    }
    if (picked.length >= MAX_SHOWCASE_ITEMS) return;
    setPicked([...picked, key]);
  };

  /** Moves the chosen piece at `from` to `to`. Position 0 is the cover. */
  const move = (from: number, to: number) =>
    setPicked((current) => {
      if (to < 0 || to >= current.length) return current;
      const next = current.slice();
      const [key] = next.splice(from, 1);
      next.splice(to, 0, key);
      return next;
    });

  const toggleTag = (tag: string) =>
    setTags((current) =>
      current.includes(tag)
        ? current.filter((t) => t !== tag)
        : current.length >= MAX_CRAFT_TAGS
          ? current
          : [...current, tag],
    );

  const addTypedTag = () => {
    const tag = tagDraft.trim().slice(0, MAX_TAG_LENGTH);
    if (!tag) return;
    setTagDraft('');
    setTags((current) =>
      current.some((t) => t.toLowerCase() === tag.toLowerCase()) || current.length >= MAX_CRAFT_TAGS
        ? current
        : [...current, tag],
    );
  };

  /*
   * A refusal about one piece points at it and says what to do (take it out,
   * or wait for a film to be ready) rather than "Try again", which for a
   * photograph that can never be posted would never come true.
   */
  const failed = (error: unknown, action: 'post' | 'edit') => {
    const message = showcaseActionMessage(error, action);
    const key = faultyPiece(error);
    if (key && picked.includes(key)) {
      setFaulty({ key, message });
      return;
    }
    toast.error(action === 'post' ? "Couldn't post that" : "Couldn't save that", {
      description: message,
    });
  };

  // Photographs up to the limit, or one film alone: the server's own rule
  // (SHOWCASE_FILM_ALONE), checked here so Post is never a button that fails.
  const pickedKinds = picked.map(kindAt);
  const postable = canPostTogether(pickedKinds);
  const filmWithOthers = picked.length > 1 && pickedKinds.includes('video');
  const isPrivate = audience === 'private';

  const post = () => {
    if (!postable || busy) return;
    setFaulty(null);
    create.mutate(
      {
        fileKeys: picked,
        title: title.trim() || undefined,
        caption: caption.trim() || undefined,
        craftNote: craftNote.trim() || undefined,
        craftTags: tags.length > 0 ? tags : undefined,
        allowComments,
        showHire,
        visibility: 'public',
        // Private is saved and not put out: it stays on your profile, where
        // only you see it, until you make it public.
        publish: !isPrivate,
      },
      {
        // Onto the post itself, in place of this form, so Back from it goes
        // where you came from rather than into a form for a post that exists.
        onSuccess: (created) => {
          allowLeave();
          router.replace(`/showcase/${created.id}`);
          toast.success(isPrivate ? 'Saved privately' : 'Posted', {
            description: isPrivate
              ? 'Only you can see it. Make it public from its menu when it is ready.'
              : 'It is on your profile and in the feed.',
          });
        },
        onError: (error) => failed(error, 'post'),
      },
    );
  };

  const save = () => {
    if (!existing || !postable || busy) return;
    setFaulty(null);
    const before = existing.pieces.map((piece) => piece.fileKey);
    const piecesChanged =
      picked.length !== before.length || picked.some((key, i) => key !== before[i]);
    // Put out or taken in only when the choice differs from how it is now,
    // and never for a post Virgo took down, which only Virgo can put back.
    const wantLive = !isPrivate;
    const changeLive = status !== 'removed' && wantLive !== (status === 'live');
    update.mutate(
      {
        id: existing.id,
        body: {
          // Only when they changed: sending them rewrites every piece and
          // queues its renditions again.
          ...(piecesChanged ? { fileKeys: picked } : {}),
          // Only when somebody chose Public for a post shown to connections.
          ...(audience === 'public' && existing.visibility !== 'public'
            ? { visibility: 'public' as const }
            : {}),
          // Empty strings rather than undefined: that is how the API is told
          // to clear a field.
          title: title.trim(),
          caption: caption.trim(),
          craftNote: craftNote.trim(),
          craftTags: tags,
          allowComments,
          showHire,
        },
      },
      {
        onSuccess: async () => {
          if (changeLive) {
            try {
              await setPublished.mutateAsync({ id: existing.id, published: wantLive });
            } catch (error) {
              // The words are saved either way; say which half did not happen.
              toast.error(
                wantLive ? "Saved, but couldn't make it public" : "Saved, but couldn't make it private",
                { description: showcaseActionMessage(error, 'takedown') },
              );
            }
          }
          allowLeave();
          router.replace(`/showcase/${existing.id}`);
          toast.success('Saved');
        },
        onError: (error) => failed(error, 'edit'),
      },
    );
  };

  const cancel = () =>
    leaveIfDiscarded(dirty, () => {
      allowLeave();
      if (window.history.length > 1) router.back();
      else router.push(existing ? `/showcase/${existing.id}` : '/feed');
    });

  const full = picked.length >= MAX_SHOWCASE_ITEMS;
  // Tags typed by hand are not among the suggestions; they are shown too, so
  // they can be taken off.
  const suggestions = [...TAG_SUGGESTIONS, ...FILM_TAG_SUGGESTIONS];
  const tagChoices = [...tags.filter((tag) => !suggestions.includes(tag)), ...suggestions];

  return (
    <Screen title={editing ? 'Edit showcase' : 'New showcase'}>
      <PageHeader
        title={editing ? 'Edit showcase' : 'New showcase'}
        description="A piece of work, and how you made it"
        actions={
          <>
            <Button variant="ghost" onClick={cancel} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={editing ? save : post} disabled={!postable || busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {editing || isPrivate
                ? busy
                  ? 'Saving…'
                  : 'Save'
                : create.isPending
                  ? 'Posting…'
                  : 'Post'}
            </Button>
          </>
        }
      />

      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-label="The work" className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">The work</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {picked.length === 1 && pickedKinds[0] === 'video'
              ? 'A film · a film is posted on its own'
              : `${picked.length}/${MAX_SHOWCASE_ITEMS} photos chosen`}
            {picked.length > 1 ? ' · the first is the cover. Click one to move it.' : ''}
          </p>
          {filmWithOthers && (
            // Only an older post can arrive like this: the grid below never
            // lets the two be chosen together.
            <p role="alert" className="mt-2 flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="mt-px size-3.5 shrink-0" />A film is posted on its own. Take
              out the photos, or the film, to save this.
            </p>
          )}

          {/* What is chosen, in order, including anything picked in another
              album, which the grid below no longer shows. Click one to make it
              the cover, move it, or take it out. */}
          {picked.length > 0 && (
            <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
              {picked.map((key, i) => {
                const bad = faulty?.key === key;
                return (
                  <DropdownMenu key={key}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Chosen, number ${i + 1}${i === 0 ? ', the cover' : ''}${bad ? ', cannot be posted' : ''}. Arrange.`}
                        className={cn(
                          'relative size-[72px] shrink-0 overflow-hidden rounded-lg bg-muted outline-offset-2',
                          bad && 'ring-2 ring-destructive',
                        )}
                      >
                        {stills[key] && (
                          <img src={stills[key]} alt="" className="size-full object-cover" />
                        )}
                        <span className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                          {i + 1}
                        </span>
                        {bad && (
                          <span className="absolute left-1 top-1 grid size-5 place-items-center rounded-full bg-destructive text-white">
                            <AlertCircle className="size-3" />
                          </span>
                        )}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                        {i === 0 ? 'The cover' : `Number ${i + 1}`}
                      </DropdownMenuLabel>
                      {i > 0 && (
                        <DropdownMenuItem onSelect={() => move(i, 0)}>
                          <Star />
                          Make it the cover
                        </DropdownMenuItem>
                      )}
                      {i > 0 && (
                        <DropdownMenuItem onSelect={() => move(i, i - 1)}>
                          <ArrowLeft />
                          Move earlier
                        </DropdownMenuItem>
                      )}
                      {i < picked.length - 1 && (
                        <DropdownMenuItem onSelect={() => move(i, i + 1)}>
                          <ArrowRight />
                          Move later
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => toggle(key)}>
                        <Trash2 />
                        Take it out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              })}
            </div>
          )}

          {faulty && (
            <div role="alert" className="mt-3 flex items-start gap-2.5 rounded-lg bg-destructive/10 p-3">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="flex-1 text-sm">{faulty.message}</p>
              <Button size="sm" variant="destructive" onClick={() => toggle(faulty.key)}>
                Take it out
              </Button>
            </div>
          )}

          {/* Where to look. What is chosen stays chosen across albums. */}
          {albums.length > 0 && (
            <div className="no-scrollbar mt-4 flex gap-1.5 overflow-x-auto pb-1">
              {[{ id: undefined, name: 'All uploads' }, ...albums].map((album) => {
                const on = album.id === albumId;
                return (
                  <button
                    key={album.id ?? 'all'}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setAlbumId(album.id)}
                    className={cn(
                      'max-w-48 shrink-0 truncate rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                      on
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'bg-card text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {album.name}
                  </button>
                );
              })}
            </div>
          )}

          {full && (
            <p className="mt-2 text-xs text-warning">
              That is all {MAX_SHOWCASE_ITEMS} photos. Take one out to swap it.
            </p>
          )}

          <div className="mt-3">
            {files.isLoading ? (
              <div className="grid place-items-center py-14 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : files.isError || files.isPaused ? (
              <Card>
                <EmptyState
                  icon={CloudOff}
                  title="Could not load your work"
                  description="Check your connection and try again."
                  action={<Button onClick={() => void files.refetch()}>Try again</Button>}
                />
              </Card>
            ) : available.length === 0 ? (
              <Card>
                <EmptyState
                  icon={ImagePlus}
                  title={albumId ? 'Nothing here can be posted yet' : 'Nothing uploaded yet'}
                  description={
                    albumId
                      ? 'Photographs show here once they are uploaded, and films once their preview is ready.'
                      : 'Your photographs and films live in albums. Upload some first and they will show up here.'
                  }
                  action={
                    albumId ? undefined : (
                      <Button asChild>
                        <Link href="/albums">Go to your albums</Link>
                      </Button>
                    )
                  }
                />
              </Card>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 xl:grid-cols-5">
                {available.map((file) => {
                  const at = picked.indexOf(file.key);
                  const on = at >= 0;
                  const film = kindOf(file.contentType) === 'video';
                  const still = stillOf(file);
                  return (
                    <button
                      key={file.key}
                      type="button"
                      onClick={() => toggle(file.key, still, film ? 'video' : 'image')}
                      aria-pressed={on}
                      aria-label={
                        on
                          ? `Chosen, number ${at + 1}. Remove.`
                          : film
                            ? 'Choose this film. A film is posted on its own.'
                            : 'Choose this photograph'
                      }
                      // A film is never "one too many": it replaces the set.
                      disabled={!on && full && !film}
                      className={cn(
                        'group relative aspect-square overflow-hidden rounded-lg bg-muted outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                        on && 'ring-3 ring-primary ring-offset-2 ring-offset-background',
                      )}
                    >
                      {still && (
                        <img
                          src={still}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className={cn(
                            'size-full object-cover transition-transform duration-300',
                            on ? 'scale-[0.94]' : 'group-hover:scale-[1.03]',
                          )}
                        />
                      )}
                      {film && (
                        <>
                          <span className="pointer-events-none absolute inset-0 grid place-items-center">
                            <span className="grid size-9 place-items-center rounded-full bg-black/50 text-white">
                              <Play className="size-4" fill="currentColor" />
                            </span>
                          </span>
                          {file.durationMs ? (
                            <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {clock(file.durationMs)}
                            </span>
                          ) : null}
                        </>
                      )}
                      {on && (
                        <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                          {at + 1}
                        </span>
                      )}
                      {at === 0 && (
                        <span className="absolute bottom-1.5 left-1.5 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                          Cover
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {files.hasNextPage && (
              <div className="grid place-items-center pt-4">
                <Button
                  variant="secondary"
                  disabled={files.isFetchingNextPage}
                  onClick={() => void files.fetchNextPage()}
                >
                  {files.isFetchingNextPage ? 'Loading…' : 'Show more'}
                </Button>
              </div>
            )}
          </div>
        </section>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-6 lg:self-start">
          <div className="grid gap-2">
            <Label htmlFor="showcase-title">Title</Label>
            <Input
              id="showcase-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ten minutes before the rain"
              maxLength={TITLE_MAX}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="showcase-caption">Caption</Label>
            <Textarea
              id="showcase-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Where it was, who it was for"
              maxLength={CAPTION_MAX}
              rows={3}
            />
          </div>

          {/* The field the whole feed is for: a caption says what this is,
              and the note says what somebody else could do with it. */}
          <Card className="gap-0 border-primary/40 bg-primary/5 py-0">
            <CardContent className="grid gap-3 py-4">
              <div>
                <Label htmlFor="showcase-note" className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
                  How it was made
                </Label>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  One thing another photographer could use. This is what turns a scroll
                  into something worth keeping.
                </p>
              </div>
              <Textarea
                id="showcase-note"
                value={craftNote}
                onChange={(e) => setCraftNote(e.target.value)}
                placeholder="Backlit into the storm front so the rain read as light, not weather."
                maxLength={NOTE_MAX}
                rows={3}
                className="bg-card"
              />

              <p className="text-xs text-muted-foreground">
                Tags · {tags.length}/{MAX_CRAFT_TAGS}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {tagChoices.map((tag) => {
                  const on = tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleTag(tag)}
                      disabled={!on && tags.length >= MAX_CRAFT_TAGS}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-45',
                        on
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'bg-card text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {on && <Check className="size-3" />}
                      {tag}
                    </button>
                  );
                })}
              </div>
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  addTypedTag();
                }}
              >
                <Input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  placeholder="Add your own tag"
                  maxLength={MAX_TAG_LENGTH}
                  disabled={tags.length >= MAX_CRAFT_TAGS}
                  aria-label="Add your own tag"
                  className="bg-card"
                />
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Add this tag"
                  disabled={!tagDraft.trim() || tags.length >= MAX_CRAFT_TAGS}
                >
                  <Plus className="size-4" />
                </Button>
              </form>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Typed by you, never read off the file: what your camera recorded about where
                you were stays private.
              </p>
            </CardContent>
          </Card>

          <AudiencePicker
            value={audience}
            onChange={setAudience}
            // Offered only to a post that already is shown to connections,
            // so choosing it is never how a new post ends up narrower.
            offerConnections={existing?.visibility === 'connections'}
            removed={status === 'removed'}
          />

          <Card className="gap-0 py-0">
            <CardContent className="p-0">
              <label className="flex items-start gap-3 border-b px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Comments</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    You can turn them off later. Nothing said is deleted: it stops being
                    shown, and comes back if you turn them on again.
                  </span>
                </span>
                <Switch
                  checked={allowComments}
                  onCheckedChange={setAllowComments}
                  aria-label="Allow comments on this showcase"
                  className="mt-0.5"
                />
              </label>
              <label className="flex items-start gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Show Hire</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    A Hire button on this post, for people who want to book you.
                  </span>
                </span>
                <Switch
                  checked={showHire}
                  onCheckedChange={setShowHire}
                  aria-label="Show a Hire button on this showcase"
                  className="mt-0.5"
                />
              </label>
            </CardContent>
          </Card>

          {picked.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Choose up to {MAX_SHOWCASE_ITEMS} photos, or one film, to{' '}
              {editing || isPrivate ? 'save' : 'post'}.
            </p>
          )}
        </aside>
      </div>
    </Screen>
  );
}

type Audience = 'public' | 'connections' | 'private';

/** "The film", "The photo", "The 3 photos", "The 4 pieces": for the film-alone toast. */
function describePieces(kinds: ('image' | 'video')[]): string {
  const films = kinds.filter((k) => k === 'video').length;
  if (kinds.length === 1) return films ? 'The film' : 'The photo';
  if (films === 0) return `The ${kinds.length} photos`;
  if (films === kinds.length) return `The ${kinds.length} films`;
  return `The ${kinds.length} pieces`;
}

const AUDIENCES: { value: Audience; label: string; detail: string; icon: typeof Globe }[] = [
  {
    value: 'public',
    label: 'Public',
    detail: 'In the feed and on your profile, with a link you can share.',
    icon: Globe,
  },
  {
    value: 'connections',
    label: 'Connections',
    detail: 'Only people you are connected to. It has no link to share.',
    icon: Users,
  },
  {
    value: 'private',
    label: 'Private',
    detail: 'Only you. Saved on your profile, out of the feed, until you make it public.',
    icon: Lock,
  },
];

/**
 * Who sees it: Public or Private, and Connections for a post that already
 * is. Radios rather than a switch, because the three are not on and off.
 */
function AudiencePicker({
  value,
  onChange,
  offerConnections,
  removed,
}: {
  value: Audience;
  onChange: (value: Audience) => void;
  offerConnections: boolean;
  /** Taken down by Virgo: only Virgo can put it back, so there is no choice. */
  removed: boolean;
}) {
  const options = AUDIENCES.filter((a) => a.value !== 'connections' || offerConnections);
  return (
    <Card className="gap-0 py-0">
      <CardContent className="p-0">
        <p id="audience-label" className="px-4 pb-1 pt-3 text-sm font-semibold">
          Who sees it
        </p>
        {removed ? (
          <p className="px-4 pb-3 text-xs leading-relaxed text-muted-foreground">
            Virgo took this post down, so only you see it. Your changes are still saved.
          </p>
        ) : (
          <div role="radiogroup" aria-labelledby="audience-label" className="grid pb-1.5">
            {options.map((option) => {
              const checked = value === option.value;
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => onChange(option.value)}
                  className="flex items-start gap-3 px-4 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                      {option.detail}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2',
                      checked ? 'border-primary' : 'border-muted-foreground/40',
                    )}
                  >
                    {checked && <span className="size-2 rounded-full bg-primary" />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
