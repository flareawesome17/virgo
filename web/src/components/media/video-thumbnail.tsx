/* eslint-disable @next/next/no-img-element -- a small static SVG, drawn at its own size */
import { cn } from '@/lib/utils';

/** design/icons/video/virgo-video.svg, served from /public. */
export const VIDEO_THUMBNAIL = '/video-thumbnail.svg';

/**
 * What a film shows in an album: the Virgo video icon.
 *
 * Uploads no longer get a poster frame — grabbing one from every film cost the
 * server a decode and a stored image each — so this is every film's tile
 * unless it has been posted to a showcase, which makes a frame of its own.
 */
export function VideoThumbnail({ className }: { className?: string }) {
  return (
    <img
      src={VIDEO_THUMBNAIL}
      alt=""
      aria-hidden
      draggable={false}
      className={cn('aspect-square object-contain', className)}
    />
  );
}
