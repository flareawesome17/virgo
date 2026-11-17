import { useState } from 'react';
import { Text, View } from 'react-native';
import { ChevronRightIcon, ImageIcon, ImagesIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { albumCardCount, type AlbumCardContext } from '@/src/api';
import { RemoteImage } from '@/components/RemoteImage';
import { PALETTES } from '@/theme';
import { openChatLink } from '../links';
import { CardFrame, CardGone, holdActions } from './CardFrame';
import type { CardProps } from './types';

for (const Icon of [ChevronRightIcon, ImageIcon, ImagesIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const WIDTH = 272;
const TILE = 110;
const GAP = 2;

/**
 * Over a photograph the shade is dark in either theme, as the photo viewer's
 * is: the theme's text colour would turn it pale in dark mode.
 */
const SCRIM = `${PALETTES.light.foreground}73`;
const PILL = `${PALETTES.light.foreground}B3`;

/**
 * Album photos shared in the chat: four small thumbnails, how many and from
 * which album, and who can save them. A tap opens the client link made for
 * just these, where the rest are.
 *
 * On a weak signal, or with "Only when I tap", the thumbnails are not asked
 * for: their tiny blurred stand-ins fill the tiles with "Tap to load" over
 * them. The first tap loads the real ones; the next opens the link.
 */
export function AlbumPhotosCard({
  message,
  mine,
  senderName,
  meta,
  cardRef,
  onHold,
  pills,
  people,
  autoLoadMedia,
}: CardProps) {
  const [asked, setAsked] = useState(false);
  const context = (message.context ?? null) as AlbumCardContext | null;
  const album = context?.album;
  const url = context?.url ?? null;

  // Who the link is for, as the sender and as everyone else would say it.
  const whoCanSave = people.isGroup
    ? 'everyone here can save them'
    : mine
      ? `${people.otherFirst ?? 'they'} can save them`
      : 'you can save them';

  if (!album) {
    const words =
      album === null ? "These photos aren't shared any more." : "Couldn't load these photos right now.";
    return (
      <CardFrame
        ref={cardRef}
        mine={mine}
        senderName={senderName}
        meta={meta}
        width={WIDTH}
        onPress={album === undefined && url ? () => openChatLink(url) : undefined}
        onHold={onHold}
        label={`Album photos. ${words}`}
        pills={pills}
      >
        <View accessible accessibilityLabel={`Album photos. ${words} ${meta}`} {...holdActions(onHold)} className="gap-1.5">
          <View className="flex-row items-center gap-1.5">
            <ImagesIcon size={14} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-[12px] font-bold">Album photos</Text>
          </View>
          <CardGone words={words} />
        </View>
      </CardFrame>
    );
  }

  const showPictures = autoLoadMedia || asked;
  const thumbs = album.thumbs.slice(0, 4);
  // The last tile says how many more: "+8" on the fourth of twelve.
  const more = thumbs.length > 0 && album.total > thumbs.length ? album.total - thumbs.length : 0;
  const count = albumCardCount(album);
  const second = album.sectionName ? `${album.sectionName} · ${whoCanSave}` : capitalise(whoCanSave);
  const waiting = !showPictures && thumbs.length > 0;

  const press = () => {
    if (waiting) {
      setAsked(true);
      return;
    }
    if (url) openChatLink(url);
  };

  return (
    <CardFrame
      ref={cardRef}
      mine={mine}
      senderName={senderName}
      meta={meta}
      width={WIDTH}
      padded={false}
      onPress={press}
      onHold={onHold}
      label={`Album photos, ${count} from ${album.name}. ${second}`}
      hint={waiting ? 'Loads the pictures' : 'Opens the photos'}
      pills={pills}
    >
      {thumbs.length > 0 ? (
        <View>
          <Tiles thumbs={thumbs} blurs={album.blurs} showPictures={showPictures} more={more} />
          {waiting ? (
            <View
              pointerEvents="none"
              className="absolute inset-0 items-center justify-center"
            >
              <View className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5" style={{ backgroundColor: PILL }}>
                <ImageIcon size={14} className="text-action-foreground" />
                <Text className="text-action-foreground text-[13px] font-semibold">Tap to load</Text>
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <View className="bg-muted items-center justify-center" style={{ height: TILE }}>
          <ImagesIcon size={24} className="text-muted-foreground" />
        </View>
      )}
      <View className="flex-row items-center gap-2.5 px-3 pt-2.5 pb-3">
        <View className="flex-1 min-w-0">
          <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={2}>
            {count} · {album.name}
          </Text>
          <Text className="text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
            {second}
          </Text>
        </View>
        <ChevronRightIcon size={18} className="text-muted-foreground" />
      </View>
    </CardFrame>
  );
}

function capitalise(words: string): string {
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Up to four tiles, two to a row; one alone fills the width. With more in
 * the link than fit, the last says how many more.
 */
function Tiles({
  thumbs,
  blurs,
  showPictures,
  more,
}: {
  thumbs: string[];
  blurs: (string | null)[];
  showPictures: boolean;
  more: number;
}) {
  const rows: number[][] =
    thumbs.length === 1 ? [[0]] : thumbs.length === 3 ? [[0, 1], [2]] : [[0, 1], [2, 3]].map((r) => r.filter((i) => i < thumbs.length));
  return (
    <View style={{ gap: GAP }}>
      {rows
        .filter((r) => r.length > 0)
        .map((row) => (
          <View key={row.join('-')} className="flex-row" style={{ gap: GAP, height: thumbs.length === 1 ? TILE * 1.5 : TILE }}>
            {row.map((i) => {
              const blur = blurs[i] ?? null;
              const source = showPictures ? thumbs[i] : blur;
              return (
                <View key={i} className="flex-1 bg-muted overflow-hidden">
                  {source ? (
                    <RemoteImage
                      source={{ uri: source }}
                      placeholder={showPictures && blur ? { uri: blur } : undefined}
                      placeholderContentFit="cover"
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                      transition={140}
                    />
                  ) : null}
                  {i === thumbs.length - 1 && more > 0 ? (
                    <View className="absolute inset-0 items-center justify-center" style={{ backgroundColor: SCRIM }}>
                      <Text className="text-action-foreground text-[22px] font-bold">+{more}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}
    </View>
  );
}
