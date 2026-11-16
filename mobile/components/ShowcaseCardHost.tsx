import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Platform, Pressable, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import {
  CheckIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  EyeIcon,
  EyeOffIcon,
  FlagIcon,
  LifeBuoyIcon,
  LinkIcon,
  MessageCircleIcon,
  MessageCircleOffIcon,
  PencilIcon,
  Share2Icon,
  ShareIcon,
  Trash2Icon,
  UserIcon,
  UsersIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { BottomSheet } from '@/components/BottomSheet';
import { CommentsSheet } from '@/components/CommentsSheet';
import { useKeepFlow } from '@/components/KeepFlow';
import { ShowcaseReportSheet } from '@/components/ShowcaseReportSheet';
import type { ShowcaseCardActions } from '@/components/ShowcaseCard';
import {
  COPIED_MS,
  NOT_SHAREABLE,
  PostConfirmSheet,
  PostShareSheet,
  PostThumb,
  QuietButton,
  copyShowcaseLink,
  type PostConfirm,
} from '@/components/showcase/PostSheets';
import { useAuth, useShowcaseActions } from '@/src/hooks';
import { makerOf, showcaseStatus, type FeedItem } from '@/src/api';
import { profileActionMessage } from '@/src/lib/profile-media';
import { isShareable, shareShowcase } from '@/src/lib/showcase-share';

for (const Icon of [
  CheckIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  EyeIcon,
  EyeOffIcon,
  FlagIcon,
  LifeBuoyIcon,
  LinkIcon,
  MessageCircleIcon,
  MessageCircleOffIcon,
  PencilIcon,
  Share2Icon,
  ShareIcon,
  Trash2Icon,
  UserIcon,
  UsersIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const ShareGlyph = Platform.OS === 'ios' ? ShareIcon : Share2Icon;

/**
 * Everything a screen of showcase cards draws once for all of them: the ⋯
 * options, the comments, keeping, sharing, reporting, and the questions asked
 * before a post is deleted or made private.
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
  const [shareFor, setShareFor] = useState<{ item: FeedItem; mine: boolean } | null>(null);
  const [confirm, setConfirm] = useState<PostConfirm | null>(null);
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
   * without one; your own does, and the sheet says what would give it one — a
   * link to a private post is a page that says "not found" to everyone you
   * send it to.
   */
  const share = useCallback((item: FeedItem, mine: boolean) => {
    if (isShareable(item) || mine) setShareFor({ item, mine });
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

  const makePrivate = (item: FeedItem) => {
    live.current.setPublished
      .mutateAsync({ id: item.id, published: false })
      .catch(failed("Couldn't change that", 'setting'));
  };

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

  /** The other way from makePublic: still posted, but to connections only. */
  const showToConnections = (item: FeedItem) => {
    live.current.update
      .mutateAsync({ id: item.id, body: { visibility: 'connections' } })
      .catch(failed("Couldn't change that", 'setting'));
  };

  const setComments = (item: FeedItem, allowComments: boolean) => {
    live.current.update
      .mutateAsync({ id: item.id, body: { allowComments } })
      .catch(failed("Couldn't change that", 'setting'));
  };

  const deletePost = (item: FeedItem) => {
    // mutateAsync: a per-call callback is dropped if the host has gone
    // by the time the answer lands, and a failure would vanish with it.
    live.current.remove.mutateAsync(item.id).then(
      () => live.current.opts.onRemoved?.(item.id),
      failed("Couldn't delete it", 'unshowcase'),
    );
  };

  // What was chosen runs once the sheet has gone: iOS will not present an
  // alert, the share sheet or another sheet over one that is still leaving.
  // One slot for all of this host's sheets, since only one is up at a time.
  const chosen = useRef<(() => void) | null>(null);
  const runChosen = () => {
    const run = chosen.current;
    chosen.current = null;
    run?.();
  };
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
      onPrivate={() => pick(() => setConfirm({ kind: 'private', item: optionsFor.item }))}
      onPublic={() => pick(() => void makePublic(optionsFor.item))}
      onConnections={() => pick(() => showToConnections(optionsFor.item))}
      onComments={(allow) => pick(() => setComments(optionsFor.item, allow))}
      onDelete={() => pick(() => setConfirm({ kind: 'delete', item: optionsFor.item }))}
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
        onClosed={runChosen}
      >
        {options ?? <View />}
      </BottomSheet>
      <PostShareSheet
        target={shareFor}
        onMore={(item) => {
          chosen.current = () => void shareShowcase(item, makerOf(item).displayName);
          setShareFor(null);
        }}
        onMakePublic={(item) => {
          chosen.current = () => void makePublic(item);
          setShareFor(null);
        }}
        onClose={() => setShareFor(null)}
        onClosed={runChosen}
      />
      <PostConfirmSheet
        confirm={confirm}
        onConfirm={(asked) => {
          chosen.current = () =>
            asked.kind === 'delete' ? deletePost(asked.item) : makePrivate(asked.item);
          setConfirm(null);
        }}
        onClose={() => setConfirm(null)}
        onClosed={runChosen}
      />
      <CommentsSheet
        showcaseId={commentsFor?.id ?? null}
        isOwner={Boolean(commentsFor && user && commentsFor.userId === user.id)}
        makerId={commentsFor?.userId}
        total={commentsFor?.commentCount}
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

/** Who can see a post of your own, as the line under its title says it. */
function audience(item: FeedItem): string {
  if (showcaseStatus(item) !== 'live') return 'only you can see it';
  return item.visibility === 'public' ? 'everyone can see it' : 'your connections can see it';
}

/**
 * The ⋯ sheet.
 *
 * It opens with the post it is about, since a sheet over a feed of many
 * otherwise leaves you to remember which ⋯ you pressed.
 *
 * Your own post: share it, edit it, narrow or widen who sees it, turn its
 * comments off or on, delete it. A post Virgo took down can only be deleted or
 * asked about — publishing it again would change nothing while the moderation
 * flag hides it.
 *
 * Somebody else's: share it, copy its link, go to whoever made it, report it.
 * Reporting lives here rather than as a flag on every card: reporting is rare,
 * and a flag beside somebody's name read as an accusation.
 */
function OptionRows({
  item,
  mine,
  onShare,
  onEdit,
  onPrivate,
  onPublic,
  onConnections,
  onComments,
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
  onConnections: () => void;
  /** With what comments should be from now on: allowed, or not. */
  onComments: (allow: boolean) => void;
  onDelete: () => void;
  onSupport: () => void;
  onProfile: () => void;
  onReport: () => void;
  onCancel: () => void;
}) {
  const status = mine ? showcaseStatus(item) : 'live';
  const shareable = isShareable(item);
  const maker = makerOf(item);
  const firstName = maker.displayName.trim().split(/\s+/)[0] || maker.displayName;
  // Live and public: the one state with every choice on offer.
  const out = status === 'live' && item.visibility === 'public';

  // "Link copied" stays up for a moment and then the sheet goes: the row is
  // the only place to say it worked.
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = async () => {
    if (copied || !(await copyShowcaseLink(item.id))) return;
    setCopied(true);
    AccessibilityInfo.announceForAccessibility('Link copied');
    timer.current = setTimeout(onCancel, COPIED_MS);
  };

  return (
    <View className="pt-1.5 pb-3">
      {mine && status === 'removed' ? (
        <View
          className="mx-5 mt-1 mb-2 p-3.5 rounded-2xl bg-destructive/10 flex-row gap-2.5"
          accessibilityRole="alert"
        >
          <CircleAlertIcon size={20} className="text-destructive" />
          <Text className="flex-1 text-foreground text-[13px] leading-[18px]">
            <Text className="font-semibold">Virgo took this down.</Text> It was reported and
            reviewed, and only you can see it now. If you think that was a mistake, tell us.
          </Text>
        </View>
      ) : (
        <View className="mx-5 my-1.5 flex-row items-center gap-3">
          <PostThumb item={item} size={48} />
          <View className="flex-1 min-w-0">
            <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={1}>
              {item.title?.trim() || 'Post'}
            </Text>
            <Text className="text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
              {mine ? `Your post · ${audience(item)}` : `by ${maker.displayName}`}
            </Text>
          </View>
        </View>
      )}

      {mine && status === 'removed' ? (
        <>
          <Row icon={LifeBuoyIcon} label="Contact support" chevron onPress={onSupport} />
          <Row
            icon={ShareGlyph}
            label="Share"
            note="A post that was taken down has no link"
            disabled
            onPress={onShare}
          />
          <Row icon={Trash2Icon} label="Delete" destructive onPress={onDelete} />
        </>
      ) : mine ? (
        <>
          {shareable ? (
            <Row icon={ShareGlyph} label="Share" onPress={onShare} />
          ) : (
            <Row icon={ShareGlyph} label="Share" note={NOT_SHAREABLE} disabled onPress={onShare} />
          )}
          <Row
            icon={PencilIcon}
            label="Edit"
            note={out ? 'The words, the tags and who sees it' : undefined}
            onPress={onEdit}
          />
          {out ? (
            <Row
              icon={UsersIcon}
              label="Show to connections only"
              note="It leaves the public feed and loses its link"
              onPress={onConnections}
            />
          ) : null}
          {status === 'live' && item.visibility !== 'public' ? (
            <Row
              icon={EyeIcon}
              label="Make public"
              note="It is shown to your connections only. Public is everyone on Virgo, and anyone with the link."
              onPress={onPublic}
            />
          ) : null}
          {status === 'live' ? (
            <Row
              icon={EyeOffIcon}
              label="Make private"
              note={out ? 'Only you will see it, until you post it again' : 'Only you will see it.'}
              onPress={onPrivate}
            />
          ) : status === 'draft' || status === 'down' ? (
            <Row
              icon={EyeIcon}
              label="Make public"
              note="Into the feed and onto your profile."
              onPress={onPublic}
            />
          ) : null}
          {out ? (
            <Row
              icon={item.allowComments ? MessageCircleOffIcon : MessageCircleIcon}
              label={item.allowComments ? 'Turn off comments' : 'Turn on comments'}
              note="Nothing said is deleted"
              onPress={() => onComments(!item.allowComments)}
            />
          ) : null}
          <Row icon={Trash2Icon} label="Delete" destructive onPress={onDelete} />
        </>
      ) : (
        <>
          {shareable ? (
            <>
              <Row icon={ShareGlyph} label="Share" onPress={onShare} />
              <Row
                icon={copied ? CheckIcon : LinkIcon}
                label={copied ? 'Link copied' : 'Copy the link'}
                onPress={() => void copy()}
              />
            </>
          ) : null}
          {maker.handle ? (
            <Row icon={UserIcon} label={`View ${firstName}'s profile`} onPress={onProfile} />
          ) : null}
          <Row
            icon={FlagIcon}
            label="Report"
            note="Somebody at Virgo reads every report"
            destructive
            onPress={onReport}
          />
        </>
      )}

      <View className="px-5 pt-2">
        <QuietButton label="Cancel" onPress={onCancel} />
      </View>
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
  chevron,
}: {
  icon: typeof FlagIcon;
  label: string;
  note?: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** For a row that leaves for another screen. */
  chevron?: boolean;
}) {
  const tone = destructive ? 'text-destructive' : 'text-foreground';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      accessibilityHint={note}
      className={`px-5 py-2 flex-row items-center gap-3.5 active:opacity-60 ${
        note ? 'min-h-[64px]' : 'min-h-[56px]'
      } ${disabled ? 'opacity-[0.45]' : ''}`}
    >
      <View
        className={`w-10 h-10 rounded-xl items-center justify-center ${
          destructive ? 'bg-destructive/10' : 'bg-muted'
        }`}
      >
        <Icon size={20} className={tone} />
      </View>
      <View className="flex-1 min-w-0">
        <Text className={`text-[15px] leading-5 font-semibold ${tone}`}>{label}</Text>
        {note ? (
          <Text className="text-muted-foreground text-[13px] leading-[18px]">{note}</Text>
        ) : null}
      </View>
      {chevron ? <ChevronRightIcon size={18} className="text-muted-foreground" /> : null}
    </Pressable>
  );
}
