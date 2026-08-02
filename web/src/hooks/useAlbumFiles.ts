import { useQuery } from '@tanstack/react-query';
import { storageApi, type StoredFile } from '@/api';

export const albumFilesQueryKey = (albumId?: string) =>
  ['storage', 'files', albumId ?? 'all'] as const;

export type MediaKind = 'image' | 'video' | 'audio' | 'other';

export function kindOf(contentType: string | null): MediaKind {
  if (!contentType) return 'other';
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  return 'other';
}

/**
 * Media actually stored for an album.
 *
 * Album screens used to render generated placeholder arrays — `picsum` photos
 * and invented filenames — so a brand-new album looked full. This returns only
 * what is really in the bucket, which means an empty album now renders empty.
 */
/** Display name for a stored object, derived from its key. */
export function fileNameFromKey(key: string): string {
  return key.split('/').pop() ?? key;
}

/** `Aug 1, 2026` */
export function fileDate(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function useAlbumFiles(
  albumId: string | undefined,
  options: { enabled?: boolean } = {},
) {
  const query = useQuery({
    queryKey: albumFilesQueryKey(albumId),
    queryFn: () => storageApi.listFiles({ albumId, limit: 200 }),
    enabled: (options.enabled ?? true) && !!albumId,
  });

  const files: StoredFile[] = query.data?.data ?? [];

  return {
    ...query,
    files,
    images: files.filter((f) => kindOf(f.contentType) === 'image'),
    videos: files.filter((f) => kindOf(f.contentType) === 'video'),
    audio: files.filter((f) => kindOf(f.contentType) === 'audio'),
    total: query.data?.total ?? 0,
  };
}
