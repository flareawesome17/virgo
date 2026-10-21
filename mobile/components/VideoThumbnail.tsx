import { Image } from 'expo-image';

/** design/icons/video/virgo-video.svg at 256 px. */
const ICON = require('@/assets/video-thumbnail.png');

/**
 * What a film shows in an album: the Virgo video icon.
 *
 * Uploads no longer get a poster frame — grabbing one from every film cost the
 * server a decode and a stored image each — so this is every film's tile
 * unless it has been posted to a showcase, which makes a frame of its own.
 * The mark carries its own colour, so it sits on whatever the tile is.
 */
export function VideoThumbnail({ size }: { size: number }) {
  return (
    <Image
      source={ICON}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessible={false}
    />
  );
}
