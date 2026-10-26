import Link from 'next/link';
import { formatBytes } from '@/api';
import { Card, CardContent } from '@/components/ui/card';

/** An album and what it takes up, from the storage breakdown. */
export interface AlbumSize {
  albumId: string;
  name: string;
  bytes: number;
}

/**
 * The albums taking the most storage, each as a bar against the largest.
 *
 * Where to look first when storage fills up: the breakdown under Settings →
 * Storage lists every album, two screens away from the Dashboard that says
 * storage is nearly full. Files in no album are the caller's to leave out;
 * Storage has its own row for those.
 */
export function LargestAlbums({ albums }: { albums: AlbumSize[] }) {
  const largest = Math.max(1, ...albums.map((a) => a.bytes));
  return (
    <Card className="py-0">
      <CardContent className="p-0">
        <ul>
          {albums.map((album) => (
            <li key={album.albumId} className="border-b last:border-b-0">
              <Link href={`/albums/${album.albumId}`} className="block px-4 py-3 hover:bg-muted/40">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-semibold">{album.name}</span>
                  <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                    {formatBytes(album.bytes)}
                  </span>
                </span>
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(2, Math.round((album.bytes / largest) * 100))}%` }}
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
