import { memo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type TextLayoutEventData,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { Href } from 'expo-router';
import {
  BookmarkIcon,
  ChevronDownIcon,
  EllipsisIcon,
  HeartIcon,
  LockIcon,
  MessageCircleIcon,
  Share2Icon,
  ShareIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { RemoteImage } from '@/components/RemoteImage';
import { ShowcaseFilm } from '@/components/ShowcaseFilm';
import { PieceCarousel, PieceImage, feedFrameAspect, fitIn } from '@/components/ShowcaseMedia';
import { useLike, useTheme } from '@/src/hooks';
import {
  makerOf,
  showcaseStatus,
  type FeedItem,
  type ShowcasePiece,
  type ShowcaseStatus,
} from '@/src/api';
import type { FilmTurn } from '@/src/lib/film-turn';
import { postedAgo } from '@/src/lib/posted-time';
import { isShareable } from '@/src/lib/showcase-share';
import { PALETTES } from '@/theme';

for (const Icon of [
  BookmarkIcon, ChevronDownIcon, EllipsisIcon, HeartIcon, LockIcon, MessageCircleIcon, Share2Icon,
  ShareIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** Each platform's own picture for "share": the box and arrow on iOS, the three dots on Android. */
const ShareGlyph = Platform.OS === 'ios' ? ShareIcon : Share2Icon;

/** Two taps on a photograph this close together are a like. */
const DOUBLE_TAP_MS = 300;

/** How many lines of caption a card shows before "more". */
const CAPTION_LINES = 2;
/**
 * Characters given up at the end of the last line shown, so "… more" fits on
 * it rather than being pushed onto a third.
 */
const MORE_ROOM = 10;
/** Where the web preview, which cannot measure lines, cuts a caption. */
const WEB_CAPTION_CUT = 110;

/**
 * What a card asks of the screen it is on. One set per screen rather than per
 * card: the sheets they open are drawn once, by whoever hosts the cards (see
 * useShowcaseCardHost), and a card is only ever told which post to open them
 * for.
 */
export interface ShowcaseCardActions {
  /** The thread, in a sheet. */
  comments: (item: FeedItem) => void;
  /** The ⋯ sheet. `mine` decides what it offers. */
  options: (item: FeedItem, mine: boolean) => void;
  /** A tap on the bookmark: keep to the last shelf, or open the sheet if kept. */
  keep: (item: FeedItem) => void;
  /** A long press on the bookmark: choose the shelf. */
  chooseShelf: (item: FeedItem) => void;
  share: (item: FeedItem, mine: boolean) => void;
  /**
   * Leaves for another screen. A host inside a sheet closes the sheet first —
   * a screen pushed under a sheet is a screen nobody can see.
   */
  go: (href: Href) => void;
}

/** Films never pass through a store when there is no list to hold one. */
const alwaysSubscribed = () => () => undefined;

/**
 * One showcase, the way a feed draws a post: who made it and when, the work at
 * its own shape, what you can do about it, the words, and how it was made.
 *
 * How it was made is what this feed has that a photo app does not, so its tags
 * are on the card and the note is one tap under them. It was a small link
 * beneath the caption. What a thing has been liked or said about is a number
 * beside its own button, not a line of its own.
 *
 * The same card in the feed and in the post sheet a shelf or a profile opens,
 * so a post looks and behaves the same wherever it is met. It never opens a
 * screen for the post itself — everything a post has is on the card or in a
 * sheet over it — and leaves only for a profile or the Hire form.
 */
export const ShowcaseCard = memo(function ShowcaseCard({
  item,
  mine,
  actions,
  filmTurn,
  filmActive = true,
}: {
  item: FeedItem;
  /**
   * Your own post. Your own work is in the feed, and the card offered to keep
   * it, hire you and report you — the first and second refused by the server,
   * the third absurd.
   */
  mine: boolean;
  actions: ShowcaseCardActions;
  /** Whose turn it is to play, in a list; a film that is not on screen stops. */
  filmTurn?: FilmTurn;
  /** Whether the screen the card is on is the one being looked at. */
  filmActive?: boolean;
}) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { width } = useWindowDimensions();
  const like = useLike(item.id);
  // Never read straight off the payload: see makerOf.
  const maker = makerOf(item);
  // Only ever not 'live' for the owner: nobody else is sent anything else.
  const status = mine ? showcaseStatus(item) : 'live';
  const shareable = isShareable(item);
  // The way into a thread whose author turned comments off is gone for
  // everyone but the author, who can still read and tidy it.
  // Absent is open, as the server's default is.
  const commentsOpen = mine || item.allowComments !== false;
  const posted = postedAgo(item.publishedAt ?? item.createdAt);
  const [craftOpen, setCraftOpen] = useState(false);

  const openMaker = () => {
    // Your own profile needs no published handle; anybody else's is only
    // reachable once they have published one.
    if (mine) actions.go('/profile');
    else if (maker.handle) actions.go(`/u/${maker.handle}`);
  };

  const toggleLike = () => like.mutate({ showcaseId: item.id, liked: !item.likedByMe });
  // A double tap only ever likes. Unliking by accident, with a gesture made
  // while looking at the photograph rather than the heart, is not undoable at
  // a glance.
  const likeFromPhoto = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    if (!item.likedByMe) like.mutate({ showcaseId: item.id, liked: true });
  };

  // Who they are, then when: the time used to trail the card in the smallest
  // type on it.
  const subtitle = [maker.title, posted.short].filter(Boolean).join(' · ');
  // What kind of work it is and where, under the title.
  const about = [item.category, item.location].filter(Boolean).join(' · ');
  const hasCraft = Boolean(item.craftNote) || item.craftTags.length > 0;
  const connectionsOnly = item.visibility === 'connections';

  return (
    <View className="pb-7">
      <View className="flex-row items-center pl-3.5 pr-1 min-h-[60px] gap-1">
        <Pressable
          onPress={openMaker}
          disabled={!mine && !maker.handle}
          accessibilityRole="button"
          accessibilityLabel={
            (mine ? 'Your profile' : `${maker.displayName}'s profile`) + (posted.label ? `. ${posted.label}` : '')
          }
          className="flex-1 min-w-0 min-h-[48px] flex-row items-center gap-3 px-1.5 rounded-xl active:opacity-70"
        >
          <View className="w-10 h-10 rounded-full overflow-hidden bg-muted items-center justify-center">
            {maker.avatarUrl ? (
              <RemoteImage source={{ uri: maker.avatarUrl }} style={{ width: 40, height: 40 }} />
            ) : (
              <Text className="text-foreground text-[15px] font-bold">
                {maker.displayName.charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={1}>
              {mine ? 'You' : maker.displayName}
            </Text>
            {subtitle || connectionsOnly ? (
              <View className="flex-row items-center gap-1">
                {connectionsOnly ? <LockIcon size={12} className="text-muted-foreground" /> : null}
                <Text className="flex-1 text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
                  {[connectionsOnly ? 'Connections only' : null, mine ? posted.short : subtitle]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            ) : null}
          </View>
        </Pressable>
        {item.showHire && maker.handle && !mine ? (
          <Pressable
            onPress={() => actions.go(`/hire/${maker.handle}`)}
            accessibilityRole="button"
            accessibilityLabel={`Hire ${maker.displayName}`}
            // 36 pt to look at, 44 pt to touch.
            hitSlop={{ top: 4, bottom: 4 }}
            className="h-9 px-4 rounded-xl bg-action items-center justify-center active:opacity-90"
          >
            <Text className="text-action-foreground text-[14px] font-semibold">Hire</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => actions.options(item, mine)}
          accessibilityRole="button"
          accessibilityLabel="More options for this post"
          className="w-11 h-11 items-center justify-center rounded-full active:opacity-60"
        >
          <EllipsisIcon size={20} className="text-foreground" />
        </Pressable>
      </View>

      <CardMedia
        item={item}
        width={width}
        status={status}
        filmTurn={filmTurn}
        filmActive={filmActive}
        onDoubleTap={likeFromPhoto}
        label={item.title ?? `${maker.displayName}'s showcase`}
      />

      <View className="flex-row items-center pl-2 pr-5 pt-1">
        <CountButton
          onPress={toggleLike}
          selected={item.likedByMe}
          count={item.likeCount}
          label={
            (item.likedByMe ? 'Liked. Tap to unlike.' : 'Like') +
            (item.likeCount > 0 ? ` ${item.likeCount} ${item.likeCount === 1 ? 'like' : 'likes'}.` : '')
          }
        >
          <HeartIcon
            size={24}
            className={item.likedByMe ? 'text-destructive' : 'text-foreground'}
            // A literal colour, not currentColor, which renders hollow on a
            // device. Unfilled is the whole difference between the states.
            fill={item.likedByMe ? palette.destructive : 'none'}
          />
        </CountButton>
        {commentsOpen ? (
          <CountButton
            onPress={() => actions.comments(item)}
            count={item.commentCount}
            label={item.commentCount > 0 ? `Comments, ${item.commentCount}` : 'Comment'}
          >
            <MessageCircleIcon size={23} className="text-foreground" />
          </CountButton>
        ) : null}
        {/* Somebody else's post that has no public link has nothing to share;
            your own still offers it, to say what would make it shareable. */}
        {shareable || (mine && status !== 'removed') ? (
          <CountButton onPress={() => actions.share(item, mine)} count={0} label="Share this post">
            <ShareGlyph size={22} className="text-foreground" />
          </CountButton>
        ) : null}
        <View className="flex-1" />
        {mine ? (
          // Keeping your own work is refused, so there is no Keep on it; how
          // many people kept it is what is worth seeing instead.
          item.keptCount > 0 ? (
            <Text className="text-muted-foreground text-[13px] leading-[18px]">{item.keptCount} kept</Text>
          ) : null
        ) : (
          <Pressable
            onPress={() => actions.keep(item)}
            onLongPress={() => actions.chooseShelf(item)}
            delayLongPress={350}
            accessibilityRole="button"
            accessibilityState={{ selected: item.keptByMe }}
            accessibilityLabel={item.keptByMe ? 'Kept. Change where.' : 'Keep this'}
            accessibilityHint={item.keptByMe ? undefined : 'Long press to choose the shelf'}
            // 36 pt to look at, 44 pt to touch.
            hitSlop={{ top: 4, bottom: 4 }}
            className={`h-9 pl-3 pr-3.5 rounded-xl flex-row items-center gap-1.5 active:opacity-70 ${
              item.keptByMe ? 'bg-foreground' : 'bg-muted'
            }`}
          >
            <BookmarkIcon
              size={16}
              className={item.keptByMe ? 'text-background' : 'text-foreground'}
              // Filled once it is yours, and it says so: an outline that means
              // "kept" and an outline that means "keep" are the same picture.
              fill={item.keptByMe ? palette.background : 'none'}
            />
            <Text className={`text-[14px] font-semibold ${item.keptByMe ? 'text-background' : 'text-foreground'}`}>
              {item.keptByMe ? 'Kept' : 'Keep'}
            </Text>
          </Pressable>
        )}
      </View>

      <View className="px-5 pt-1">
        {item.title ? (
          <Text className="text-foreground text-[17px] leading-6 font-bold" accessibilityRole="header">
            {item.title}
          </Text>
        ) : null}
        {about ? (
          <Text className="text-muted-foreground text-[13px] leading-[18px] mt-0.5" numberOfLines={1}>
            {about}
          </Text>
        ) : null}
        {item.caption ? <Caption text={item.caption} /> : null}

        {hasCraft ? (
          <Pressable
            onPress={item.craftNote ? () => setCraftOpen((open) => !open) : undefined}
            disabled={!item.craftNote}
            accessibilityRole={item.craftNote ? 'button' : undefined}
            accessibilityState={item.craftNote ? { expanded: craftOpen } : undefined}
            accessibilityLabel={`How it was made${item.craftTags.length > 0 ? `: ${item.craftTags.join(', ')}` : ''}`}
            accessibilityHint={item.craftNote && !craftOpen ? 'Shows the note' : undefined}
            className="mt-2.5 rounded-2xl border border-border/40 bg-card px-3.5 py-3 gap-2.5 active:opacity-80"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-muted-foreground text-[13px] leading-[18px] font-semibold">How it was made</Text>
              {item.craftNote ? (
                <View style={{ transform: [{ rotate: craftOpen ? '180deg' : '0deg' }] }}>
                  <ChevronDownIcon size={16} className="text-muted-foreground" />
                </View>
              ) : null}
            </View>
            {item.craftTags.length > 0 ? (
              <View className="flex-row flex-wrap gap-1.5">
                {item.craftTags.map((tag) => (
                  <View key={tag} className="rounded-full bg-muted px-2.5 py-1">
                    <Text className="text-secondary-foreground text-[13px] leading-[18px] font-medium">{tag}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {/* With no tags there is nothing to show closed, so the note is. */}
            {item.craftNote && (craftOpen || item.craftTags.length === 0) ? (
              <Text className="text-secondary-foreground text-[15px] leading-[22px]">{item.craftNote}</Text>
            ) : null}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

/** A thing to do to a post, with how many times it has been done beside it. */
function CountButton({
  onPress,
  label,
  selected,
  count,
  children,
}: {
  onPress: () => void;
  label: string;
  selected?: boolean;
  count: number;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      className="h-11 min-w-[44px] px-2 flex-row items-center justify-center gap-1.5 active:opacity-60"
    >
      {children}
      {count > 0 ? (
        <Text className="text-foreground text-[15px] font-semibold" style={{ fontVariant: ['tabular-nums'] }}>
          {count > 9999 ? `${Math.floor(count / 1000)}k` : count}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * The work: one frame, the cover's shape (see feedFrameAspect), every piece of
 * a set a swipe away and drawn whole inside it.
 *
 * A photograph answers a double tap with a like and a heart that grows into
 * place over it and fades — flat, no bounce: on a phone a heart that springs
 * reads as the picture shaking. A single tap does nothing, so there is
 * no wait to tell the two apart. A film is its own control.
 */
function CardMedia({
  item,
  width,
  status,
  filmTurn,
  filmActive,
  onDoubleTap,
  label,
}: {
  item: FeedItem;
  width: number;
  status: ShowcaseStatus;
  filmTurn?: FilmTurn;
  filmActive: boolean;
  onDoubleTap: () => void;
  label: string;
}) {
  const frame = feedFrameAspect(item.pieces[0]);
  const height = Math.round(width / frame);
  const lastTap = useRef(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(1);
  const heart = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const onPhotoPress = () => {
    const now = Date.now();
    if (now - lastTap.current > DOUBLE_TAP_MS) {
      lastTap.current = now;
      return;
    }
    lastTap.current = 0;
    opacity.value = withSequence(
      withTiming(1, { duration: 110 }),
      withDelay(420, withTiming(0, { duration: 220 })),
    );
    scale.value = withSequence(
      withTiming(0.82, { duration: 0 }),
      withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }),
    );
    onDoubleTap();
  };

  const count = item.pieces.length;
  const privateNote = status === 'removed' ? 'Taken down by Virgo' : status !== 'live' ? 'Private' : null;

  return (
    <PieceCarousel
      pieces={item.pieces}
      width={width}
      height={height}
      renderPage={(piece, index, current) =>
        piece.kind === 'video' ? (
          <CardFilm
            id={item.id}
            piece={piece}
            width={width}
            height={height}
            contentFit={fitIn(piece, frame)}
            filmTurn={filmTurn}
            active={filmActive && current}
          />
        ) : (
          <Pressable
            onPress={onPhotoPress}
            accessibilityRole="image"
            accessibilityLabel={`${label}${count > 1 ? `, ${index + 1} of ${count}` : ''}${privateNote ? `. ${privateNote}` : ''}`}
            // A screen reader's double tap is its own activation, so liking
            // from the photograph is offered as an action instead.
            accessibilityActions={[{ name: 'like', label: 'Like' }]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'like') onDoubleTap();
            }}
            className="bg-muted"
            style={{ width, height }}
          >
            <PieceImage piece={piece} width={width} height={height} contentFit={fitIn(piece, frame)} />
          </Pressable>
        )
      }
      overlay={
        <>
          {privateNote ? <PrivateBadge removed={status === 'removed'} label={privateNote} /> : null}
          <Animated.View
            pointerEvents="none"
            style={[
              { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
              { alignItems: 'center', justifyContent: 'center' },
              heart,
            ]}
          >
            {/* White on any photograph, in either theme, with a soft shadow
                so it still reads on a white wall. Named outright: lucide's
                currentColor fill renders hollow on a device. */}
            <View
              style={{
                shadowColor: '#000',
                shadowOpacity: 0.25,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 2 },
              }}
            >
              <HeartIcon size={92} color="#FFFFFF" fill="#FFFFFF" />
            </View>
          </Animated.View>
        </>
      }
    />
  );
}

/** Drawn on your own post when only you can see it. */
function PrivateBadge({ removed, label }: { removed: boolean; label: string }) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="absolute left-3 top-3 flex-row items-center gap-1 rounded-full px-2.5 py-1"
      style={{ backgroundColor: removed ? palette.destructive : 'rgba(0,0,0,0.55)' }}
    >
      <LockIcon size={11} color="#FFFFFF" />
      <Text className="text-[11px] font-bold" style={{ color: '#FFFFFF' }}>
        {label}
      </Text>
    </View>
  );
}

/**
 * A card's film, and the one part of the card that listens for whose turn it
 * is — so a change of turn re-renders the film alone.
 *
 * Playing makes it this card's turn. A card that never reached 60% on screen
 * was never anybody's turn, so the first tap started the film and the turn
 * stopped it again at once. Outside a list there is no turn to wait for.
 */
function CardFilm({
  id,
  piece,
  width,
  height,
  contentFit,
  filmTurn,
  active,
}: {
  id: string;
  piece: ShowcasePiece;
  width: number;
  height: number;
  contentFit: 'cover' | 'contain';
  filmTurn?: FilmTurn;
  /** The screen is being looked at and this is the page of the set showing. */
  active: boolean;
}) {
  const turn = useSyncExternalStore(filmTurn?.subscribe ?? alwaysSubscribed, () =>
    filmTurn ? filmTurn.isActive(id) : true,
  );
  return (
    <ShowcaseFilm
      piece={piece}
      width={width}
      height={height}
      contentFit={contentFit}
      active={turn && active}
      onPlay={() => filmTurn?.set({ id })}
    />
  );
}

/**
 * The caption, cut at two lines with "more" on the end of the second, and the
 * rest in place when it is tapped.
 *
 * Where to cut is measured, not guessed by length: the whole caption is laid
 * out once, unseen, at the card's width, and the first two lines of it are
 * what is shown, less room for "… more". Cutting at a character count left a
 * short caption with three lines of line breaks cut mid-word, and a long one
 * of narrow letters stopping half way along the line. The web preview cannot
 * measure lines, so there it falls back to a count.
 *
 * It began with the maker's name in bold, as photo apps do. The name is in
 * the byline directly above, at the same size.
 */
function Caption({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  // What the clamped caption shows, for the caption it was measured on: ''
  // when all of it fits. Keyed by the text, so an edited caption is measured
  // again rather than cut where the old one was.
  const [measured, setMeasured] = useState<{ text: string; cut: string } | null>(null);
  const cut = measured?.text === text ? measured.cut : null;

  const onMeasure = (e: NativeSyntheticEvent<TextLayoutEventData>) => {
    const lines = e.nativeEvent.lines;
    if (lines.length <= CAPTION_LINES) {
      setMeasured({ text, cut: '' });
      return;
    }
    const shown = lines
      .slice(0, CAPTION_LINES)
      .map((line) => line.text)
      .join('');
    const room = shown.slice(0, Math.max(0, shown.length - MORE_ROOM));
    // At a word, unless the line was one unbroken word.
    const atWord = room.replace(/\s+\S*$/, '');
    setMeasured({ text, cut: (atWord || room).trimEnd() });
  };

  const webCut = Platform.OS === 'web' && cut === null && text.length > WEB_CAPTION_CUT;
  const clamped = !expanded && (Boolean(cut) || webCut);
  const shownText = expanded
    ? text
    : cut
      ? `${cut}… `
      : webCut
        ? `${text.slice(0, WEB_CAPTION_CUT).trimEnd()}… `
        : text;

  return (
    <View className="mt-1">
      {!expanded && cut === null && Platform.OS !== 'web' ? (
        <Text
          onTextLayout={onMeasure}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          className="absolute left-0 right-0 top-0 text-[15px] leading-[22px] opacity-0"
        >
          {text}
        </Text>
      ) : null}
      <Text
        onPress={clamped ? () => setExpanded(true) : undefined}
        accessibilityRole={clamped ? 'button' : undefined}
        accessibilityHint={clamped ? 'Shows the whole caption' : undefined}
        // Still clamped while it is being measured, so the first frame is not
        // the whole caption collapsing into two lines.
        numberOfLines={expanded || cut === '' ? undefined : CAPTION_LINES}
        className="text-secondary-foreground text-[15px] leading-[22px]"
      >
        {shownText}
        {clamped ? <Text className="text-muted-foreground">more</Text> : null}
      </Text>
    </View>
  );
}
