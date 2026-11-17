import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { GalleryVerticalEndIcon, ImageIcon, PlayIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import type { PostCardContext } from '@/src/api';
import { RemoteImage } from '@/components/RemoteImage';
import { PALETTES } from '@/theme';
import { CardFrame, CardGone, CardKindLabel, holdActions } from './CardFrame';
import type { CardProps } from './types';

for (const Icon of [GalleryVerticalEndIcon, ImageIcon, PlayIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** Dark in either theme, over a photograph. */
const BADGE = `${PALETTES.light.foreground}B3`;

function likes(n: number): string {
  return `${n} like${n === 1 ? '' : 's'}`;
}

/**
 * A post shared in the chat: the work, small, with its title and how many
 * like it. A tap opens the post. On a weak signal the picture is its blurred
 * stand-in until tapped; the next tap opens it.
 */
export function PostCard({
  message,
  mine,
  senderName,
  meta,
  cardRef,
  onHold,
  pills,
  myId,
  autoLoadMedia,
}: CardProps) {
  const [asked, setAsked] = useState(false);
  const post = ((message.context ?? null) as PostCardContext | null)?.post;

  if (!post) {
    const words = "This post isn't up any more.";
    return (
      <CardFrame ref={cardRef} mine={mine} senderName={senderName} meta={meta} onHold={onHold} pills={pills}>
        <View accessible accessibilityLabel={`Post. ${words} ${meta}`} {...holdActions(onHold)} className="gap-1.5">
          <CardKindLabel icon={GalleryVerticalEndIcon} label="Post" />
          <CardGone words={words} />
        </View>
      </CardFrame>
    );
  }

  const showPicture = autoLoadMedia || asked;
  const waiting = !showPicture;
  const title = post.title?.trim() || `A post by ${post.makerName}`;
  const byLine = post.makerId === myId ? `Yours · ${likes(post.likeCount)}` : `${post.makerName} · ${likes(post.likeCount)}`;
  const source = showPicture ? post.thumbUrl : post.blur;

  const press = () => {
    if (waiting) {
      setAsked(true);
      return;
    }
    router.push(`/showcase/${post.id}`);
  };

  return (
    <CardFrame
      ref={cardRef}
      mine={mine}
      senderName={senderName}
      meta={meta}
      padded={false}
      onPress={press}
      onHold={onHold}
      label={`Post, ${title}, ${byLine}${post.film ? ', a film' : ''}`}
      hint={waiting ? 'Loads the picture' : 'Opens the post'}
      pills={pills}
    >
      <View className="flex-row items-center gap-3 p-2.5">
        <View className="rounded-xl bg-muted overflow-hidden" style={{ width: 72, height: 90 }}>
          {source ? (
            <RemoteImage
              source={{ uri: source }}
              placeholder={showPicture && post.blur ? { uri: post.blur } : undefined}
              placeholderContentFit="cover"
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={140}
            />
          ) : null}
          {post.film && !waiting ? (
            <View
              className="absolute bottom-1.5 left-1.5 w-6 h-6 rounded-full items-center justify-center"
              style={{ backgroundColor: BADGE }}
            >
              <PlayIcon size={11} className="text-action-foreground" fill={PALETTES.light.actionForeground} />
            </View>
          ) : null}
          {waiting ? (
            <View className="absolute inset-0 items-center justify-center">
              <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: BADGE }}>
                <ImageIcon size={15} className="text-action-foreground" />
              </View>
            </View>
          ) : null}
        </View>
        <View className="flex-1 min-w-0 gap-0.5">
          <Text className="text-muted-foreground text-[12px] leading-4 font-bold">Post</Text>
          <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={2}>
            {title}
          </Text>
          <Text className="text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
            {byLine}
          </Text>
          {waiting ? (
            <Text className="text-primary text-[13px] leading-[18px] font-semibold mt-0.5">Tap to load</Text>
          ) : null}
        </View>
      </View>
    </CardFrame>
  );
}
