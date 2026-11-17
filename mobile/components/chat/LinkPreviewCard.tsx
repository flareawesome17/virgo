import { memo, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { BriefcaseIcon, FileTextIcon, ImageIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { describeAlbumCount, type LinkPreview } from '@/src/api';
import { useLinkPreview } from '@/src/hooks/useChat';
import { RemoteImage } from '@/components/RemoteImage';
import { ChatAvatar } from './ChatAvatar';
import { openChatLink } from './links';

for (const Icon of [BriefcaseIcon, FileTextIcon, ImageIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * The card's width inside a bubble. A bubble is at most 80% of the thread's
 * width (16 in from each edge) and pads 14 on each side; the card fills that
 * up to this.
 */
const PREVIEW_MAX = 240;

/** "Sat, 14 Feb" from a plain YYYY-MM-DD, read as a local day. */
function jobDay(date: string | null): string | null {
  if (!date) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const d = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' as const } : {}),
  });
}

/** What a screen reader says for the card. */
function describe(preview: LinkPreview): string {
  switch (preview.kind) {
    case 'album':
      return `Album, ${preview.title}, ${describeAlbumCount(preview.counts)}, client link`;
    case 'profile':
      return `Profile, ${preview.title}${preview.subtitle ? `, ${preview.subtitle}` : ''}`;
    case 'post':
      return `Post, ${preview.title}, by ${preview.subtitle}`;
    case 'job':
      return `Job, ${preview.title}${preview.date ? `, ${jobDay(preview.date)}` : ''}`;
    case 'statement':
      return 'Package statement';
  }
}

/**
 * What a Virgo link is, under the message that holds it: the album with its
 * cover and how much is in it, who a profile is, the post, the job, or that
 * it is a package statement. A tap opens the link.
 *
 * Nothing at all while it loads or when there is no preview: the link in the
 * words is still there, and still opens.
 *
 * On a slow line, or with "Only when I tap", the picture is not asked for at
 * all: the card is its words, with "Tap to load picture" for this one card.
 * A profile shows its initials rather than its photograph.
 */
export const LinkPreviewCard = memo(function LinkPreviewCard({
  url,
  onBubble,
  onLongPress,
  autoLoad,
}: {
  url: string;
  /** Which bubble it sits in: a white card on yours, a paper one on theirs. */
  onBubble: 'mine' | 'theirs';
  onLongPress?: () => void;
  /** Whether its picture loads without a tap, on this connection and setting. */
  autoLoad: boolean;
}) {
  const { data: preview } = useLinkPreview(url);
  const [asked, setAsked] = useState(false);
  const showPicture = autoLoad || asked;
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.min(PREVIEW_MAX, Math.floor((windowWidth - 32) * 0.8) - 28);
  if (!preview) return null;

  const surface = onBubble === 'mine' ? 'bg-card' : 'bg-background';
  const open = () => openChatLink(preview.url || url);
  const common = {
    onPress: open,
    onLongPress,
    delayLongPress: 300,
    accessibilityRole: 'link' as const,
    accessibilityLabel: describe(preview),
    accessibilityHint: 'Opens the link',
  };

  if (preview.kind === 'album' || preview.kind === 'post') {
    const image = preview.kind === 'album' ? (preview.thumbs[0] ?? null) : preview.imageUrl;
    const subtitle =
      preview.kind === 'album'
        ? `${describeAlbumCount(preview.counts)} · Client link`
        : preview.subtitle;
    return (
      <Pressable
        {...common}
        className={`mt-2 rounded-2xl overflow-hidden ${surface} active:opacity-80`}
        style={{ width: width }}
      >
        {image && showPicture ? (
          <RemoteImage source={{ uri: image }} style={{ width: width, height: 112 }} contentFit="cover" />
        ) : !image ? (
          <View className="bg-muted items-center justify-center" style={{ height: 112 }}>
            <ImageIcon size={24} className="text-muted-foreground" />
          </View>
        ) : null}
        <View className="px-3 pt-2.5 pb-3">
          <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={2}>
            {preview.title}
          </Text>
          {subtitle ? (
            <Text className="text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
          {image && !showPicture ? (
            <Pressable
              onPress={() => setAsked(true)}
              accessibilityRole="button"
              accessibilityLabel="Load the picture"
              hitSlop={{ top: 8, bottom: 8 }}
              className="mt-2 self-start flex-row items-center gap-1.5 active:opacity-60"
            >
              <ImageIcon size={14} className="text-primary" />
              <Text className="text-primary text-[13px] leading-[18px] font-semibold">
                Tap to load picture
              </Text>
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    );
  }

  // A profile, a job or a statement: a tile and two lines.
  const day = preview.kind === 'job' ? jobDay(preview.date) : null;
  const subtitle =
    preview.kind === 'profile'
      ? preview.subtitle
      : preview.kind === 'job'
        ? [day, preview.subtitle].filter(Boolean).join(' · ') || null
        : null;
  return (
    <Pressable
      {...common}
      className={`mt-2 rounded-[14px] p-2.5 flex-row items-center gap-2.5 ${surface} active:opacity-80`}
      style={{ width: width }}
    >
      {preview.kind === 'profile' ? (
        <ChatAvatar
          name={preview.title}
          url={showPicture ? preview.imageUrl : null}
          size={40}
          initials={2}
        />
      ) : (
        <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
          {preview.kind === 'job' ? (
            <BriefcaseIcon size={18} className="text-primary" />
          ) : (
            <FileTextIcon size={18} className="text-primary" />
          )}
        </View>
      )}
      <View className="flex-1 min-w-0">
        <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={1}>
          {preview.kind === 'statement' ? 'Package statement' : preview.title}
        </Text>
        {subtitle ? (
          <Text className="text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});
