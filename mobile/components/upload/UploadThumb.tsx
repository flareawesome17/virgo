import { View } from 'react-native';
import { Image } from 'expo-image';
import { FileIcon, MusicIcon, VideoIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import type { UploadTask } from '@/src/providers/UploadProvider';

for (const Icon of [FileIcon, MusicIcon, VideoIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * A file on its way up, as its picture: the photograph itself, read off the
 * phone where it still is.
 *
 * Uploads were listed by file name, and a camera's file names tell nobody
 * which photograph is which. A film or a recording has no picture the phone
 * will hand over for a file only just chosen, so those are drawn as what they
 * are.
 */
export function UploadThumb({ task, glyph = 20 }: { task: Pick<UploadTask, 'uri' | 'mimeType'>; glyph?: number }) {
  if (task.mimeType.startsWith('image/')) {
    return (
      <Image
        source={{ uri: task.uri }}
        style={{ width: '100%', height: '100%' }}
        contentFit="cover"
        // Kept small in memory: these are camera originals, drawn an inch wide.
        allowDownscaling
        recyclingKey={task.uri}
      />
    );
  }
  const Icon = task.mimeType.startsWith('video/') ? VideoIcon : task.mimeType.startsWith('audio/') ? MusicIcon : FileIcon;
  return (
    <View className="flex-1 items-center justify-center bg-secondary">
      <Icon size={glyph} className="text-muted-foreground" />
    </View>
  );
}
