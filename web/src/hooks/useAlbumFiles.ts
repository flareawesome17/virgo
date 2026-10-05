import { useInfiniteQuery } from '@tanstack/react-query';
import { storageApi, type FileOrder, type StoredFile, type StoredMediaKind } from '@/api';

/**
 * What a gallery can ask the server to narrow to.
 *
 * Every one of these is applied in SQL. The album screens used to load the
 * whole mixed album and split it by kind in the browser, so the Films tab of a
 * three-thousand-photo wedding showed nothing until enough pages of
 * photographs had been fetched to happen across a film.
 */
export interface AlbumFilesFilter {
  kind?: StoredMediaKind;
  /** By capture time. Newest first when omitted. */
  order?: FileOrder;
  /** A section id, or 'none' for files in no section. */
  section?: string;
  /** Only what the client picked. */
  picked?: boolean;
}

/**
 * Starts with `['storage', 'files', albumId]` so a change to an album can be
 * invalidated by that prefix without knowing which filters are on screen.
 */
export const albumFilesQueryKey = (albumId?: string, filter: AlbumFilesFilter = {}) =>
  [
    'storage',
    'files',
    albumId ?? 'all',
    filter.kind ?? 'all',
    filter.order ?? 'newest',
    filter.section ?? 'all',
    filter.picked ? 'picked' : 'any',
  ] as const;

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

/** How often an album with files still processing asks again. */
const PROCESSING_POLL_MS = 5_000;
/** How recent a pending file has to be for that. */
const PROCESSING_WATCH_MS = 15 * 60_000;

export function useAlbumFiles(
  albumId: string | undefined,
  options: AlbumFilesFilter & { enabled?: boolean } = {},
) {
  const { enabled, ...filter } = options;
  const query = useInfiniteQuery({
    queryKey: albumFilesQueryKey(albumId, filter),
    queryFn: ({ pageParam }) =>
      storageApi.listFiles({
        albumId,
        kind: filter.kind,
        order: filter.order,
        section: filter.section,
        picked: filter.picked,
        cursor: pageParam,
        // Paginated APIs clamp to 100; legacy APIs use this ceiling for their
        // single mixed-media array, which the endpoint normalizer then filters.
        limit: 500,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: (enabled ?? true) && !!albumId,
    // Asked again while something is still being processed. A new upload sat
    // behind its spinner until the screen was refreshed by hand: nothing told
    // the album that the thumbnail had been made. Only for files from the
    // last quarter hour, so one that is stuck does not poll for ever.
    refetchInterval: (q) => {
      const since = Date.now() - PROCESSING_WATCH_MS;
      const waiting = q.state.data?.pages.some((page) =>
        page.data.some(
          (f) => f.processingStatus === 'pending' && Date.parse(f.createdAt) > since,
        ),
      );
      return waiting ? PROCESSING_POLL_MS : false;
    },
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
