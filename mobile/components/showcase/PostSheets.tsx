import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { CheckIcon, CopyIcon, EllipsisIcon, LockIcon, Trash2Icon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { BottomSheet } from '@/components/BottomSheet';
import { RemoteImage } from '@/components/RemoteImage';
import { makerOf, showcaseShareUrl, showcaseStatus, type FeedItem } from '@/src/api';
import { SITE } from '@/src/lib/profile-media';
import { isShareable } from '@/src/lib/showcase-share';

for (const Icon of [CheckIcon, CopyIcon, EllipsisIcon, LockIcon, Trash2Icon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** What the owner is told about a post of theirs that has no public link. */
export const NOT_SHAREABLE = 'Make it public to share it.';

/** How long "Link copied" stays up before anything else happens. */
export const COPIED_MS = 900;

/**
 * Puts the post's link on the clipboard, and says whether it got there.
 *
 * Only ever called for a post that has a link (see isShareable). A clipboard
 * that refuses is not worth an alert: the caller simply never says "copied".
 */
export async function copyShowcaseLink(id: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(showcaseShareUrl(id, SITE));
    return true;
  } catch {
    return false;
  }
}

/** The post's first piece, small: a photograph's thumbnail or a film's poster. */
export function PostThumb({
  item,
  size,
  rounded = true,
}: {
  item: FeedItem;
  size: number;
  rounded?: boolean;
}) {
  const first = item.pieces?.[0];
  return (
    <View
      className={`bg-muted overflow-hidden ${rounded ? 'rounded-xl' : ''}`}
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {first ? (
        <RemoteImage
          source={{ uri: first.url }}
          style={{ width: size, height: size }}
          contentFit="cover"
          recyclingKey={first.fileKey}
        />
      ) : null}
    </View>
  );
}

/** The quiet button that ends a sheet: Cancel, Keep it. */
export function QuietButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className="h-11 rounded-[14px] bg-muted items-center justify-center active:opacity-70"
    >
      <Text className="text-foreground text-[15px] leading-5 font-semibold">{label}</Text>
    </Pressable>
  );
}

