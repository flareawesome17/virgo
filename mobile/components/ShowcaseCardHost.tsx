import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import {
  EyeIcon,
  EyeOffIcon,
  FlagIcon,
  LifeBuoyIcon,
  PencilIcon,
  Share2Icon,
  ShareIcon,
  Trash2Icon,
  UserIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { BottomSheet } from '@/components/BottomSheet';
import { CommentsSheet } from '@/components/CommentsSheet';
import { useKeepFlow } from '@/components/KeepFlow';
import { ShowcaseReportSheet } from '@/components/ShowcaseReportSheet';
import type { ShowcaseCardActions } from '@/components/ShowcaseCard';
import { useAuth, useShowcaseActions } from '@/src/hooks';
import { makerOf, showcaseStatus, type FeedItem } from '@/src/api';
import { profileActionMessage } from '@/src/lib/profile-media';
import { isShareable, shareShowcase } from '@/src/lib/showcase-share';

for (const Icon of [
  EyeIcon, EyeOffIcon, FlagIcon, LifeBuoyIcon, PencilIcon, Share2Icon, ShareIcon, Trash2Icon, UserIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const ShareGlyph = Platform.OS === 'ios' ? ShareIcon : Share2Icon;

/** What the owner is told about a post of theirs that has no public link. */
const NOT_SHAREABLE = 'Make it public to share it.';

/**
 * Everything a screen of showcase cards draws once for all of them: the ⋯
 * options, the comments, keeping, reporting.
 *
 * Returns the actions to hand every card and the sheets to render. The actions
 * are made once and read the latest of everything through a ref, so a
 * memoised card is never re-rendered because a mutation somewhere changed
 * state.
 *
 * `leave` is for a host that is itself a sheet: given what to do next, it
 * closes and then does it. Without one, leaving is a push.
 */
export function useShowcaseCardHost(
  opts: {
    leave?: (then: () => void) => void;
    /** After the owner deleted a post, for a host that showed only that one. */
    onRemoved?: (id: string) => void;
  } = {},
) {
  const { user } = useAuth();
  const keepFlow = useKeepFlow();
  const { update, setPublished, remove } = useShowcaseActions();
  const [commentsFor, setCommentsFor] = useState<FeedItem | null>(null);
  const [optionsFor, setOptionsFor] = useState<{ item: FeedItem; mine: boolean } | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);

  const live = useRef({ opts, keepFlow, update, setPublished, remove });
  live.current = { opts, keepFlow, update, setPublished, remove };

  const go = useCallback((href: Href) => {
    const leave = live.current.opts.leave;
    if (leave) leave(() => router.push(href));
    else router.push(href);
  }, []);

  /*
   * A link, only for a post that has one. Somebody else's never offers Share
   * without one; your own does, and says what would give it one — a link to a
   * private post is a page that says "not found" to everyone you send it to.
   */
  const share = useCallback((item: FeedItem, mine: boolean) => {
    if (isShareable(item)) {
      void shareShowcase(item, makerOf(item).displayName);
      return;
    }
    if (mine) {
      Alert.alert(
        NOT_SHAREABLE,
        showcaseStatus(item) === 'removed'
          ? 'Virgo took this post down, so it has no public link.'
          : 'Only a public post has a link other people can open.',
      );
    }
  }, []);

  const actions = useMemo<ShowcaseCardActions>(
    () => ({
      comments: (item) => setCommentsFor(item),
      options: (item, mine) => setOptionsFor({ item, mine }),
      keep: (item) => void live.current.keepFlow.onKeep(item),
      chooseShelf: (item) => live.current.keepFlow.choose(item),
      share,
      go,
    }),
    [share, go],
  );

  const failed = (title: string, action: 'setting' | 'unshowcase') => (error: unknown) =>
    Alert.alert(title, profileActionMessage(error, action));

  const makePrivate = (item: FeedItem) =>
    Alert.alert(
      'Make this private?',
      'Only you will see it. It leaves the feed and your profile until you make it public again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Make private',
          onPress: () => {
            live.current.setPublished
              .mutateAsync({ id: item.id, published: false })
              .catch(failed("Couldn't change that", 'setting'));
          },
        },
      ],
    );

  /*
   * Public is public: out for everyone, not only connections. A post shown to
   * connections only is widened as well as put back up, because that is what
   * the word on the button says it will do.
   */
  const makePublic = async (item: FeedItem) => {
    try {
      if (item.visibility !== 'public') {
        await live.current.update.mutateAsync({ id: item.id, body: { visibility: 'public' } });
      }
      if (showcaseStatus(item) !== 'live') {
        await live.current.setPublished.mutateAsync({ id: item.id, published: true });
      }
    } catch (error) {
      failed("Couldn't change that", 'setting')(error);
    }
  };

  const confirmDelete = (item: FeedItem) =>
    Alert.alert(
      'Delete this post?',
      "It's removed from the feed, your profile and everyone's shelves. Your album files stay.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // mutateAsync: a per-call callback is dropped if the host has gone
            // by the time the answer lands, and a failure would vanish with it.
            live.current.remove.mutateAsync(item.id).then(
              () => live.current.opts.onRemoved?.(item.id),
              failed("Couldn't delete it", 'unshowcase'),
            );
          },
        },
      ],
    );

  // What was chosen runs once the sheet has gone: iOS will not present an
  // alert, the share sheet or another sheet over one that is still leaving.
  const chosen = useRef<(() => void) | null>(null);
  const pick = (run: () => void) => {
    chosen.current = run;
    setOptionsFor(null);
  };

  const options = optionsFor ? (
    <OptionRows
      item={optionsFor.item}
      mine={optionsFor.mine}
      onShare={() => pick(() => share(optionsFor.item, optionsFor.mine))}
      onEdit={() =>
        pick(() => go({ pathname: '/showcase/new', params: { edit: optionsFor.item.id } }))
      }
      onPrivate={() => pick(() => makePrivate(optionsFor.item))}
      onPublic={() => pick(() => void makePublic(optionsFor.item))}
      onDelete={() => pick(() => confirmDelete(optionsFor.item))}
      onSupport={() => pick(() => go('/support'))}
      onProfile={() => {
        const handle = makerOf(optionsFor.item).handle;
        if (handle) pick(() => go(`/u/${handle}`));
      }}
      onReport={() => pick(() => setReporting(optionsFor.item.id))}
      onCancel={() => setOptionsFor(null)}
    />
  ) : null;

  const element = (
    <>
      <BottomSheet
        visible={optionsFor !== null}
        onClose={() => setOptionsFor(null)}
        onClosed={() => {
          const run = chosen.current;
          chosen.current = null;
          run?.();
        }}
      >
        {options ?? <View />}
      </BottomSheet>
      <CommentsSheet
        showcaseId={commentsFor?.id ?? null}
        isOwner={Boolean(commentsFor && user && commentsFor.userId === user.id)}
        onClose={() => setCommentsFor(null)}
        onOpenProfile={(handle) => go(`/u/${handle}`)}
      />
      {keepFlow.element}
      <ShowcaseReportSheet showcaseId={reporting} onClose={() => setReporting(null)} />
    </>
  );

  return {
    actions,
    element,
    /** For a screen that offers "Make public" outside the sheet. */
    makePublic,
    publishing: setPublished.isPending || update.isPending,
  };
}

