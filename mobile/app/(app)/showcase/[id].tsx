import { useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, type ErrorBoundaryProps } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import {
  ArrowLeftIcon,
  BookmarkIcon,
  EyeIcon,
  EyeOffIcon,
  FlagIcon,
  HeartIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { RemoteImage } from '@/components/RemoteImage';
import { ShowcaseFilm } from '@/components/ShowcaseFilm';
import { KeepSheet } from '@/components/KeepSheet';
import { CommentThread } from '@/components/CommentThread';
import { DetailFallback } from '@/components/DetailFallback';
import { ShowcaseReportSheet } from '@/components/ShowcaseReportSheet';
import { useAuth, useLike, useShowcase, useShowcaseActions, useTheme } from '@/src/hooks';
import { makerOf, showcaseStatus } from '@/src/api';
import { profileActionMessage } from '@/src/lib/profile-media';
import { PALETTES } from '@/theme';

for (const Icon of [ArrowLeftIcon, BookmarkIcon, EyeIcon, EyeOffIcon, FlagIcon, HeartIcon, PencilIcon, Trash2Icon]) {
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
 * One showcase, whole.
 *
 * The feed shows the cover and as much of the note as fits; this is where the
 * rest of the set and the rest of the note live.
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
  const like = useLike();
  const [keeping, setKeeping] = useState(false);
  // Only reachable from the feed card before: somebody who opened the post
  // to look properly had nowhere to report it from.
  const [reporting, setReporting] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const { setPublished, remove } = useShowcaseActions();
  const mine = Boolean(showcase && user && showcase.userId === user.id);
  // Never read straight off the payload: see makerOf.
  const maker = makerOf(showcase);
  // Only ever not 'live' for the owner: nobody else is sent anything else.
  const status = showcase ? showcaseStatus(showcase) : 'live';

  const confirmDelete = () => {
    if (!showcase) return;
    Alert.alert(
      'Delete this showcase?',
      'It goes from the feed, from your profile, and from every shelf anybody kept it on. Your photographs stay in your albums.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            remove.mutate(showcase.id, {
              onSuccess: () => router.back(),
              onError: (error) =>
                Alert.alert("Couldn't delete it", profileActionMessage(error, 'unshowcase')),
            }),
        },
      ],
    );
  };

  const setLive = (published: boolean) => {
    if (!showcase) return;
    setPublished.mutate(
      { id: showcase.id, published },
      {
        onError: (error) =>
          Alert.alert("Couldn't change that", profileActionMessage(error, 'setting')),
      },
    );
  };

  /*
   * Down, or back up.
   *
   * This asked publishedAt, which a take-down keeps — so it always read "up",
   * always sent "take down", and a post taken down could never be put back.
   * Taking down is asked first; putting back up is not, since it undoes itself.
   */
  const togglePublished = () => {
    if (status === 'live') {
      Alert.alert(
        'Take this down?',
        'It leaves the feed, your profile and the shelves it was kept on. Only you will see it, and you can put it back up any time — its likes, comments and date stay.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Take down', style: 'destructive', onPress: () => setLive(false) },
        ],
      );
    } else if (status === 'down' || status === 'draft') {
      setLive(true);
    }
  };

  const openMaker = () => {
    // Your own avatar goes to your own profile, which needs no published
    // handle; somebody else's only has somewhere to go if they published one.
    if (mine) router.push('/profile');
    else if (maker.handle) router.push(`/u/${maker.handle}`);
  };
  const width = Dimensions.get('window').width;

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
        {!mine && (
          <Pressable
            onPress={() => setReporting(showcase.id)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Report this showcase"
            className="w-11 h-11 items-center justify-center active:opacity-70"
          >
            <FlagIcon size={18} className="text-muted-foreground" />
          </Pressable>
        )}
        {/* Only on your own. Taking it down and deleting it are different
            things and both are offered: unpublishing is reversible and keeps
            the date it first went out, deleting is not. */}
        {mine && (
          <>
            {status !== 'removed' && (
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/showcase/new', params: { edit: showcase.id } })
                }
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Edit this showcase"
                className="w-11 h-11 items-center justify-center active:opacity-70"
              >
                <PencilIcon size={18} className="text-muted-foreground" />
              </Pressable>
            )}
            {/* Not offered on one Virgo took down: publishing it again would
                change nothing, because the moderation flag still hides it. */}
            {status !== 'removed' && (
              <Pressable
                onPress={togglePublished}
                disabled={setPublished.isPending}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={
                  status === 'live'
                    ? 'Take this down'
                    : status === 'draft'
                      ? 'Post this'
                      : 'Put this back up'
                }
                className="w-11 h-11 items-center justify-center active:opacity-70"
              >
                {status === 'live' ? (
                  <EyeOffIcon size={19} className="text-muted-foreground" />
                ) : (
                  <EyeIcon size={19} className="text-primary" />
                )}
              </Pressable>
            )}
            <Pressable
              onPress={confirmDelete}
              disabled={remove.isPending}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Delete this showcase"
              className="w-11 h-11 items-center justify-center active:opacity-70"
            >
              <Trash2Icon size={19} className="text-destructive" />
            </Pressable>
          </>
        )}
      </View>

      {/* Padding on iOS, where nothing else moves the comment box out from
          under the keyboard; Android resizes the window itself. */}
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {mine && status !== 'live' && (
            <StatusBanner
              status={status}
              pending={setPublished.isPending}
              onRestore={() => setLive(true)}
            />
          )}
          {showcase.pieces.map((piece, i) => (
            <View key={piece.fileKey} className={i > 0 ? 'mt-1' : ''}>
              {piece.kind === 'video' ? (
                <ShowcaseFilm
                  piece={piece}
                  width={width}
                  height={Math.round(width * 1.25)}
                  active={focused && (playing === null || playing === piece.fileKey)}
                  onPlay={() => setPlaying(piece.fileKey)}
                />
              ) : (
                <RemoteImage
                  source={{ uri: piece.url }}
                  style={{ width, height: Math.round(width * 1.25) }}
                  contentFit="cover"
                />
              )}
            </View>
          ))}

          {/* Who made it, and what you can do about it. The list form carries
              no maker, so this is the only place a reader can credit them. */}
          <View className="px-5 pt-4 flex-row items-center gap-2.5">
            <Pressable
              onPress={openMaker}
              disabled={!mine && !maker.handle}
              accessibilityRole="button"
              accessibilityLabel={`${maker.displayName}'s profile`}
              className="w-10 h-10 rounded-full overflow-hidden bg-primary/15 items-center justify-center"
            >
              {maker.avatarUrl ? (
                <RemoteImage
                  source={{ uri: maker.avatarUrl }}
                  style={{ width: 40, height: 40 }}
                />
              ) : (
                <Text className="text-primary text-[15px] font-bold">
                  {maker.displayName.charAt(0).toUpperCase()}
                </Text>
              )}
            </Pressable>
            <View className="flex-1 min-w-0">
              <Text className="text-foreground text-[14px] font-bold" numberOfLines={1}>
                {maker.displayName}
              </Text>
              {maker.title ? (
                <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
                  {maker.title}
                </Text>
              ) : null}
            </View>
            {showcase.showHire && maker.handle && !mine && (
              <Pressable
                onPress={() => router.push(`/hire/${maker.handle}`)}
                accessibilityRole="button"
                className="min-h-9 px-3.5 rounded-full bg-action items-center justify-center active:opacity-90"
              >
                <Text className="text-action-foreground text-[12px] font-bold">Hire</Text>
              </Pressable>
            )}
          </View>

          <View className="px-5 pt-3 flex-row gap-2.5">
            <Pressable
              onPress={() =>
                like.mutate({ showcaseId: showcase.id, liked: !showcase.likedByMe })
              }
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
                onPress={() => setKeeping(true)}
                accessibilityRole="button"
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
            // The box is the last thing on the page: once the keyboard has
            // taken its share of the screen, bring the box up into what is left.
            onComposerFocus={() =>
              setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250)
            }
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <KeepSheet
        item={keeping ? showcase : null}
        onClose={() => setKeeping(false)}
      />
      <ShowcaseReportSheet showcaseId={reporting} onClose={() => setReporting(null)} />
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
        <Text className="text-foreground text-[13px] font-bold">
          {status === 'draft' ? 'Not posted yet' : 'Taken down'}
        </Text>
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
        <Text className="text-action-foreground text-[12px] font-bold">
          {status === 'draft' ? 'Post it' : 'Put back up'}
        </Text>
      </Pressable>
    </View>
  );
}
