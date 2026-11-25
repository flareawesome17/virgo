import { FileText, ImageIcon, Music, Video } from 'lucide-react';
import { contentTypeForName, kindOf } from '@/api';
import { cn } from '@/lib/utils';

const GLYPH = { image: ImageIcon, video: Video, audio: Music, other: FileText } as const;

/**
 * A file on its way up, as a tile.
 *
 * On the phone this is the photograph itself, read off the device. The web's
 * queue keeps each File to itself and lists only a name and a size, so here a
 * file is drawn as what it is: a photograph, a film, a recording. The kind is
 * read off the name, the one thing the queue does say.
 */
export function UploadThumb({
  name,
  className,
  glyphClassName = 'size-4',
}: {
  name: string;
  className?: string;
  glyphClassName?: string;
}) {
  const Glyph = GLYPH[kindOf(contentTypeForName(name))];
  return (
    <span aria-hidden className={cn('grid place-items-center bg-muted text-muted-foreground', className)}>
      <Glyph className={glyphClassName} />
    </span>
  );
}