/**
 * The ⋯ sheet.
 *
 * Your own post: share it, edit it, make it private or public, delete it. A
 * post Virgo took down can only be deleted or asked about — publishing it
 * again would change nothing while the moderation flag hides it.
 *
 * Somebody else's: share it, go to whoever made it, report it. Reporting
 * lives here rather than as a flag on every card: reporting is rare, and a
 * flag beside somebody's name read as an accusation.
 */
function OptionRows({
  item,
  mine,
  onShare,
  onEdit,
  onPrivate,
  onPublic,
  onDelete,
  onSupport,
  onProfile,
  onReport,
  onCancel,
}: {
  item: FeedItem;
  mine: boolean;
  onShare: () => void;
  onEdit: () => void;
  onPrivate: () => void;
  onPublic: () => void;
  onDelete: () => void;
  onSupport: () => void;
  onProfile: () => void;
  onReport: () => void;
  onCancel: () => void;
}) {
  const status = mine ? showcaseStatus(item) : 'live';
  const shareable = isShareable(item);
  const maker = makerOf(item);

  return (
    <View className="px-5 pt-2 pb-5">
      {mine && status === 'removed' ? (
        <View className="rounded-xl bg-destructive/10 p-3.5 mb-2">
          <Text className="text-destructive text-[13px] font-bold">Virgo took this down</Text>
          <Text className="text-foreground text-[12px] leading-[18px] mt-1">
            It was reported and reviewed, and only you can see it now.
          </Text>
        </View>
      ) : null}

      {shareable ? (
        <Row icon={ShareGlyph} label="Share" onPress={onShare} />
      ) : mine && status !== 'removed' ? (
        <Row icon={ShareGlyph} label="Share" note={NOT_SHAREABLE} disabled onPress={onShare} />
      ) : null}

      {mine ? (
        <>
          {status !== 'removed' ? <Row icon={PencilIcon} label="Edit" onPress={onEdit} /> : null}
          {status === 'live' && item.visibility !== 'public' ? (
            <Row
              icon={EyeIcon}
              label="Make public"
              note="It is shown to your connections only. Public is everyone on Virgo, and anyone with the link."
              onPress={onPublic}
            />
          ) : null}
          {status === 'live' ? (
            <Row icon={EyeOffIcon} label="Make private" note="Only you will see it." onPress={onPrivate} />
          ) : status === 'draft' || status === 'down' ? (
            <Row
              icon={EyeIcon}
              label="Make public"
              note="Into the feed and onto your profile."
              onPress={onPublic}
            />
          ) : null}
          {status === 'removed' ? (
            <Row icon={LifeBuoyIcon} label="Contact support" onPress={onSupport} />
          ) : null}
          <Row icon={Trash2Icon} label="Delete" destructive onPress={onDelete} />
        </>
      ) : (
        <>
          {maker.handle ? (
            <Row icon={UserIcon} label={`View ${maker.displayName}'s profile`} onPress={onProfile} />
          ) : null}
          <Row icon={FlagIcon} label="Report" destructive onPress={onReport} />
        </>
      )}

      <Pressable
        onPress={onCancel}
        accessibilityRole="button"
        className="mt-3 bg-muted rounded-2xl min-h-[48px] items-center justify-center active:scale-[0.98]"
      >
        <Text className="text-foreground text-base font-semibold">Cancel</Text>
      </Pressable>
    </View>
  );
}

function Row({
  icon: Icon,
  label,
  note,
  onPress,
  destructive,
  disabled,
}: {
  icon: typeof FlagIcon;
  label: string;
  note?: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const tone = destructive ? 'text-destructive' : disabled ? 'text-muted-foreground' : 'text-foreground';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      accessibilityHint={note}
      className="min-h-[52px] py-2.5 flex-row items-center gap-3 border-b border-border active:opacity-60"
    >
      <Icon size={18} className={tone} />
      <View className="flex-1 min-w-0">
        <Text className={`text-base ${tone}`}>{label}</Text>
        {note ? (
          <Text className="text-muted-foreground text-[12px] leading-4 mt-0.5">{note}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}
