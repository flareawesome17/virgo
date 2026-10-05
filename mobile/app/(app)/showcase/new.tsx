import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  PlayIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { FormHeader } from '@/components/FormHeader';
import { cssInterop } from 'nativewind';
import { RemoteImage } from '@/components/RemoteImage';
import { LoadFailed } from '@/components/LoadFailed';
import { DetailFallback } from '@/components/DetailFallback';
import {
  albumFilesQueryKey,
  kindOf,
  useAlbums,
  useShowcase,
  useShowcaseActions,
  useTheme,
} from '@/src/hooks';
import { clock } from '@/src/lib/media-grid';
import {
  MAX_CRAFT_TAGS,
  MAX_SHOWCASE_ITEMS,
  storageApi,
  type Showcase,
  type StoredFile,
} from '@/src/api';
import { faultyPiece, profileActionMessage } from '@/src/lib/profile-media';
import { PALETTES } from '@/theme';

for (const Icon of [
  AlertCircleIcon, ArrowLeftIcon, ArrowRightIcon, CheckIcon, PlayIcon, PlusIcon, StarIcon, Trash2Icon, XIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

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
const GRID_GAP = 6;

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
 * The craft note has its own place rather than being folded into the caption,
 * because it is the thing the feed exists for: a caption says what this is, and
 * the note says what somebody else could do with it.
 *
 * The library is a three-column list of thumbnails, virtualised. It was every
 * file drawn at once, from its full-size original.
 */
function ShowcaseForm({ existing }: { existing?: Showcase }) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { width } = useWindowDimensions();
  const { create, update } = useShowcaseActions();
  const editing = Boolean(existing);
  const busy = create.isPending || update.isPending;

  const [picked, setPicked] = useState<string[]>(
    () => existing?.pieces.map((piece) => piece.fileKey) ?? [],
  );
  const [title, setTitle] = useState(existing?.title ?? '');
  const [caption, setCaption] = useState(existing?.caption ?? '');
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
  // A still for everything chosen, whichever album it was picked from — the
  // grid only holds the album on screen.
  const [stills, setStills] = useState<Record<string, string>>(() =>
    Object.fromEntries(existing?.pieces.map((piece) => [piece.fileKey, piece.url]) ?? []),
  );

  /*
   * Everything, a page at a time, or one album.
   *
   * The key is the album screens' own, so a page already loaded there is not
   * fetched twice.
   */
  const [albumId, setAlbumId] = useState<string | undefined>(undefined);
  const { albums } = useAlbums({ orderBy: 'created_at', direction: 'desc', limit: 100 });
  const files = useInfiniteQuery({
    queryKey: albumFilesQueryKey(albumId),
    queryFn: ({ pageParam }) => storageApi.listFiles({ albumId, cursor: pageParam, limit: 100 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  /**
   * What can go in: photographs, and films that have a poster frame.
   *
   * A film's poster is written by the media worker a minute or so after the
   * upload, and the server refuses a film without one. Leaving those out of
   * the grid is the same rule stated before it is broken rather than after.
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

  /** A tile's still: the thumbnail, never the original. */
  const stillOf = (file: StoredFile): string | undefined =>
    (kindOf(file.contentType) === 'video' ? file.posterUrl : (file.thumbnailUrl ?? file.url)) ??
    undefined;

  const toggle = (key: string, still?: string) => {
    if (still) setStills((current) => ({ ...current, [key]: still }));
    if (faulty?.key === key) setFaulty(null);
    setPicked((current) =>
      current.includes(key)
        ? current.filter((k) => k !== key)
        : current.length >= MAX_SHOWCASE_ITEMS
          ? current
          : [...current, key],
    );
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
   */
  const failed = (error: unknown, action: 'showcase' | 'editShowcase') => {
    const message = profileActionMessage(error, action);
    const key = faultyPiece(error);
    if (key && picked.includes(key)) {
      setFaulty({ key, message });
      return;
    }
    Alert.alert(action === 'showcase' ? "Couldn't post that" : "Couldn't save that", message);
  };

  const post = () => {
    if (picked.length === 0) return;
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
        publish: true,
      },
      {
        // To the post itself, in place of this form: after Post you were put
        // back on the Feed to look for it. replace() keeps the stack as it
        // was under the form, so Back from the post goes where you came from.
        onSuccess: (created) => router.replace(`/showcase/${created.id}`),
        onError: (error) => failed(error, 'showcase'),
      },
    );
  };

  const save = () => {
    if (!existing || picked.length === 0) return;
    setFaulty(null);
    const before = existing.pieces.map((piece) => piece.fileKey);
    const piecesChanged =
      picked.length !== before.length || picked.some((key, i) => key !== before[i]);
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
          craftNote: craftNote.trim(),
          craftTags: tags,
          allowComments,
          showHire,
        },
      })
      .then(
        () => router.back(),
        (error) => failed(error, 'editShowcase'),
      );
  };

  const full = picked.length >= MAX_SHOWCASE_ITEMS;
  // Tags typed elsewhere are not among the suggestions; they are shown too, so
  // they can be taken off.
  const suggestions = [...TAG_SUGGESTIONS, ...FILM_TAG_SUGGESTIONS];
  const tagChoices = [...tags.filter((tag) => !suggestions.includes(tag)), ...suggestions];
  const tile = Math.floor((width - 40 - GRID_GAP * 2) / 3);

  const header = (
    <>
      <View className="px-5 pt-4">
        <Text className="text-primary text-[11px] font-bold tracking-[1.5px]">THE WORK</Text>
        <Text className="text-muted-foreground text-[12px] mt-1">
          {picked.length}/{MAX_SHOWCASE_ITEMS} chosen
          {picked.length > 1 ? ' · the first is the cover. Tap one to move it.' : ''}
        </Text>
      </View>

      {/* What is chosen, in order — including anything picked in another
          album, which the grid below no longer shows. Tap one to make it the
          cover, move it, or take it out: changing the cover meant taking
          everything out and picking again in a new order. */}
      {picked.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingTop: 10 }}
        >
          {picked.map((key, i) => {
            const bad = faulty?.key === key;
            return (
              <Pressable
                key={key}
                onPress={() => setArranging(i)}
                accessibilityRole="button"
                accessibilityLabel={`Chosen, number ${i + 1}${i === 0 ? ', the cover' : ''}${bad ? ', cannot be posted' : ''}. Arrange.`}
                className="bg-muted active:opacity-80"
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 10,
                  overflow: 'hidden',
                  borderWidth: 2,
                  borderColor: bad ? palette.destructive : 'transparent',
                }}
              >
                {stills[key] ? <RemoteImage source={{ uri: stills[key] }} style={{ flex: 1 }} /> : null}
                <View className="absolute right-1 top-1 w-5 h-5 rounded-full bg-action items-center justify-center">
                  <Text className="text-action-foreground text-[10px] font-bold">{i + 1}</Text>
                </View>
                {bad && (
                  <View className="absolute left-1 top-1 w-5 h-5 rounded-full bg-destructive items-center justify-center">
                    <AlertCircleIcon size={12} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {faulty && (
        <View className="mx-5 mt-3 rounded-xl bg-destructive/10 p-3 flex-row items-start gap-2.5">
          <AlertCircleIcon size={16} className="text-destructive" />
          <Text className="flex-1 text-foreground text-[13px] leading-5">{faulty.message}</Text>
          <Pressable
            onPress={() => toggle(faulty.key)}
            accessibilityRole="button"
            className="min-h-[36px] px-3 rounded-lg bg-destructive items-center justify-center active:opacity-80"
          >
            <Text className="text-[12px] font-bold" style={{ color: '#FFFFFF' }}>Take it out</Text>
          </Pressable>
        </View>
      )}

      {/* Where to look. What is chosen stays chosen across albums. */}
      {albums.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingTop: 12 }}
        >
          {[{ id: undefined, name: 'All uploads' }, ...albums].map((album) => {
            const on = album.id === albumId;
            return (
              <Pressable
                key={album.id ?? 'all'}
                onPress={() => setAlbumId(album.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                hitSlop={{ top: 4, bottom: 4 }}
                className={`min-h-9 px-3.5 rounded-full items-center justify-center ${on ? 'bg-action' : 'bg-secondary'}`}
              >
                <Text
                  numberOfLines={1}
                  className={`text-[12px] font-bold ${on ? 'text-action-foreground' : 'text-secondary-foreground'}`}
                  style={{ maxWidth: 160 }}
                >
                  {album.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {full && (
        <Text className="text-warning text-[12px] px-5 pt-2">
          That is all {MAX_SHOWCASE_ITEMS}. Take one out to swap it.
        </Text>
      )}
      <View style={{ height: 12 }} />
    </>
  );

  const footer = (
    <>
      {files.hasNextPage && (
        <Pressable
          onPress={() => void files.fetchNextPage()}
          disabled={files.isFetchingNextPage}
          accessibilityRole="button"
          className="mx-5 mt-3 min-h-11 rounded-xl bg-secondary items-center justify-center active:opacity-80"
        >
          {files.isFetchingNextPage ? (
            <ActivityIndicator color={palette.primary} />
          ) : (
            <Text className="text-secondary-foreground text-[13px] font-bold">Show more</Text>
          )}
        </Pressable>
      )}

      <View className="px-5 pt-6">
        <Text className="text-primary text-[11px] font-bold tracking-[1.5px]">TITLE</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Ten minutes before the rain"
          placeholderTextColor={palette.mutedForeground}
          maxLength={120}
          accessibilityLabel="Title"
          className="bg-card rounded-xl px-4 min-h-12 mt-2 text-foreground text-[14px] font-semibold"
        />

        <Text className="text-primary text-[11px] font-bold tracking-[1.5px] mt-5">CAPTION</Text>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Where it was, who it was for"
          placeholderTextColor={palette.mutedForeground}
          multiline
          maxLength={2200}
          accessibilityLabel="Caption"
          className="bg-card rounded-xl px-4 py-3 min-h-20 mt-2 text-foreground text-[13.5px] leading-5"
          style={{ textAlignVertical: 'top' }}
        />
      </View>

      {/* The field the whole feed is for. */}
      <View className="mx-5 mt-6 rounded-2xl border border-primary/40 bg-primary/5 p-4">
        <Text className="text-primary text-[11px] font-bold tracking-[1.5px]">HOW IT WAS MADE</Text>
        <Text className="text-muted-foreground text-[12px] leading-4 mt-1.5">
          One thing another photographer could use. This is what turns a scroll into
          something worth keeping.
        </Text>
        <TextInput
          value={craftNote}
          onChangeText={setCraftNote}
          placeholder="Backlit into the storm front so the rain read as light, not weather."
          placeholderTextColor={palette.mutedForeground}
          multiline
          maxLength={600}
          accessibilityLabel="How it was made"
          className="bg-card rounded-xl px-4 py-3 min-h-20 mt-3 text-foreground text-[13.5px] leading-5"
          style={{ textAlignVertical: 'top' }}
        />

        <Text className="text-muted-foreground text-[12px] mt-3">
          Tags · {tags.length}/{MAX_CRAFT_TAGS}
        </Text>
        <View className="flex-row flex-wrap gap-1.5 mt-2">
          {tagChoices.map((tag) => {
            const on = tags.includes(tag);
            return (
              <Pressable
                key={tag}
                onPress={() => toggleTag(tag)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                hitSlop={{ top: 4, bottom: 4 }}
                className={`min-h-9 px-3 rounded-full items-center justify-center flex-row gap-1.5 ${on ? 'bg-action' : 'bg-card border border-border'}`}
              >
                {on && <CheckIcon size={11} className="text-action-foreground" />}
                <Text
                  className={`text-[12px] font-semibold ${on ? 'text-action-foreground' : 'text-secondary-foreground'}`}
                >
                  {tag}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {/* Your own, for what none of the suggestions say. */}
        <View className="flex-row items-center gap-2 mt-3">
          <TextInput
            value={tagDraft}
            onChangeText={setTagDraft}
            placeholder="Add your own tag"
            placeholderTextColor={palette.mutedForeground}
            maxLength={MAX_TAG_LENGTH}
            returnKeyType="done"
            onSubmitEditing={addTypedTag}
            editable={tags.length < MAX_CRAFT_TAGS}
            accessibilityLabel="Add your own tag"
            className="flex-1 bg-card rounded-xl px-4 min-h-11 text-foreground text-[13px]"
          />
          <Pressable
            onPress={addTypedTag}
            disabled={!tagDraft.trim() || tags.length >= MAX_CRAFT_TAGS}
            accessibilityRole="button"
            accessibilityLabel="Add this tag"
            className="w-11 h-11 rounded-xl bg-action items-center justify-center active:opacity-80"
            style={{ opacity: !tagDraft.trim() || tags.length >= MAX_CRAFT_TAGS ? 0.45 : 1 }}
          >
            <PlusIcon size={18} className="text-action-foreground" />
          </Pressable>
        </View>

        <Text className="text-muted-foreground text-[11px] leading-[15px] mt-3">
          Typed by you, never read off the file — what your camera recorded about where
          you were stays private.
        </Text>
      </View>

      <View className="mx-5 mt-5 mb-2 rounded-2xl border border-border overflow-hidden">
        {/* allow_comments has been a column since showcases shipped with
            nothing able to set it. This is the switch it was describing. */}
        <View className="min-h-[52px] flex-row items-center gap-3 px-4 py-2.5 border-b border-border">
          <View className="flex-1">
            <Text className="text-foreground text-[14px] font-semibold">Comments</Text>
            <Text className="text-muted-foreground text-[12px] leading-4 mt-0.5">
              You can turn them off later. Nothing said is deleted — it stops being
              shown, and comes back if you turn them on again.
            </Text>
          </View>
          <Switch
            value={allowComments}
            onValueChange={setAllowComments}
            accessibilityLabel="Allow comments on this showcase"
          />
        </View>
        <View className="min-h-[52px] flex-row items-center gap-3 px-4 py-2.5">
          <View className="flex-1">
            <Text className="text-foreground text-[14px] font-semibold">Show Hire</Text>
            <Text className="text-muted-foreground text-[12px] leading-4 mt-0.5">
              A Hire button on this post, for people who want to book you.
            </Text>
          </View>
          <Switch
            value={showHire}
            onValueChange={setShowHire}
            accessibilityLabel="Show a Hire button on this showcase"
          />
        </View>
      </View>
      <View style={{ height: 40 }} />
    </>
  );

  const arrangingKey = arranging !== null ? picked[arranging] : undefined;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <FormHeader
        title={editing ? 'Edit showcase' : 'New showcase'}
        action={{
          label: editing
            ? update.isPending ? 'Saving…' : 'Save'
            : create.isPending ? 'Posting…' : 'Post',
          onPress: editing ? save : post,
          disabled: picked.length === 0,
          busy,
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <FlatList
          data={files.isLoading || files.isError || files.isPaused ? [] : available}
          keyExtractor={(file) => file.key}
          numColumns={3}
          columnWrapperStyle={{ gap: GRID_GAP, paddingHorizontal: 20 }}
          contentContainerStyle={{ gap: GRID_GAP }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          initialNumToRender={18}
          windowSize={7}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          ListEmptyComponent={
            files.isLoading ? (
              <View className="py-10 items-center">
                <ActivityIndicator color={palette.primary} />
              </View>
            ) : files.isError || files.isPaused ? (
              <View className="px-5">
                <LoadFailed what="your work" onRetry={() => files.refetch()} compact />
              </View>
            ) : albumId ? (
              <Text className="px-8 pt-4 text-muted-foreground text-[13px] text-center leading-5">
                Nothing in this album can be posted yet. Photographs show here once they are
                uploaded, and films once their preview is ready.
              </Text>
            ) : (
              <View className="px-8 pt-4 items-center gap-4">
                <Text className="text-muted-foreground text-[13px] text-center leading-5">
                  Your photographs and films live in albums, and there are none here yet.
                  Upload some first and they will show up here.
                </Text>
                <Pressable
                  onPress={() => router.push('/albums/upload')}
                  accessibilityRole="button"
                  className="min-h-11 bg-action rounded-xl px-5 items-center justify-center"
                >
                  <Text className="text-action-foreground text-[13px] font-bold">Upload</Text>
                </Pressable>
              </View>
            )
          }
          renderItem={({ item: file }) => {
            const at = picked.indexOf(file.key);
            const on = at >= 0;
            const film = kindOf(file.contentType) === 'video';
            const still = stillOf(file);
            return (
              <Pressable
                onPress={() => toggle(file.key, still)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={
                  on
                    ? `Chosen, number ${at + 1}. Remove.`
                    : film
                      ? 'Choose this film'
                      : 'Choose this photograph'
                }
                style={{
                  width: tile,
                  height: tile,
                  borderRadius: 10,
                  overflow: 'hidden',
                  borderWidth: 2,
                  borderColor: on ? palette.primary : 'transparent',
                }}
                className="bg-muted active:opacity-80"
              >
                {still ? (
                  <RemoteImage source={{ uri: still }} style={{ flex: 1 }} recyclingKey={file.key} />
                ) : null}
                {film && (
                  <>
                    <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
                      <View
                        className="w-9 h-9 rounded-full items-center justify-center"
                        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
                      >
                        <PlayIcon size={15} color="#fff" fill="#fff" />
                      </View>
                    </View>
                    {file.durationMs ? (
                      <View
                        className="absolute right-1.5 bottom-1.5 rounded-full px-1.5 py-0.5"
                        style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
                      >
                        <Text className="text-[10px] font-bold" style={{ color: '#FFFFFF' }}>
                          {clock(file.durationMs / 1000)}
                        </Text>
                      </View>
                    ) : null}
                  </>
                )}
                {on && (
                  <View className="absolute right-1.5 top-1.5 w-6 h-6 rounded-full bg-action items-center justify-center">
                    <Text className="text-action-foreground text-[11px] font-bold">{at + 1}</Text>
                  </View>
                )}
                {at === 0 && (
                  <View className="absolute left-1.5 bottom-1.5 rounded-full bg-action px-2 py-0.5">
                    <Text className="text-action-foreground text-[10px] font-bold">Cover</Text>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      </KeyboardAvoidingView>

      {/* Arranging one chosen piece. A sheet, not an alert: Android shows an
          alert's first three buttons and drops the rest. */}
      <BottomSheet visible={arranging !== null} onClose={() => setArranging(null)}>
        <View className="px-5 pt-2 pb-5">
          <Text className="text-foreground text-[17px] font-semibold mb-2">
            {arranging === 0 ? 'The cover' : `Number ${(arranging ?? 0) + 1}`}
          </Text>
          {arranging !== null && arranging > 0 && (
            <ArrangeRow
              icon={StarIcon}
              label="Make it the cover"
              onPress={() => {
                move(arranging, 0);
                setArranging(null);
              }}
            />
          )}
          {arranging !== null && arranging > 0 && (
            <ArrangeRow
              icon={ArrowLeftIcon}
              label="Move earlier"
              onPress={() => {
                move(arranging, arranging - 1);
                setArranging(arranging - 1);
              }}
            />
          )}
          {arranging !== null && arranging < picked.length - 1 && (
            <ArrangeRow
              icon={ArrowRightIcon}
              label="Move later"
              onPress={() => {
                move(arranging, arranging + 1);
                setArranging(arranging + 1);
              }}
            />
          )}
          <ArrangeRow
            icon={Trash2Icon}
            label="Take it out"
            destructive
            onPress={() => {
              if (arrangingKey) toggle(arrangingKey);
              setArranging(null);
            }}
          />
          <Pressable
            onPress={() => setArranging(null)}
            accessibilityRole="button"
            className="mt-3 bg-muted rounded-2xl min-h-[48px] items-center justify-center active:scale-[0.98]"
          >
            <Text className="text-foreground text-base font-semibold">Done</Text>
          </Pressable>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

function ArrangeRow({
  icon: Icon,
  label,
  onPress,
  destructive,
}: {
  icon: typeof StarIcon;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="min-h-[52px] flex-row items-center gap-3 border-b border-border active:opacity-60"
    >
      <Icon size={18} className={destructive ? 'text-destructive' : 'text-foreground'} />
      <Text className={`text-base ${destructive ? 'text-destructive' : 'text-foreground'}`}>{label}</Text>
    </Pressable>
  );
}
