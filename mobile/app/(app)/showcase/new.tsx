import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  BackHandler,
  Pressable,
  Text,
  View,
} from 'react-native';
import { KeyboardFrame, KeyboardScroll } from '@/components/KeyboardForm';
import { router, useLocalSearchParams } from 'expo-router';
import { useDiscardGuard } from '@/src/lib/discard-guard';
import { goToTab } from '@/src/lib/navigation';
import { InsetFrame } from '@/components/InsetFrame';
import { useInfiniteQuery } from '@tanstack/react-query';
import { MapPinIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { FormHeader } from '@/components/FormHeader';
import {
  ChoiceChip,
  ChoiceChips,
  FormCard,
  FormField,
  FormFooter,
  FormHint,
  FormInput,
  FormLabel,
  FormSection,
  FormSwitchRow,
} from '@/components/Form';
import { RemoteImage } from '@/components/RemoteImage';
import { VideoThumbnail } from '@/components/VideoThumbnail';
import { DetailFallback } from '@/components/DetailFallback';
import { ArrangeSheet } from '@/components/showcase-form/ArrangeSheet';
import { AudienceCard, type Audience } from '@/components/showcase-form/AudienceCard';
import { ChosenStrip } from '@/components/showcase-form/ChosenStrip';
import { Count, CraftSection } from '@/components/showcase-form/CraftSection';
import { WorkPicker } from '@/components/showcase-form/WorkPicker';
import {
  NoticeText,
  PickerNotice,
  type PieceAbout,
  type PieceKind,
} from '@/components/showcase-form/parts';
import {
  albumFilesQueryKey,
  kindOf,
  useAlbums,
  useShowcase,
  useShowcaseActions,
} from '@/src/hooks';
import {
  MAX_CRAFT_TAGS,
  ApiError,
  MAX_SHOWCASE_ITEMS,
  canPostTogether,
  showcaseStatus,
  storageApi,
  type Showcase,
} from '@/src/api';
import { faultyPiece, profileActionMessage } from '@/src/lib/profile-media';

cssInterop(MapPinIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/** A profile photo is never a piece of work; the server refuses them too. */
const PROFILE_PICTURE_KEY = /^users\/[^/]+\/(avatars|covers)\//;

/**
 * Offered, so most craft facts are a tap. Anything else can be typed: these
 * were the only fifteen there were, and none of them was about film.
 */
const TAG_SUGGESTIONS = [
  '24mm', '35mm', '50mm', '85mm', '135mm',
  'f/1.4', 'f/2', 'f/2.8', 'f/8',
  'Natural light', 'Backlight', 'Golden hour', 'Blue hour', 'Flash', 'One light',
];
const FILM_TAG_SUGGESTIONS = ['Gimbal', 'Handheld', 'Drone', 'Slow motion', '24fps', 'Log', 'Same-day edit'];
/** The server's own limit on one tag. */
const MAX_TAG_LENGTH = 32;

/**
 * What kind of work it is. One at most, and none is fine. The API keeps it as
 * the words themselves, which is what a card prints.
 */
const CATEGORIES = ['Wedding', 'Prenup', 'Debut', 'Portrait', 'Event', 'Commercial'];

/** Said when a film and photographs meet, by the grid and by a refused post. */
const FILM_ALONE = 'A film is posted on its own.';
const NO_MIXING = "Photos and a film can't share a post.";

/**
 * Posting a showcase, or — with `?edit=<id>` — changing one.
 *
 * Editing did not exist on the phone: a typo in a caption meant deleting the
 * post, and with it every like, comment and keep. The API took changes all
 * along.
 */
export default function NewShowcaseScreen() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const { showcase, error, loadFailed, refetch } = useShowcase(edit);

  if (!edit) return <ShowcaseForm />;
  if (!showcase) {
    return (
      <DetailFallback
        title="Edit showcase"
        what="this showcase"
        gone="It has been deleted."
        error={error}
        failed={loadFailed}
        onRetry={() => refetch()}
      />
    );
  }
  // Keyed, so the form starts from the showcase without an effect copying it in.
  return <ShowcaseForm key={showcase.id} existing={showcase} />;
}

/**
 * The form, in two steps on the one screen: the work, then the words.
 *
 * It was one long page with the library in the middle of it, so the caption
 * was a scroll past every photograph you own. Choosing is its own step now,
 * and the words have a page to themselves. An edit opens on the words, which
 * is what an edit is nearly always for; the work is one tap back.
 */
function ShowcaseForm({ existing }: { existing?: Showcase }) {
  const { create, update, setPublished } = useShowcaseActions();
  const editing = Boolean(existing);
  const busy = create.isPending || update.isPending || setPublished.isPending;
  const status = existing ? showcaseStatus(existing) : null;

  const [step, setStep] = useState<1 | 2>(editing ? 2 : 1);
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
  const [allowComments, setAllowComments] = useState(existing?.allowComments ?? true);
  // Every post showed Hire, with no way to turn it off.
  const [showHire, setShowHire] = useState(existing?.showHire ?? true);
  /** The chosen piece whose menu is open: cover, move, remove. */
  const [arranging, setArranging] = useState<number | null>(null);
  /** The piece the server turned down, and why, until it is dealt with. */
  const [faulty, setFaulty] = useState<{ key: string; message: string } | null>(null);
  /**
   * Whether each chosen piece is a photograph or a film, for the rule that a
   * film goes alone. Kept per key, like the stills, because the grid only
   * holds the album on screen.
   */
  const [kinds, setKinds] = useState<Record<string, PieceKind>>(() =>
    Object.fromEntries(existing?.pieces.map((piece) => [piece.fileKey, piece.kind]) ?? []),
  );
  /**
   * Why the last tap did not add what it was on, and the one tap that would
   * — the film instead of the photographs, or the other way round. Said in
   * place rather than in an alert, next to the choice it is about.
   */
  const [notice, setNotice] = useState<{
    message: string;
    swap?: { label: string; key: string };
  } | null>(null);
  /*
   * Everyone for a new post. An existing one starts where it is: only you if
   * it is not out, and otherwise whoever it is out to, so saving an edit never
   * quietly widens or narrows who sees it. One Virgo took down has no choice
   * to make.
   */
  const [visibility, setVisibility] = useState<Audience | null>(() => {
    if (!existing) return 'public';
    if (status === 'removed') return null;
    if (status === 'live') return existing.visibility === 'connections' ? 'connections' : 'public';
    return 'private';
  });
  // A still for everything chosen, whichever album it was picked from — the
  // grid only holds the album on screen.
  const [stills, setStills] = useState<Record<string, string>>(() =>
    Object.fromEntries(existing?.pieces.map((piece) => [piece.fileKey, piece.url]) ?? []),
  );
  // And its name, album and length, for the same reason. A piece that came
  // with the post has only its length: a showcase does not carry file names.
  const [about, setAbout] = useState<Record<string, PieceAbout>>(() =>
    Object.fromEntries(
      existing?.pieces.map((piece) => [piece.fileKey, { durationMs: piece.durationMs }]) ?? [],
    ),
  );

  /*
   * Everything, a page at a time, or one album.
   *
   * The key is the album screens' own, so a page already loaded there is not
   * fetched twice.
   */
  const [albumId, setAlbumId] = useState<string | undefined>(undefined);
  // A chosen set of work and a written caption are worth asking about.
  const { allowLeave } = useDiscardGuard({
    picked,
    title,
    caption,
    category,
    location,
    craftNote,
    tags,
    allowComments,
    showHire,
    visibility,
  });
  const { albums } = useAlbums({ orderBy: 'created_at', direction: 'desc', limit: 100 });
  const files = useInfiniteQuery({
    queryKey: albumFilesQueryKey(albumId),
    queryFn: ({ pageParam }) => storageApi.listFiles({ albumId, cursor: pageParam, limit: 100 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  /*
   * Android's back button on the words goes back to the work, as the X does,
   * rather than out of the form with both steps' worth of typing.
   */
  useEffect(() => {
    if (step !== 2) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep(1);
      return true;
    });
    return () => sub.remove();
  }, [step]);

  /**
   * What can go in: photographs, and films the media worker has finished with.
   *
   * Posting a film makes its poster frame, and the server refuses one still
   * being prepared. Leaving those out of the grid is the same rule stated
   * before it is broken rather than after. A poster also means finished: it
   * is how films said so before.
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

  const pickedKinds = picked.map((key) => kinds[key] ?? 'image');
  const hasFilm = pickedKinds.includes('video');

  /*
   * Choosing, and the rule that comes with it: up to twenty photographs, or
   * one film on its own. A tap that would break it is turned down where it
   * happened, with the swap offered — what is already chosen is never thrown
   * away by a tap meant to add to it.
   */
  const toggle = (key: string, still?: string, kind?: PieceKind, known?: PieceAbout) => {
    if (still) setStills((current) => ({ ...current, [key]: still }));
    if (kind) setKinds((current) => (current[key] === kind ? current : { ...current, [key]: kind }));
    if (known) setAbout((current) => ({ ...current, [key]: known }));
    if (faulty?.key === key) setFaulty(null);
    if (picked.includes(key)) {
      setNotice(null);
      setPicked((current) => current.filter((k) => k !== key));
      return;
    }
    const adding = kind ?? kinds[key] ?? 'image';
    if (adding === 'video' && picked.length > 0) {
      setNotice({
        message: hasFilm ? FILM_ALONE : `${NO_MIXING} ${FILM_ALONE}`,
        swap: { label: hasFilm ? 'Use this film instead' : 'Post the film instead', key },
      });
      return;
    }
    if (adding === 'image' && hasFilm) {
      setNotice({ message: `${FILM_ALONE} ${NO_MIXING}`, swap: { label: 'Use photos instead', key } });
      return;
    }
    setNotice(null);
    setPicked((current) =>
      current.includes(key) || current.length >= MAX_SHOWCASE_ITEMS ? current : [...current, key],
    );
  };

  /** The one the notice is about, in place of everything chosen. */
  const swapTo = (key: string) => {
    setNotice(null);
    setFaulty(null);
    setPicked([key]);
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
   * A refusal about one piece points at it and says what to do — take it
   * out, or wait for a film to be ready — rather than "Try again", which for
   * a photograph that can never be posted would never come true.
   *
   * Both of those are said beside the work, which is the first step, so the
   * form goes back there: the button that was refused is on the second.
   */
  const failed = (error: unknown, action: 'showcase' | 'editShowcase') => {
    const message = profileActionMessage(error, action);
    // Said beside the work, where it can be fixed, rather than in an alert.
    if (
      error instanceof ApiError &&
      (error.body as { code?: unknown } | undefined)?.code === 'SHOWCASE_FILM_ALONE'
    ) {
      setNotice({ message: `${NO_MIXING} ${FILM_ALONE}` });
      setStep(1);
      return;
    }
    const key = faultyPiece(error);
    if (key && picked.includes(key)) {
      setFaulty({ key, message });
      setStep(1);
      return;
    }
    Alert.alert(action === 'showcase' ? "Couldn't post that" : "Couldn't save that", message);
  };

  const post = () => {
    if (!canPostTogether(pickedKinds)) return;
    setFaulty(null);
    setNotice(null);
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
        // Everyone is what the server assumes when nothing is said.
        ...(visibility === 'connections' ? { visibility: 'connections' as const } : {}),
        // Only you is saved and not posted: only its author sees it, and it
        // goes out when they choose who to.
        publish: visibility !== 'private',
      },
      {
        // Back to where it now lives: the Feed, at the top, where a new post
        // of yours comes first — there is no post screen to land on any more.
        // One only you can see is in no feed, so it goes to your profile
        // instead: the Work tab of the Dashboard.
        onSuccess: () => {
          allowLeave();
          if (visibility === 'private') goToTab('/?tab=work');
          else goToTab('/(app)/(tabs)/feed');
        },
        onError: (error) => failed(error, 'showcase'),
      },
    );
  };

  const save = () => {
    if (!existing || !canSave) return;
    setFaulty(null);
    setNotice(null);
    const wasLive = status === 'live';
    update
      .mutateAsync({
        id: existing.id,
        body: {
          // Only when they changed: sending them rewrites every piece and
          // queues its renditions again.
          ...(piecesChanged ? { fileKeys: picked } : {}),
          // Empty strings rather than undefined — that is how the API is told
          // to clear a field.
          title: title.trim(),
          caption: caption.trim(),
          category,
          location: location.trim(),
          craftNote: craftNote.trim(),
          craftTags: tags,
          allowComments,
          showHire,
          // Only when the audience chosen is not the one the post has: an
          // untouched choice sends nothing. Only you is not an audience the
          // API knows; that is the request after this one.
          ...(visibility && visibility !== 'private' && existing.visibility !== visibility
            ? { visibility }
            : {}),
        },
      })
      .then(
        async () => {
          allowLeave();
          // Who sees it is its own request, after the words are safe.
          try {
            if (visibility === 'private' && wasLive) {
              await setPublished.mutateAsync({ id: existing.id, published: false });
            } else if (
              (visibility === 'public' || visibility === 'connections') &&
              (status === 'draft' || status === 'down')
            ) {
              await setPublished.mutateAsync({ id: existing.id, published: true });
            }
          } catch (error) {
            Alert.alert(
              "Saved, but who sees it didn't change",
              profileActionMessage(error, 'setting'),
            );
          }
          router.back();
        },
        (error) => failed(error, 'editShowcase'),
      );
  };

  const before = existing?.pieces.map((piece) => piece.fileKey) ?? [];
  const piecesChanged =
    picked.length !== before.length || picked.some((key, i) => key !== before[i]);
  /*
   * A post from before the rule may mix a film with photographs. Its words
   * can still be edited — its pieces are not sent unless they change — but
   * changed pieces have to follow the rule.
   */
  const legacyMix = editing && !piecesChanged && picked.length > 0 && !canPostTogether(pickedKinds);
  const canSave = canPostTogether(pickedKinds) || legacyMix;
  const full = picked.length >= MAX_SHOWCASE_ITEMS;
  // Tags typed elsewhere are not among the suggestions; they are shown too, so
  // they can be taken off.
  const suggestions = [...TAG_SUGGESTIONS, ...FILM_TAG_SUGGESTIONS];
  const tagChoices = [...tags.filter((tag) => !suggestions.includes(tag)), ...suggestions];
  // The same for a kind of work chosen somewhere that offers others.
  const categoryChoices =
    category && !CATEGORIES.includes(category) ? [category, ...CATEGORIES] : CATEGORIES;

  const filmAlone = hasFilm && picked.length === 1;
  const cover = picked[0];
  const arrangingKey = arranging !== null ? picked[arranging] : undefined;
  // Only you is saved, not posted, and the button says so.
  const saves = editing || visibility === 'private';

  /* Step 1, above the grid: what is chosen, and anything to say about it. */
  const chosen = (
    <>
      <ChosenStrip
        picked={picked}
        stills={stills}
        kinds={kinds}
        about={about}
        faultyKey={faulty?.key}
        onArrange={setArranging}
      />

      {notice && (
        <PickerNotice tone="warning" onDismiss={() => setNotice(null)}>
          <NoticeText>{notice.message}</NoticeText>
          {notice.swap ? (
            <Pressable
              onPress={() => notice.swap && swapTo(notice.swap.key)}
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8 }}
              className="self-start mt-1 active:opacity-60"
            >
              <Text className="text-foreground text-[14px] leading-5 font-semibold underline">
                {notice.swap.label}
              </Text>
            </Pressable>
          ) : null}
        </PickerNotice>
      )}

      {legacyMix && (
        <PickerNotice>
          <NoticeText>
            This post mixes photographs and a film, which a post can no longer do. You can
            still change the words; to change the pieces, keep the photographs or one film.
          </NoticeText>
        </PickerNotice>
      )}

      {faulty && (
        <PickerNotice
          tone="wrong"
          trailing={
            <Pressable
              onPress={() => toggle(faulty.key)}
              accessibilityRole="button"
              className="h-9 px-3 rounded-[10px] bg-destructive items-center justify-center active:opacity-80"
            >
              <Text className="text-[13px] font-semibold" style={{ color: '#FFFFFF' }}>Take it out</Text>
            </Pressable>
          }
        >
          <NoticeText>{faulty.message}</NoticeText>
        </PickerNotice>
      )}

      {full && (
        <PickerNotice>
          <NoticeText>That is all {MAX_SHOWCASE_ITEMS}. Take one out to swap it.</NoticeText>
        </PickerNotice>
      )}
    </>
  );

  return (
    <InsetFrame>
      <FormHeader
        title={editing ? 'Edit showcase' : 'New showcase'}
        subtitle={step === 1 ? 'Step 1 of 2 · the work' : 'Step 2 of 2 · the words'}
        // From the words the X goes back to the work; from the work it
        // leaves, and the discard guard asks first.
        onClose={step === 2 ? () => setStep(1) : undefined}
      />

      <KeyboardFrame>
        {step === 1 ? (
          <>
            <WorkPicker
              header={chosen}
              albums={albums}
              albumId={albumId}
              onAlbum={setAlbumId}
              files={available}
              state={files.isLoading ? 'loading' : files.isError || files.isPaused ? 'failed' : 'ready'}
              hasMore={Boolean(files.hasNextPage)}
              loadingMore={files.isFetchingNextPage}
              onMore={() => void files.fetchNextPage()}
              onRetry={() => files.refetch()}
              onUpload={() => router.push('/albums/upload')}
              picked={picked}
              hasFilm={hasFilm}
              filmAlone={FILM_ALONE}
              noMixing={NO_MIXING}
              onToggle={(file, still, kind) =>
                toggle(file.key, still, kind, {
                  name: file.mediaTitle || file.originalName || undefined,
                  album: albums.find((album) => album.id === file.albumId)?.name,
                  durationMs: file.durationMs,
                })
              }
            />
            <FormFooter
              label="Next"
              onPress={() => setStep(2)}
              disabled={picked.length === 0}
              note={
                picked.length === 0
                  ? `Up to ${MAX_SHOWCASE_ITEMS} photographs, or one film on its own`
                  : undefined
              }
            />
          </>
        ) : (
          <>
            <KeyboardScroll
              className="flex-1"
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 24 }}
            >
              {/* The work, in one row, and the way back to it. */}
              <View className="flex-row items-center gap-3 p-2.5 rounded-[20px] border border-border/40 bg-card">
                <View className="bg-muted" style={{ width: 56, height: 56, borderRadius: 12, overflow: 'hidden' }}>
                  {cover && stills[cover] ? (
                    <RemoteImage source={{ uri: stills[cover] }} style={{ flex: 1 }} />
                  ) : cover && kinds[cover] === 'video' ? (
                    <View className="flex-1 items-center justify-center bg-secondary">
                      <VideoThumbnail size={34} />
                    </View>
                  ) : null}
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-foreground text-[15px] leading-5 font-semibold">
                    {filmAlone
                      ? 'One film'
                      : hasFilm
                        ? `${picked.length} pieces`
                        : picked.length === 1
                          ? '1 photograph'
                          : `${picked.length} photographs`}
                  </Text>
                  {filmAlone ? null : (
                    <Text className="text-muted-foreground text-[13px] leading-[18px]">
                      The cover is number 1
                    </Text>
                  )}
                </View>
                <Pressable
                  onPress={() => setStep(1)}
                  accessibilityRole="button"
                  accessibilityLabel="Change the work"
                  hitSlop={10}
                  className="px-2 active:opacity-60"
                >
                  <Text className="text-primary text-[15px] font-semibold">Change</Text>
                </Pressable>
              </View>

              <FormField label="Title">
                <FormInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Ten minutes before the rain"
                  maxLength={120}
                  accessibilityLabel="Title"
                />
              </FormField>

              <View className="gap-2">
                <View className="flex-row items-baseline justify-between">
                  <FormLabel optional>Caption</FormLabel>
                  <Count used={caption.length} of="2,200" />
                </View>
                <FormInput
                  value={caption}
                  onChangeText={setCaption}
                  placeholder="Where it was, who it was for"
                  multiline
                  minHeight={118}
                  maxLength={2200}
                  accessibilityLabel="Caption"
                />
              </View>

              <View className="gap-2">
                <FormLabel optional>What kind of work</FormLabel>
                <ChoiceChips>
                  {categoryChoices.map((kind) => (
                    <ChoiceChip
                      key={kind}
                      label={kind}
                      selected={category === kind}
                      // The chosen one again takes it off: it is optional.
                      onPress={() => setCategory(category === kind ? '' : kind)}
                    />
                  ))}
                </ChoiceChips>
              </View>

              <FormField label="Where" optional>
                <FormInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder="Sirao Garden, Cebu"
                  maxLength={120}
                  accessibilityLabel="Where"
                  lead={<MapPinIcon size={18} className="text-muted-foreground" />}
                />
              </FormField>

              <CraftSection
                note={craftNote}
                onNote={setCraftNote}
                tags={tags}
                choices={tagChoices}
                maxTags={MAX_CRAFT_TAGS}
                maxTagLength={MAX_TAG_LENGTH}
                onToggleTag={toggleTag}
                draft={tagDraft}
                onDraft={setTagDraft}
                onAddDraft={addTypedTag}
              />

              <FormSection title="Who sees it">
                {status === 'removed' ? (
                  <FormHint>
                    Virgo took this post down, so only you can see it. Contact support if you
                    think that was a mistake.
                  </FormHint>
                ) : (
                  <AudienceCard value={visibility} onChange={setVisibility} />
                )}
              </FormSection>

              <FormSection title="On the post">
                <FormCard>
                  {/* allow_comments has been a column since showcases shipped
                      with nothing able to set it. This is the switch it was
                      describing. */}
                  <FormSwitchRow
                    label="Comments"
                    value={allowComments}
                    onValueChange={setAllowComments}
                    first
                  />
                  <FormSwitchRow label="Hire button" value={showHire} onValueChange={setShowHire} />
                </FormCard>
                <FormHint>
                  You can turn comments off later. Nothing said is deleted. The Hire button is
                  for people who want to book you.
                </FormHint>
              </FormSection>
            </KeyboardScroll>

            <FormFooter
              label={saves ? (busy ? 'Saving…' : 'Save') : busy ? 'Posting…' : 'Post'}
              onPress={editing ? save : post}
              disabled={editing ? !canSave : !canPostTogether(pickedKinds)}
              busy={busy}
              note={
                !editing && visibility === 'public'
                  ? 'It goes into the feed and onto your profile'
                  : undefined
              }
            />
          </>
        )}
      </KeyboardFrame>

      <ArrangeSheet
        index={arranging}
        count={picked.length}
        still={arrangingKey ? stills[arrangingKey] : undefined}
        kind={arrangingKey ? kinds[arrangingKey] : undefined}
        about={arrangingKey ? about[arrangingKey] : undefined}
        onCover={() => {
          if (arranging !== null) move(arranging, 0);
          setArranging(null);
        }}
        onEarlier={() => {
          if (arranging === null) return;
          move(arranging, arranging - 1);
          setArranging(arranging - 1);
        }}
        onLater={() => {
          if (arranging === null) return;
          move(arranging, arranging + 1);
          setArranging(arranging + 1);
        }}
        onRemove={() => {
          if (arrangingKey) toggle(arrangingKey);
          setArranging(null);
        }}
        onClose={() => setArranging(null)}
      />
    </InsetFrame>
  );
}
