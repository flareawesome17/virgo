import { useInfiniteQuery } from '@tanstack/react-query';
import { storageApi, type StoredFile, type StoredMediaKind } from '@/src/api';

export const albumFilesQueryKey = (albumId?: string, kind?: StoredMediaKind) =>
  ['storage', 'files', albumId ?? 'all', kind ?? 'all'] as const;

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
  options: { enabled?: boolean; kind?: StoredMediaKind } = {},
) {
  const query = useInfiniteQuery({
    queryKey: albumFilesQueryKey(albumId, options.kind),
    queryFn: ({ pageParam }) =>
      storageApi.listFiles({
        albumId,
        kind: options.kind,
        cursor: pageParam,
        // New APIs clamp this to 100. Legacy APIs honour 500 and return one
        // unpaged array, which lets the compatibility normalizer classify the
        // complete legacy album rather than only its first mixed-media slice.
        limit: 500,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: (options.enabled ?? true) && !!albumId,
  });

  const files: StoredFile[] = query.data?.pages.flatMap((page) => page.data) ?? [];
  const first = query.data?.pages[0];

  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    files,
    images: files.filter((f) => kindOf(f.contentType) === 'image'),
    videos: files.filter((f) => kindOf(f.contentType) === 'video'),
    audio: files.filter((f) => kindOf(f.contentType) === 'audio'),
    total: first?.total ?? 0,
    counts: first?.counts ?? { image: 0, video: 0, audio: 0, other: 0 },
  };
}
