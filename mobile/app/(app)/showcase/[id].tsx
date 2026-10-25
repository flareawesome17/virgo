import { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, type ErrorBoundaryProps } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { goToTab } from '@/src/lib/navigation';
import {
  ArrowLeftIcon,
  BookmarkIcon,
  EllipsisIcon,
  HeartIcon,
  MapPinIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { RemoteImage } from '@/components/RemoteImage';
import { ShowcaseFilm } from '@/components/ShowcaseFilm';
import { CommentThread } from '@/components/CommentThread';
import { useShowcaseCardHost } from '@/components/ShowcaseCardHost';
import { PressablePiece, naturalAspect } from '@/components/ShowcaseMedia';
import { ShowcaseViewer } from '@/components/ShowcaseViewer';
import { DetailFallback } from '@/components/DetailFallback';
import { useAuth, useLike, useShowcase, useTheme } from '@/src/hooks';
import { makerOf, showcaseStatus } from '@/src/api';
import { PALETTES } from '@/theme';

for (const Icon of [ArrowLeftIcon, BookmarkIcon, EllipsisIcon, HeartIcon, MapPinIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * What this screen does instead of taking the app down with it.
 *
 * expo-router renders this in place of the route when its tree throws. Without
 * it a render error here is fatal to the whole app, which is what opening a
 * showcase was doing — and a release build says nothing on the way out, so the
 * one fact that would have identified it never reached anybody.
 *
 * The house rule is not to show people raw error text, and this is the one
 * place it earns its keep: the alternative is not a gentler message, it is the
 * app disappearing. So the plain sentence comes first and the technical line
 * sits under it, marked as something to send on rather than something to read.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background px-8 justify-center">
      <Text className="text-foreground text-[17px] font-bold">This showcase would not open</Text>
      <Text className="text-muted-foreground text-[13px] leading-5 mt-2">
        Something went wrong drawing it. Nothing is lost — the post is still there, and
        everything else in the app still works.
      </Text>

      <View className="mt-5 rounded-xl bg-card p-4">
        <Text className="text-primary text-[10px] font-bold tracking-[1.5px]">
          WHAT WENT WRONG
        </Text>
        <Text className="text-muted-foreground text-[12px] leading-[18px] mt-2" selectable>
          {error.message || 'No message'}
        </Text>
      </View>

      <View className="flex-row gap-2.5 mt-6">
        <Pressable
          onPress={() => void retry()}
          accessibilityRole="button"
          className="flex-1 min-h-11 rounded-xl bg-action items-center justify-center active:opacity-90"
        >
          <Text className="text-action-foreground text-[13px] font-bold">Try again</Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          className="flex-1 min-h-11 rounded-xl border border-border items-center justify-center active:opacity-70"
        >
          <Text className="text-foreground text-[13px] font-bold">Go back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

/**
 * How tall a piece may be on the post, against its width. Anything taller —
 * a phone's 9:16 frame — is shown whole inside that, not cropped, so the
 * page is not one photograph long.
 */
const TALLEST = 1.6;

/** How much of a film must be on screen for it to keep playing. */
const FILM_VISIBLE = 0.3;

/**
 * One showcase, whole, on a screen of its own.
 *
 * Nothing in the app opens this any more — the feed, shelves and profiles show
 * a post as a card and in a sheet — but links still do: a notification, a
 * deep link, the composer once something is posted. So it stays, with every
 * piece stacked at its own shape and a tap to look closely, and its ⋯ is the
 * same sheet the cards use, so a post offers the same things wherever it is.
 */
export default function ShowcaseScreen() {
  // The one film allowed to be playing; a set can hold several.
  const [playing, setPlaying] = useState<string | null>(null);
  // Another screen pushed over this one (a profile, the report sheet's
  // destination) must not leave a film talking behind it.
  const focused = useIsFocused();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { showcase, error, loadFailed, refetch } = useShowcase(id);
  const { user } = useAuth();
  const like = useLike(id);
  // Share, edit, private or public, delete, report, keep: the cards' own.
  const host = useShowcaseCardHost({ onRemoved: () => router.back() });
  const [viewing, setViewing] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  /*
   * Which films are on screen, so one scrolled past stops. A film on a post
   * played on — sound and all — with its controls far above, because only
   * focus was ever asked.
   */
  const filmFrames = useRef(new Map<string, { y: number; h: number }>());
  const viewport = useRef({ y: 0, h: 0 });
  const [onScreen, setOnScreen] = useState<Set<string>>(new Set());
  const measureFilms = useCallback(() => {
    const { y, h } = viewport.current;
    if (h === 0) return;
    const next = new Set<string>();
    filmFrames.current.forEach((frame, key) => {
      const visible = Math.min(y + h, frame.y + frame.h) - Math.max(y, frame.y);
      if (visible / frame.h >= FILM_VISIBLE) next.add(key);
    });
    setOnScreen((current) =>
      current.size === next.size && [...next].every((k) => current.has(k)) ? current : next,
    );
  }, []);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      viewport.current = {
        y: e.nativeEvent.contentOffset.y,
        h: e.nativeEvent.layoutMeasurement.height,
      };
      measureFilms();
    },
    [measureFilms],
  );
  const mine = Boolean(showcase && user && showcase.userId === user.id);
  // Never read straight off the payload: see makerOf.
  const maker = makerOf(showcase);
  // Only ever not 'live' for the owner: nobody else is sent anything else.
  const status = showcase ? showcaseStatus(showcase) : 'live';

  const openMaker = () => {
    // Your own avatar goes to your own profile — the Dashboard's Work tab —
    // which needs no published handle; somebody else's only has somewhere to
    // go if they published one.
    if (mine) goToTab('/?tab=work');
    else if (maker.handle) router.push(`/u/${maker.handle}`);
  };
  const { width } = useWindowDimensions();

  // Gone is not offline. A post taken down or deleted used to say "check your
  // connection", with a Retry that could only ever fail again.
  if (!showcase) {
    return (
      <DetailFallback
        title="Showcase"
        what="this showcase"
        gone="The person who posted it took it down or deleted it."
        error={error}
        failed={loadFailed}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="flex-row items-center pl-1 pr-3 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="w-11 h-11 items-center justify-center"
        >
          <ArrowLeftIcon size={20} className="text-foreground" />
        </Pressable>
        <Text className="flex-1 text-foreground text-[15px] font-bold" numberOfLines={1}>
          {showcase.title ?? 'Showcase'}
        </Text>
        <Pressable
          onPress={() => host.actions.options(showcase, mine)}
          accessibilityRole="button"
          accessibilityLabel="More options for this post"
          className="w-11 h-11 items-center justify-center active:opacity-70"
        >
          <EllipsisIcon size={19} className="text-muted-foreground" />
        </Pressable>
      </View>

      {/* Padding on iOS, where nothing else moves the comment box out from
          under the keyboard; Android resizes the window itself. */}
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={100}
          onLayout={(e: LayoutChangeEvent) => {
            viewport.current = { ...viewport.current, h: e.nativeEvent.layout.height };
            measureFilms();
          }}
        >
          {mine && status !== 'live' && (
            <StatusBanner
              status={status}
              pending={host.publishing}
              onRestore={() => void host.makePublic(showcase)}
            />
          )}
          {showcase.pieces.map((piece, i) => {
            // Its own shape, whole. Every piece was drawn 4:5 and cropped to
            // fit, so a landscape photograph lost close to half of itself.
            const aspect = naturalAspect(piece);
            const height = Math.round(Math.min(width / aspect, width * TALLEST));
            return (
              <View
                key={piece.fileKey}
                className={i > 0 ? 'mt-1' : ''}
                onLayout={
                  piece.kind === 'video'
                    ? (e: LayoutChangeEvent) => {
                        filmFrames.current.set(piece.fileKey, {
                          y: e.nativeEvent.layout.y,
                          h: e.nativeEvent.layout.height,
                        });
                        measureFilms();
                      }
                    : undefined
                }
              >
                {piece.kind === 'video' ? (
                  <ShowcaseFilm
                    piece={piece}
                    width={width}
                    height={height}
                    active={
                      focused &&
                      viewing === null &&
                      onScreen.has(piece.fileKey) &&
                      (playing === null || playing === piece.fileKey)
                    }
                    onPlay={() => setPlaying(piece.fileKey)}
                  />
                ) : (
                  <PressablePiece
                    piece={piece}
                    width={width}
                    height={height}
                    contentFit={height < width / aspect - 1 ? 'contain' : 'cover'}
                    onPress={() => setViewing(i)}
                    label={`Piece ${i + 1} of ${showcase.pieces.length}. Open full screen to zoom.`}
                  />
                )}
              </View>
            );
          })}

          {/* Who made it, and what you can do about it. The list form carries
              no maker, so this is the only place a reader can credit them. */}
          <View className="px-3 pt-3 flex-row items-center gap-2">
            <Pressable
              onPress={openMaker}
              disabled={!mine && !maker.handle}
              accessibilityRole="button"
              accessibilityLabel={`${maker.displayName}'s profile`}
              className="flex-1 min-w-0 min-h-[52px] flex-row items-center gap-2.5 px-2 rounded-xl active:opacity-70"
            >
              <View className="w-10 h-10 rounded-full overflow-hidden bg-primary/15 items-center justify-center">
                {maker.avatarUrl ? (
                  <RemoteImage source={{ uri: maker.avatarUrl }} style={{ width: 40, height: 40 }} />
                ) : (
                  <Text className="text-primary text-[15px] font-bold">
                    {maker.displayName.charAt(0).toUpperCase()}
                  </Text>
                )}
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-foreground text-[14px] font-bold" numberOfLines={1}>
                  {maker.displayName}
                </Text>
                {maker.title ? (
                  <Text className="text-muted-foreground text-[12px]" numberOfLines={1}>
                    {maker.title}
                  </Text>
                ) : null}
              </View>
            </Pressable>
            {showcase.showHire && maker.handle && !mine && (
              <Pressable
                onPress={() => router.push(`/hire/${maker.handle}`)}
                accessibilityRole="button"
                accessibilityLabel={`Hire ${maker.displayName}`}
                className="min-h-[44px] px-4 mr-2 rounded-full bg-action items-center justify-center active:opacity-90"
              >
                <Text className="text-action-foreground text-[13px] font-bold">Hire</Text>
              </Pressable>
            )}
          </View>

          <View className="px-5 pt-3 flex-row gap-2.5">
            <Pressable
              onPress={() => like.mutate({ showcaseId: showcase.id, liked: !showcase.likedByMe })}
              accessibilityRole="button"
              accessibilityState={{ selected: showcase.likedByMe }}
              accessibilityLabel={showcase.likedByMe ? 'Liked. Tap to unlike.' : 'Like'}
              className="flex-1 min-h-11 flex-row items-center justify-center gap-2 rounded-xl border border-border active:opacity-70"
            >
              <HeartIcon
                size={16}
                className={showcase.likedByMe ? 'text-destructive' : 'text-muted-foreground'}
                fill={showcase.likedByMe ? palette.destructive : 'none'}
              />
              <Text
                className={`text-[13px] font-bold ${showcase.likedByMe ? 'text-destructive' : 'text-foreground'}`}
              >
                {showcase.likeCount > 0 ? showcase.likeCount : 'Like'}
              </Text>
            </Pressable>
            {/* Keeping your own work is refused by the server, so it is not
                offered here either. */}
            {!mine && (
              <Pressable
                onPress={() => host.actions.keep(showcase)}
                onLongPress={() => host.actions.chooseShelf(showcase)}
                accessibilityRole="button"
                accessibilityLabel={showcase.keptByMe ? 'Kept. Change where.' : 'Keep this'}
                accessibilityState={{ selected: showcase.keptByMe }}
                className={`flex-1 min-h-11 flex-row items-center justify-center gap-2 rounded-xl active:opacity-90 ${showcase.keptByMe ? 'bg-secondary' : 'bg-action'}`}
              >
                <BookmarkIcon
                  size={16}
                  className={showcase.keptByMe ? 'text-primary' : 'text-action-foreground'}
                  fill={showcase.keptByMe ? palette.primary : 'none'}
                />
                <Text
                  className={`text-[13px] font-bold ${showcase.keptByMe ? 'text-primary' : 'text-action-foreground'}`}
                >
                  {showcase.keptByMe ? 'Kept' : 'Keep'}
                </Text>
              </Pressable>
            )}
          </View>

          <View className="px-5 pt-5">
            {/* The title was only in the one-line header, cut short; where it
                was taken was never shown at all. */}
            {showcase.title ? (
              <Text accessibilityRole="header" className="text-foreground text-[20px] font-bold leading-7 mb-1.5">
                {showcase.title}
              </Text>
            ) : null}
            {showcase.location ? (
              <View className="flex-row items-center gap-1.5 mb-3">
                <MapPinIcon size={13} className="text-muted-foreground" />
                <Text className="text-muted-foreground text-[13px]">{showcase.location}</Text>
              </View>
            ) : null}
            {showcase.caption ? (
              <Text className="text-foreground text-[14px] leading-[21px]">
                {showcase.caption}
              </Text>
            ) : null}

            {showcase.craftNote || showcase.craftTags.length > 0 ? (
              <View className="mt-5 pt-4 border-t border-border">
                <Text className="text-primary text-[10px] font-bold tracking-[1.5px]">
                  HOW IT WAS MADE
                </Text>
                {showcase.craftNote ? (
                  <Text className="text-foreground text-[14px] leading-[21px] mt-2">
                    {showcase.craftNote}
                  </Text>
                ) : null}
                {showcase.craftTags.length > 0 && (
                  <View className="flex-row flex-wrap gap-1.5 mt-3">
                    {showcase.craftTags.map((tag) => (
                      <View key={tag} className="rounded-full bg-muted px-3 py-1.5">
                        <Text className="text-secondary-foreground text-[12px] font-semibold">
                          {tag}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
                <Text className="text-muted-foreground text-[11px] leading-4 mt-3">
                  Written by the photographer. Virgo never reads this from the file.
                </Text>
              </View>
            ) : null}

            {showcase.keptCount > 0 && (
              <Text className="text-muted-foreground text-[12px] mt-5">
                Kept by {showcase.keptCount} {showcase.keptCount === 1 ? 'person' : 'people'}
              </Text>
            )}
          </View>

          <CommentThread
            showcaseId={showcase.id}
            isOwner={mine}
            total={showcase.commentCount}
            // The box is the last thing on the page: once the keyboard has
            // taken its share of the screen, bring the box up into what is left.
            onComposerFocus={() =>
              setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250)
            }
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <ShowcaseViewer
        pieces={showcase.pieces}
        startIndex={viewing ?? 0}
        visible={viewing !== null}
        onClose={() => setViewing(null)}
      />
      {host.element}
    </SafeAreaView>
  );
}

/**
 * What the owner is told about a post that is not live. Nobody else ever sees
 * one, so this is the only place its state is said out loud.
 */
function StatusBanner({
  status,
  pending,
  onRestore,
}: {
  status: 'draft' | 'down' | 'removed';
  pending: boolean;
  onRestore: () => void;
}) {
  if (status === 'removed') {
    return (
      <View className="mx-4 my-3 rounded-xl bg-destructive/10 p-4">
        <Text className="text-destructive text-[13px] font-bold">Virgo took this down</Text>
        <Text className="text-foreground text-[12px] leading-[18px] mt-1">
          It was reported and reviewed, and only you can see it now. If you think that was a
          mistake, tell us.
        </Text>
        <Pressable
          onPress={() => router.push('/support')}
          accessibilityRole="link"
          hitSlop={8}
          className="self-start mt-2"
        >
          <Text className="text-primary text-[12px] font-bold">Contact support</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View className="mx-4 my-3 rounded-xl bg-secondary p-4 flex-row items-center gap-3">
      <View className="flex-1">
        <Text className="text-foreground text-[13px] font-bold">Private</Text>
        <Text className="text-muted-foreground text-[12px] leading-[18px] mt-0.5">
          Only you can see it.
        </Text>
      </View>
      <Pressable
        onPress={onRestore}
        disabled={pending}
        accessibilityRole="button"
        className="min-h-10 px-4 rounded-full bg-action items-center justify-center active:opacity-90"
        style={{ opacity: pending ? 0.6 : 1 }}
      >
        <Text className="text-action-foreground text-[12px] font-bold">Make public</Text>
      </Pressable>
    </View>
  );
}
