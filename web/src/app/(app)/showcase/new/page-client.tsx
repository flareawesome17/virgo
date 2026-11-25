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
  CloudOff,
  ImagePlus,
  Loader2,
  MapPin,
  Play,
  Plus,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Screen } from '@/components/app-shell';
import {
  ChoiceChip,
  FORM_INPUT,
  FORM_TEXTAREA,
  FilterChip,
  FormCard,
  FormField,
  FormSection,
  FormSwitchRow,
} from '@/components/kit';
import { CenteredSpinner, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { VideoThumbnail } from '@/components/media/video-thumbnail';
import { faultyPiece, showcaseActionMessage } from '@/components/showcase/action-message';
import { RadioRow } from '@/components/showcase/radio-row';
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
/** The API's limits on the texts. */
const TITLE_MAX = 120;
const CAPTION_MAX = 2200;
const NOTE_MAX = 600;
const LOCATION_MAX = 120;

/**
 * What kind of work it is. One at most, and none is fine. The API keeps it as
 * the words themselves, which is what a card prints, so this is the phone's
 * list: a kind chosen here has to be one the phone can show chosen too.
 */
const CATEGORIES = ['Wedding', 'Prenup', 'Debut', 'Portrait', 'Event', 'Commercial'];

/**
 * White on the page's colour, so a field reads as a field. A text area grows
 * with what is typed in it, so it has no corner to drag.
 */
const FIELD = cn(FORM_INPUT, 'bg-card');
const AREA = cn(FORM_TEXTAREA, 'resize-none bg-card');

/** "Cover", on the first of what is chosen. */
const COVER_PILL =
  'rounded-full bg-background px-2 py-0.5 text-[11px] font-bold leading-4 text-foreground';

/** "1:05" for a film's length. */
function clock(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * A tile's still: the thumbnail or poster, never the original. Null for a
 * film with no poster, which shows the video icon instead.
 */
function stillOf(file: StoredFile): string | null {
  return kindOf(file.contentType) === 'video' ? file.posterUrl : (file.thumbnailUrl ?? file.url);
}

/**
 * Posting a showcase, or with `?edit=<id>` changing one.
 *
 * The phone's form (mobile/app/(app)/showcase/new.tsx), laid out for a wide
 * screen: the work on the left, what you say about it on the right. The
 * phone's two steps are one page here, because there is room for both.
 */
function NewShowcase() {
  const params = useSearchParams();
  const edit = params.get('edit') ?? undefined;
  const { showcase, isLoading, loadFailed, refetch } = useShowcase(edit);

  if (!edit) return <ShowcaseForm />;
  if (!showcase) {
    return (
      <Screen title="Edit post">
        {isLoading ? (
          <CenteredSpinner />
        ) : (
          <EmptyState
            icon={CloudOff}
            title={loadFailed ? 'Could not load this post' : 'This post has gone'}
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
  const [category, setCategory] = useState(existing?.category ?? '');
  const [location, setLocation] = useState(existing?.location ?? '');
  const [craftNote, setCraftNote] = useState(existing?.craftNote ?? '');
  const [tags, setTags] = useState<string[]>(existing?.craftTags ?? []);
  const [tagDraft, setTagDraft] = useState('');
  const [typingTag, setTypingTag] = useState(false);
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
   * Who sees it. Everyone for a new post. An existing one starts where it
   * is: only you if it is not out, and otherwise whoever it is out to, so
   * saving an edit never quietly widens or narrows who sees it.
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
    category,
    location,
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
   * What can go in: photographs, and films the media worker has finished
   * with. Posting a film makes its poster frame, and the server refuses one
   * still being prepared, so leaving those out says the rule before it is
   * broken. A poster also means finished: it is how films said so before.
   */
  const available = useMemo(
    () =>
      (files.data?.pages.flatMap((page) => page.data) ?? []).filter((f) => {
        if (PROFILE_PICTURE_KEY.test(f.key)) return false;
        const kind = kindOf(f.contentType);
        if (kind === 'image') return Boolean(f.thumbnailUrl || f.url);
        return kind === 'video' && (Boolean(f.posterUrl) || f.processingStatus === 'ready');
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
  const filmAlone = picked.length === 1 && pickedKinds[0] === 'video';
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
        category: category || undefined,
        location: location.trim() || undefined,
        craftNote: craftNote.trim() || undefined,
        craftTags: tags.length > 0 ? tags : undefined,
        allowComments,
        showHire,
        // Only you is not an audience the API knows: that one is a post
        // saved and not put out, below.
        visibility: audience === 'connections' ? 'connections' : 'public',
        // Private is saved and not put out: it stays on your profile, where
        // only you see it, until you choose who sees it.
        publish: !isPrivate,
      },
      {
        // To where it now lives, in place of this form: the feed, where a new
        // post of yours comes first, or your profile for a private one, which
        // is in no feed. There is no post page to land on any more.
        onSuccess: () => {
          allowLeave();
          router.replace(isPrivate ? '/profile' : '/feed');
          toast.success(isPrivate ? 'Saved privately' : 'Posted', {
            description: isPrivate
              ? 'Only you can see it. Choose who sees it from its menu when it is ready.'
              : audience === 'connections'
                ? 'It is on your profile and in the feed, for your connections only.'
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
          // Only when the audience chosen is not the one the post has: an
          // untouched choice sends nothing. Only you is the request after
          // this one.
          ...(audience !== 'private' && existing.visibility !== audience
            ? { visibility: audience }
            : {}),
          // Empty strings rather than undefined: that is how the API is told
          // to clear a field.
          title: title.trim(),
          caption: caption.trim(),
          category,
          location: location.trim(),
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
              toast.error("Saved, but who sees it didn't change", {
                description: showcaseActionMessage(error, 'takedown'),
              });
            }
          }
          allowLeave();
          // Back to wherever the edit was opened from: the feed, a profile.
          if (window.history.length > 1) router.back();
          else router.replace('/feed');
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
      else router.push('/feed');
    });

  const full = picked.length >= MAX_SHOWCASE_ITEMS;
  const tagsFull = tags.length >= MAX_CRAFT_TAGS;
  // Offered until chosen. A tag once chosen moves up among the chosen, where
  // it can be taken off again, whether it was offered or typed.
  const tagOffers = [...TAG_SUGGESTIONS, ...FILM_TAG_SUGGESTIONS].filter(
    (tag) => !tags.includes(tag),
  );
  // A kind chosen somewhere that offers others is shown too, so it can be
  // taken off.
  const categoryChoices =
    category && !CATEGORIES.includes(category) ? [category, ...CATEGORIES] : CATEGORIES;

  return (
    <Screen title={editing ? 'Edit post' : 'New post'}>
      <PageHeader
        title={editing ? 'Edit post' : 'New post'}
        description="A piece of work, and how you made it. It goes into the feed and onto your profile."
        actions={
          <>
            <Button variant="secondary" onClick={cancel} disabled={busy}>
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

      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-start gap-8 px-4 pb-12 pt-6 sm:px-6">
        <section aria-label="The work" className="flex min-w-0 flex-[3_1_480px] flex-col gap-3.5">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <h2 className="text-base font-bold leading-6 tracking-tight">The work</h2>
            <p className="text-[13px] text-muted-foreground">
              {filmAlone
                ? 'A film · a film is posted on its own'
                : `${picked.length} of ${MAX_SHOWCASE_ITEMS} photographs chosen`}
            </p>
          </div>
          {filmWithOthers && (
            // Only an older post can arrive like this: the grid below never
            // lets the two be chosen together.
            <p role="alert" className="flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="mt-px size-3.5 shrink-0" />A film is posted on its own. Take
              out the photos, or the film, to save this.
            </p>
          )}

          {/* What is chosen, in order, including anything picked in another
              album, which the grid below no longer shows. Click one to make it
              the cover, move it, or take it out. */}
          {picked.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {picked.map((key, i) => {
                const bad = faulty?.key === key;
                return (
                  <DropdownMenu key={key}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Chosen, number ${i + 1}${i === 0 ? ', the cover' : ''}${bad ? ', cannot be posted' : ''}. Arrange.`}
                        className={cn(
                          'relative h-[90px] w-[72px] shrink-0 overflow-hidden rounded-[10px] bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                          bad && 'ring-2 ring-destructive',
                        )}
                      >
                        {stills[key] ? (
                          <img src={stills[key]} alt="" className="size-full object-cover" />
                        ) : kindAt(key) === 'video' ? (
                          <span className="grid size-full place-items-center bg-secondary">
                            <VideoThumbnail className="w-3/5" />
                          </span>
                        ) : null}
                        <span className="absolute left-[5px] top-[5px] grid size-5 place-items-center rounded-full bg-foreground text-[11px] font-bold text-background">
                          {i + 1}
                        </span>
                        {bad && (
                          <span className="absolute right-[5px] top-[5px] grid size-5 place-items-center rounded-full bg-destructive text-white">
                            <AlertCircle className="size-3" />
                          </span>
                        )}
                        {i === 0 && !filmAlone && (
                          <span className={cn(COVER_PILL, 'absolute bottom-[5px] left-[5px]')}>
                            Cover
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
              {picked.length > 1 && (
                <p className="ml-2 text-[13px] text-muted-foreground">The first is the cover.</p>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              Choose up to {MAX_SHOWCASE_ITEMS} photos, or one film, to{' '}
              {editing || isPrivate ? 'save' : 'post'}.
            </p>
          )}

          {faulty && (
            <div role="alert" className="flex items-start gap-2.5 rounded-xl bg-destructive/10 p-3">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="flex-1 text-sm">{faulty.message}</p>
              <Button size="sm" variant="destructive" onClick={() => toggle(faulty.key)}>
                Take it out
              </Button>
            </div>
          )}

          {/* Where to look. What is chosen stays chosen across albums. In one
              line that scrolls, because there can be a hundred albums; the
              padding is room for a chip's focus ring inside the scroller. */}
          {albums.length > 0 && (
            <div className="no-scrollbar -m-1 flex gap-2 overflow-x-auto p-1">
              {[{ id: undefined, name: 'All uploads' }, ...albums].map((album) => (
                <FilterChip
                  key={album.id ?? 'all'}
                  on={album.id === albumId}
                  onClick={() => setAlbumId(album.id)}
                  className="max-w-48"
                >
                  <span className="truncate">{album.name}</span>
                </FilterChip>
              ))}
            </div>
          )}

          {full && (
            <p className="text-xs text-warning">
              That is all {MAX_SHOWCASE_ITEMS} photos. Take one out to swap it.
            </p>
          )}

          <div>
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
              <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1.5">
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
                      className="group relative aspect-square overflow-hidden rounded-lg bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {still ? (
                        <img
                          src={still}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className={cn(
                            'size-full object-cover transition-transform duration-300',
                            !on && 'group-hover:scale-[1.03]',
                          )}
                        />
                      ) : film ? (
                        <span className="grid size-full place-items-center bg-secondary">
                          <VideoThumbnail className="w-1/2" />
                        </span>
                      ) : null}
                      {film && (
                        <>
                          {/* The icon has a play button of its own. */}
                          {still && (
                            <span className="pointer-events-none absolute inset-0 grid place-items-center">
                              <span className="grid size-9 place-items-center rounded-full bg-black/50 text-white">
                                <Play className="size-4" fill="currentColor" />
                              </span>
                            </span>
                          )}
                          {file.durationMs ? (
                            <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {clock(file.durationMs)}
                            </span>
                          ) : null}
                        </>
                      )}
                      {on && (
                        <>
                          {/* Over the picture, which would cover a border of
                              the tile's own. */}
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-0 rounded-lg ring-3 ring-inset ring-foreground"
                          />
                          <span className="absolute right-1.5 top-1.5 grid size-[22px] place-items-center rounded-full bg-foreground text-xs font-bold text-background">
                            {at + 1}
                          </span>
                        </>
                      )}
                      {at === 0 && !filmAlone && (
                        <span className={cn(COVER_PILL, 'absolute bottom-1.5 left-1.5')}>Cover</span>
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

        <aside className="flex min-w-0 flex-[2_1_360px] flex-col gap-5 lg:sticky lg:top-6">
          <FormSection title="The words">
            <div className="flex flex-col gap-4">
              <FormField label="Title" htmlFor="showcase-title">
                <Input
                  id="showcase-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ten minutes before the rain"
                  maxLength={TITLE_MAX}
                  className={FIELD}
                />
              </FormField>
              <FormField
                label="Caption"
                htmlFor="showcase-caption"
                right={`${caption.length.toLocaleString('en-US')} of ${CAPTION_MAX.toLocaleString('en-US')}`}
              >
                <Textarea
                  id="showcase-caption"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Where it was, who it was for"
                  maxLength={CAPTION_MAX}
                  rows={3}
                  className={AREA}
                />
              </FormField>
              <div className="flex flex-col gap-2">
                <p id="showcase-kind" className="text-sm font-semibold">
                  What kind of work
                </p>
                <div role="group" aria-labelledby="showcase-kind" className="flex flex-wrap gap-2">
                  {categoryChoices.map((kind) => (
                    <ChoiceChip
                      key={kind}
                      on={category === kind}
                      // The chosen one again takes it off: it is optional.
                      onClick={() => setCategory(category === kind ? '' : kind)}
                    >
                      {kind}
                    </ChoiceChip>
                  ))}
                </div>
              </div>
              <FormField label="Where" htmlFor="showcase-where">
                <div className="relative">
                  <MapPin
                    aria-hidden
                    className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="showcase-where"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Sirao Garden, Cebu"
                    maxLength={LOCATION_MAX}
                    className={cn(FIELD, 'pl-10')}
                  />
                </div>
              </FormField>
            </div>
          </FormSection>

          {/* The field the whole feed is for: a caption says what this is,
              and the note says what somebody else could do with it. */}
          <FormSection title="How it was made">
            <div className="flex flex-col gap-4">
              <FormField
                label="A note"
                htmlFor="showcase-note"
                hint="One thing another photographer could use. This is what turns a scroll into something worth keeping."
              >
                <Textarea
                  id="showcase-note"
                  value={craftNote}
                  onChange={(e) => setCraftNote(e.target.value)}
                  placeholder="Backlit into the storm front so the rain read as light, not weather."
                  maxLength={NOTE_MAX}
                  rows={2}
                  className={AREA}
                />
              </FormField>

              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p id="showcase-tags" className="text-sm font-semibold">
                    Tags
                  </p>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {tags.length} of {MAX_CRAFT_TAGS}
                  </span>
                </div>
                <div
                  role="group"
                  aria-labelledby="showcase-tags"
                  className="flex flex-wrap items-center gap-1.5"
                >
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full bg-muted py-[5px] pl-3 pr-1.5 text-[13px] font-medium text-secondary-foreground"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => toggleTag(tag)}
                        aria-label={`Take off ${tag}`}
                        className="grid size-4 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  {typingTag && !tagsFull ? (
                    <form
                      className="flex items-center gap-1.5"
                      onSubmit={(event) => {
                        event.preventDefault();
                        addTypedTag();
                      }}
                    >
                      <Input
                        value={tagDraft}
                        onChange={(e) => setTagDraft(e.target.value)}
                        // Left empty, it goes back to being the link it was.
                        onBlur={() => {
                          if (!tagDraft.trim()) setTypingTag(false);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Escape') return;
                          setTagDraft('');
                          setTypingTag(false);
                        }}
                        placeholder="Add your own tag"
                        aria-label="Add your own tag"
                        maxLength={MAX_TAG_LENGTH}
                        autoFocus
                        className="h-8 w-40 rounded-full bg-card px-3 text-[13px] md:text-[13px]"
                      />
                      <Button
                        type="submit"
                        size="icon"
                        variant="secondary"
                        aria-label="Add this tag"
                        disabled={!tagDraft.trim()}
                        className="rounded-full"
                      >
                        <Plus className="size-4" />
                      </Button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setTypingTag(true)}
                      disabled={tagsFull}
                      className="rounded-md px-2 py-[5px] text-[13px] font-semibold text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 disabled:text-muted-foreground disabled:no-underline"
                    >
                      Add your own tag
                    </button>
                  )}
                </div>
                {tagOffers.length > 0 && (
                  <div role="group" aria-label="Suggested tags" className="flex flex-wrap gap-1.5">
                    {tagOffers.map((tag) => (
                      // Outlined, so what is offered does not read as what
                      // is chosen, which is filled.
                      <ChoiceChip
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        disabled={tagsFull}
                        className="h-7 gap-1 border border-border bg-transparent px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground [&_svg]:size-3"
                      >
                        <Plus aria-hidden />
                        {tag}
                      </ChoiceChip>
                    ))}
                  </div>
                )}
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Typed by you, never read off the file: what your camera recorded about where
                  you were stays private.
                </p>
              </div>
            </div>
          </FormSection>

          <FormSection title="Who sees it">
            {status === 'removed' ? (
              // Taken down by Virgo: only Virgo can put it back, so there is
              // no choice to make.
              <p className="text-[13px] leading-[18px] text-muted-foreground">
                Virgo took this post down, so only you see it. Your changes are still saved.
              </p>
            ) : (
              <div role="radiogroup" aria-label="Who sees it">
                <FormCard>
                  {AUDIENCES.map((option) => (
                    <RadioRow
                      key={option.value}
                      name="showcase-audience"
                      checked={audience === option.value}
                      onSelect={() => setAudience(option.value)}
                      label={option.label}
                      detail={option.detail}
                    />
                  ))}
                </FormCard>
              </div>
            )}
          </FormSection>

          <FormSection title="On the post">
            <FormCard>
              <FormSwitchRow
                label="Comments"
                checked={allowComments}
                onCheckedChange={setAllowComments}
              />
              <FormSwitchRow label="Show Hire" checked={showHire} onCheckedChange={setShowHire} />
            </FormCard>
            <p className="text-xs leading-relaxed text-muted-foreground">
              You can turn comments off later. Nothing said is deleted: it stops being shown, and
              comes back if you turn them on again. The Hire button is for people who want to
              book you.
            </p>
          </FormSection>
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

/**
 * Who sees a post, as the phone always offers it. Everyone is the feed, the
 * profile and the link; your connections is their feed alone; only you is
 * the author alone, which to the API is a post saved and not put out.
 */
const AUDIENCES: { value: Audience; label: string; detail: string }[] = [
  { value: 'public', label: 'Everyone', detail: 'In the feed, on your profile, and by link' },
  {
    value: 'connections',
    label: 'Your connections',
    detail: 'Only people you are connected with',
  },
  { value: 'private', label: 'Only you', detail: 'Kept private until you change it' },
];