/** The one thing a sheet is there to do, across its foot. */
function FootButton({
  label,
  onPress,
  destructive,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`h-[52px] rounded-[14px] items-center justify-center active:opacity-80 ${
        destructive ? 'bg-destructive' : 'bg-action'
      }`}
    >
      <Text
        className={`text-[16px] leading-[22px] font-semibold ${
          destructive ? 'text-destructive-foreground' : 'text-action-foreground'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export type PostConfirm = { kind: 'delete' | 'private'; item: FeedItem };

/**
 * "Delete this post?" and "Make this private?".
 *
 * Sheets rather than Alerts: an Alert cannot say which of the two buttons is
 * the dangerous one on Android, and reads as the phone talking, not the app.
 *
 * `onConfirm` is what the big button asks for. The host closes the sheet and
 * only then does it, so an error alert is never raised over a sheet that is
 * still leaving.
 */
export function PostConfirmSheet({
  confirm,
  onConfirm,
  onClose,
  onClosed,
}: {
  confirm: PostConfirm | null;
  onConfirm: (confirm: PostConfirm) => void;
  onClose: () => void;
  onClosed: () => void;
}) {
  let body: ReactNode = <View />;
  if (confirm) {
    const deleting = confirm.kind === 'delete';
    const kept = confirm.item.keptCount ?? 0;
    const sentence = !deleting
      ? 'Only you will see it. It leaves the feed and your profile until you make it public again.'
      : kept > 0
        ? `It goes from the feed, your profile and the ${
            kept === 1 ? 'shelf' : `${kept} shelves`
          } it is kept on. Your album files stay where they are.`
        : 'It goes from the feed and your profile. Your album files stay where they are.';
    body = (
      <View className="px-5 pt-1.5 pb-3 items-center">
        <View
          className={`w-12 h-12 rounded-2xl items-center justify-center mb-3 ${
            deleting ? 'bg-destructive/10' : 'bg-muted'
          }`}
        >
          {deleting ? (
            <Trash2Icon size={22} className="text-destructive" />
          ) : (
            <LockIcon size={22} className="text-foreground" />
          )}
        </View>
        <Text
          className="text-foreground text-[18px] leading-[26px] font-bold text-center"
          accessibilityRole="header"
        >
          {deleting ? 'Delete this post?' : 'Make this private?'}
        </Text>
        <Text className="text-muted-foreground text-[15px] leading-[22px] text-center mt-1.5">
          {sentence}
        </Text>
        <View className="self-stretch gap-2 mt-5">
          <FootButton
            label={deleting ? 'Delete post' : 'Make private'}
            destructive={deleting}
            onPress={() => onConfirm(confirm)}
          />
          <QuietButton label={deleting ? 'Keep it' : 'Cancel'} onPress={onClose} />
        </View>
      </View>
    );
  }

  return (
    <BottomSheet visible={confirm !== null} onClose={onClose} onClosed={onClosed}>
      {body}
    </BottomSheet>
  );
}

/** One of the ways out of the share sheet: a tile and a word under it. */
function ShareTile({
  icon,
  label,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="w-[76px] items-center gap-1.5 active:opacity-70"
    >
      <View className="w-14 h-14 rounded-[18px] bg-muted items-center justify-center">{icon}</View>
      <Text className="text-muted-foreground text-[12px] leading-4 text-center">{label}</Text>
    </Pressable>
  );
}

/**
 * Sharing a post.
 *
 * A post with a link: what is about to be sent, then copying the link or the
 * phone's own share sheet. A link, never the files (see shareShowcase).
 *
 * Your own post without one: what would give it one, and the button that
 * does it — except a post Virgo took down, which nothing here can put back.
 * Somebody else's post without a link never gets this far.
 *
 * `onMore` and `onMakePublic` are run by the host once this sheet has gone:
 * iOS will not present the share sheet over one that is still leaving.
 */
export function PostShareSheet({
  target,
  onMore,
  onMakePublic,
  onClose,
  onClosed,
}: {
  target: { item: FeedItem; mine: boolean } | null;
  onMore: (item: FeedItem) => void;
  onMakePublic: (item: FeedItem) => void;
  onClose: () => void;
  onClosed: () => void;
}) {
  return (
    <BottomSheet visible={target !== null} onClose={onClose} onClosed={onClosed}>
      {target ? (
        isShareable(target.item) ? (
          <ShareBody item={target.item} onMore={() => onMore(target.item)} onClose={onClose} />
        ) : (
          <NoLinkBody
            item={target.item}
            onMakePublic={() => onMakePublic(target.item)}
            onClose={onClose}
          />
        )
      ) : (
        <View />
      )}
    </BottomSheet>
  );
}

function ShareBody({
  item,
  onMore,
  onClose,
}: {
  item: FeedItem;
  onMore: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    if (!(await copyShowcaseLink(item.id))) return;
    setCopied(true);
    // Said aloud as well: the word under the tile changes without focus
    // moving, which a screen reader would otherwise pass over.
    AccessibilityInfo.announceForAccessibility('Link copied');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  const link = showcaseShareUrl(item.id, SITE).replace(/^https?:\/\//i, '');

  return (
    <View className="px-5 pb-3">
      <View className="min-h-[32px] justify-center">
        <Text className="text-foreground text-[18px] leading-[26px] font-bold" accessibilityRole="header">
          Share this post
        </Text>
      </View>

      <View className="mt-3 mb-4 flex-row items-center gap-3 pr-3.5 rounded-[20px] border border-border/40 bg-card overflow-hidden">
        <PostThumb item={item} size={76} rounded={false} />
        <View className="flex-1 min-w-0">
          <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={1}>
            {item.title?.trim() || 'Post'}
          </Text>
          <Text className="text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
            by {makerOf(item).displayName}
          </Text>
          <Text className="text-muted-foreground text-[12px] leading-4" numberOfLines={1}>
            {link}
          </Text>
        </View>
      </View>

      <View className="flex-row justify-center gap-6">
        <ShareTile
          icon={
            copied ? (
              <CheckIcon size={22} className="text-foreground" />
            ) : (
              <CopyIcon size={22} className="text-foreground" />
            )
          }
          label={copied ? 'Link copied' : 'Copy link'}
          onPress={() => void copy()}
        />
        <ShareTile
          icon={<EllipsisIcon size={22} className="text-foreground" />}
          label="More"
          onPress={onMore}
        />
      </View>

      <Text className="text-muted-foreground text-[12px] leading-4 text-center mt-4 mb-2">
        Anyone with the link can see the post, with or without Virgo.
      </Text>
      <QuietButton label="Cancel" onPress={onClose} />
    </View>
  );
}

function NoLinkBody({
  item,
  onMakePublic,
  onClose,
}: {
  item: FeedItem;
  onMakePublic: () => void;
  onClose: () => void;
}) {
  const removed = showcaseStatus(item) === 'removed';
  return (
    <View className="px-5 pt-1.5 pb-3">
      <Text className="text-foreground text-[18px] leading-[26px] font-bold" accessibilityRole="header">
        {NOT_SHAREABLE}
      </Text>
      <Text className="text-muted-foreground text-[15px] leading-[22px] mt-1.5">
        {removed
          ? 'Virgo took this post down, so it has no public link.'
          : 'Only a public post has a link other people can open.'}
      </Text>
      <View className="gap-2 mt-5">
        {/* Publishing a post Virgo took down changes nothing while the
            moderation flag hides it, so it is not offered. */}
        {removed ? null : <FootButton label="Make public" onPress={onMakePublic} />}
        <QuietButton label={removed ? 'Close' : 'Cancel'} onPress={onClose} />
      </View>
    </View>
  );
}
