import { View } from 'react-native';
import { Image } from 'expo-image';
import { FileIcon, ImageIcon, MusicIcon, VideoIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import type { UploadTask } from '@/src/providers/UploadProvider';

for (const Icon of [FileIcon, ImageIcon, MusicIcon, VideoIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * A file on its way up, as its picture: the photograph itself, read off the
 * phone where it still is.
 *
 * Uploads were listed by file name, and a camera's file names tell nobody
 * which photograph is which. A film or a recording has no picture the phone
 * will hand over for a file only just chosen, so those are drawn as what they
 * are. So is a photograph that has arrived: the phone's copy of it is deleted
 * once it is in the album (UploadProvider), so there is nothing left to read.
 */
export function UploadThumb({
  task,
  glyph = 20,
}: {
  task: Pick<UploadTask, 'uri' | 'mimeType' | 'status'>;
  glyph?: number;
}) {
  if (task.mimeType.startsWith('image/') && task.status !== 'done') {
    return (
      <Image
        source={{ uri: task.uri }}
        style={{ width: '100%', height: '100%' }}
        contentFit="cover"
        // Decoded at the size it is drawn. `allowDownscaling` alone shrinks
        // the picture only after decoding all of it: a 12-megapixel original
        // is 48 MB of memory before it is cut down to an inch, a 48-megapixel
        // one nearly 200, and the list of a large batch drew every one of
        // them at once: the likeliest reason a 294-file batch ended the app
        // (iOS; Android's loader already decodes at the size of the view).
        enforceEarlyResizing
        allowDownscaling
        // Not copied into the image cache on disk: the file is already on
        // the phone, and is deleted once it has been sent.
        cachePolicy="memory"
        recyclingKey={task.uri}
      />
    );
  }
  const Icon = task.mimeType.startsWith('video/')
    ? VideoIcon
    : task.mimeType.startsWith('audio/')
      ? MusicIcon
      : task.mimeType.startsWith('image/')
        ? ImageIcon
        : FileIcon;
  return (
    <View className="flex-1 items-center justify-center bg-secondary">
      <Icon size={glyph} className="text-muted-foreground" />
    </View>
  );
}
