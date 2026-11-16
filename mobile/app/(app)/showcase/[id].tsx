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
import { ArrowLeftIcon, EllipsisIcon, Maximize2Icon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { CommentThread } from '@/components/CommentThread';
import { goBackOr } from '@/components/ScreenHeader';
import { ShowcaseCard } from '@/components/ShowcaseCard';
import { useShowcaseCardHost } from '@/components/ShowcaseCardHost';
import { feedFrameAspect } from '@/components/ShowcaseMedia';
import { ShowcaseViewer } from '@/components/ShowcaseViewer';
import { DetailFallback } from '@/components/DetailFallback';
import { useAuth, useShowcase } from '@/src/hooks';
import { makerOf, showcaseStatus } from '@/src/api';

for (const Icon of [ArrowLeftIcon, EllipsisIcon, Maximize2Icon]) {
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
      <Text className="text-foreground text-[17px] leading-6 font-bold">This showcase would not open</Text>
      <Text className="text-muted-foreground text-[15px] leading-[22px] mt-2">
        Something went wrong drawing it. Nothing is lost — the post is still there, and
        everything else in the app still works.
      </Text>

      <View className="mt-5 rounded-2xl border border-border/40 bg-card p-4">
        <Text className="text-muted-foreground text-[13px] leading-[18px] font-semibold">
          What went wrong
        </Text>
        <Text className="text-muted-foreground text-[12px] leading-4 mt-1.5" selectable>
          {error.message || 'No message'}
        </Text>
      </View>

      <View className="flex-row gap-2.5 mt-6">
        <Pressable
          onPress={() => void retry()}
          accessibilityRole="button"
          className="flex-1 h-11 rounded-[14px] bg-action items-center justify-center active:opacity-90"
        >
          <Text className="text-action-foreground text-[15px] font-semibold">Try again</Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          className="flex-1 h-11 rounded-[14px] bg-secondary items-center justify-center active:opacity-70"
        >
          <Text className="text-foreground text-[15px] font-semibold">Go back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

/** How much of a film must be on screen for it to keep playing. */
const FILM_VISIBLE = 0.3;

/** The card's own row above its photograph: who made it, Hire and the ⋯. */
const CARD_HEAD = 60;

/**
 * One showcase, whole, on a screen of its own.
 *
 * Nothing in the app opens this any more — the feed, shelves and profiles show
 * a post as a card and in a sheet — but links still do: a notification, a
 * deep link, the composer once something is posted. So it stays, and it draws
 * the post as the same card the feed does, with the same sheets behind its
 * heart, thread, bookmark and ⋯, so a post looks and offers the same things
 * wherever it is. What this screen adds is the thread written out under the
 * card, and a way to look at the pieces full screen.
 */
export default function ShowcaseScreen() {
  // Another screen pushed over this one (a profile, the report sheet's
  // destination) must not leave a film talking behind it.
  const focused = useIsFocused();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { showcase, error, loadFailed, refetch } = useShowcase(id);
  const { user } = useAuth();
  // Share, edit, private or public, delete, report, keep: the cards' own.
  const host = useShowcaseCardHost({ onRemoved: () => router.back() });
  const [viewing, setViewing] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const { width } = useWindowDimensions();

  /*
   * Whether the card's film is on screen, so one scrolled past stops. A film
   * on a post played on — sound and all — with its controls far above,
   * because only focus was ever asked.
   */
  const cardTop = useRef(0);
  const viewport = useRef({ y: 0, h: 0 });
  const mediaHeight = showcase ? Math.round(width / feedFrameAspect(showcase.pieces[0])) : 0;
  const [mediaOnScreen, setMediaOnScreen] = useState(true);
  const measureMedia = useCallback(() => {
    const { y, h } = viewport.current;
    if (h === 0 || mediaHeight === 0) return;
    const top = cardTop.current + CARD_HEAD;
    const visible = Math.min(y + h, top + mediaHeight) - Math.max(y, top);
    setMediaOnScreen(visible / mediaHeight >= FILM_VISIBLE);
  }, [mediaHeight]);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      viewport.current = {
        y: e.nativeEvent.contentOffset.y,
        h: e.nativeEvent.layoutMeasurement.height,
      };
      measureMedia();
    },
    [measureMedia],
  );
  const mine = Boolean(showcase && user && showcase.userId === user.id);
  // Never read straight off the payload: see makerOf.
  const maker = makerOf(showcase);
  // Only ever not 'live' for the owner: nobody else is sent anything else.
  const status = showcase ? showcaseStatus(showcase) : 'live';

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
      <View className="min-h-[52px] flex-row items-center gap-1 px-2 py-1">
        <Pressable
          // Home, when a link opened this on a cold start and there is nothing
          // to go back to.
          onPress={() => goBackOr()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="w-11 h-11 items-center justify-center active:opacity-60"
        >
          <ArrowLeftIcon size={22} className="text-foreground" />
        </Pressable>
        <View className="flex-1 min-w-0">
          <Text
            accessibilityRole="header"
            className="text-foreground text-[16px] leading-5 font-bold"
            numberOfLines={1}
          >
            {showcase.title ?? 'Showcase'}
          </Text>
          <Text className="text-muted-foreground text-[12px] leading-4" numberOfLines={1}>
            by {maker.displayName}
          </Text>
        </View>
        <Pressable
          onPress={() => host.actions.options(showcase, mine)}
          accessibilityRole="button"
          accessibilityLabel="More options for this post"
          className="w-11 h-11 items-center justify-center active:opacity-60"
        >
          <EllipsisIcon size={20} className="text-foreground" />
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
            measureMedia();
          }}
        >
          {mine && status !== 'live' && (
            <StatusBanner
              status={status}
              pending={host.publishing}
              onRestore={() => void host.makePublic(showcase)}
            />
          )}

          <View
            onLayout={(e: LayoutChangeEvent) => {
              cardTop.current = e.nativeEvent.layout.y;
              measureMedia();
            }}
          >
            <ShowcaseCard
              item={showcase}
              mine={mine}
              actions={host.actions}
              filmActive={focused && viewing === null && mediaOnScreen}
            />
          </View>

          {/* On the card a tap on a photograph is half of a double tap, which
              likes it, so looking closely is a button of its own here. */}
          <View className="px-5">
            <Pressable
              onPress={() => setViewing(0)}
              accessibilityRole="button"
              accessibilityHint="Opens the pieces full screen, where you can zoom."
              className="h-11 rounded-[14px] bg-secondary flex-row items-center justify-center gap-2 active:opacity-70"
            >
              <Maximize2Icon size={16} className="text-foreground" />
              <Text className="text-foreground text-[15px] font-semibold">View full screen</Text>
            </Pressable>
          </View>

          {showcase.keptCount > 0 && (
            <Text className="text-muted-foreground text-[13px] leading-[18px] px-5 pt-3.5">
              Kept by {showcase.keptCount} {showcase.keptCount === 1 ? 'person' : 'people'}
            </Text>
          )}

          {/* The thread writes its own "Comments" title, with the count. */}
          <CommentThread
            showcaseId={showcase.id}
            isOwner={mine}
            makerId={showcase.userId}
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
        title={showcase.title}
        makerName={maker.displayName}
        craftTags={showcase.craftTags}
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
      <View className="mx-5 mt-2 mb-3 rounded-2xl bg-destructive/10 p-4">
        <Text className="text-destructive text-[15px] leading-5 font-semibold">Virgo took this down</Text>
        <Text className="text-foreground text-[13px] leading-[18px] mt-1">
          It was reported and reviewed, and only you can see it now. If you think that was a
          mistake, tell us.
        </Text>
        <Pressable
          onPress={() => router.push('/support')}
          accessibilityRole="link"
          className="self-start h-11 px-4 mt-3 rounded-[14px] bg-background items-center justify-center active:opacity-70"
        >
          <Text className="text-foreground text-[15px] font-semibold">Contact support</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View className="mx-5 mt-2 mb-3 rounded-2xl border border-border/40 bg-card p-4 flex-row items-center gap-3">
      <View className="flex-1">
        <Text className="text-foreground text-[15px] leading-5 font-semibold">Private</Text>
        <Text className="text-muted-foreground text-[13px] leading-[18px] mt-0.5">
          Only you can see it.
        </Text>
      </View>
      <Pressable
        onPress={onRestore}
        disabled={pending}
        accessibilityRole="button"
        className="h-11 px-4 rounded-[14px] bg-action items-center justify-center active:opacity-90"
        style={{ opacity: pending ? 0.6 : 1 }}
      >
        <Text className="text-action-foreground text-[15px] font-semibold">Make public</Text>
      </Pressable>
    </View>
  );
}
