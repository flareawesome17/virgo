import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { DatabaseService } from '../../database/database.service';
import type { NotifyService } from '../../notifications/notify.service';
import type { HlsService } from '../../storage/hls.service';
import { MediaLinkService } from '../../storage/media-link.service';
import type { StorageService } from '../../storage/storage.service';
import type { VisitsService } from '../../visits/visits.service';
import type { WorkspaceActivityService } from '../../workspaces/workspace-activity.service';
import { PublicAlbumController } from './album-share.controller';
import { AlbumShareService, type SharePurpose } from './album-share.service';

// The controller streams zips, and archiver ships as ESM, which this jest
// setup does not transform. Nothing here gets as far as zipping.
jest.mock('archiver', () => ({ ZipArchive: class {} }));

/**
 * The gallery behind a share link, and what it hands over.
 *
 * A client delivery hands over the files: originals to view, signed download
 * links, the names they were shot under, a zip of the lot. A portfolio link
 * is the one a public profile's album card opens, so it is a stranger
 * looking, and it gets renditions only — never an original, which carries the
 * camera's EXIF and GPS, and nothing to download.
 */

const OWNER = '11111111-1111-4111-8111-111111111111';
const STEM = `users/${OWNER}/albums/2026/09`;

/** A photograph in the album, as the gallery query returns it. */
function file(
  name: string,
  position: number,
  { thumb = true, widths = null as number[] | null } = {},
) {
  return {
    id: `id-${name}`,
    key: `${STEM}/${name}.jpg`,
    thumb_key: thumb ? `${STEM}/${name}-thumb.webp` : null,
    poster_key: null,
    proxy_key: null,
    display_widths: widths,
    hls_prefix: null,
    blur_data_url: null,
    content_type: 'image/jpeg',
    size_bytes: '6000000',
    created_at: new Date('2026-09-20T01:00:00Z'),
    original_name: `IMG_SECRET_${position}.JPG`,
    width_px: 4000,
    height_px: 3000,
    duration_ms: null,
    media_title: null,
    media_artist: null,
    processing_status: 'ready' as const,
    taken_at: '2026-09-20T09:00:00',
    sort_at: '2026-09-20T09:00:00.000000',
    position: String(position),
    section_id: null,
    picked: false,
  };
}

const FILES = [
  file('ceremony', 1, { widths: [1024, 2048] }),
  file('reception', 2),
  // Neither a thumbnail nor a display copy: nothing a portfolio may show.
  file('raw', 3, { thumb: false }),
];

function galleryOver(purpose: SharePurpose) {
  const link = {
    id: 'link-1',
    album_id: 'album-1',
    user_id: OWNER,
    name: 'Wedding',
    description: null,
    media_kinds: ['image'],
    purpose,
    picks_sent_at: null,
  };
  const queryOne = jest.fn(async (sql: string) => {
    if (/from album_share_links l\s+join albums a/.test(sql)) return link;
    if (/as total_bytes/.test(sql)) {
      return {
        total: '3',
        total_bytes: '18000000',
        image_count: '3',
        video_count: '0',
        audio_count: '0',
        picked_count: '0',
      };
    }
    return null;
  });
  const query = jest.fn(async (sql: string) => {
    if (/with scoped as/.test(sql)) return FILES;
    if (/order by .* key\s*$/s.test(sql) && /select key\s+from user_files/.test(sql)) {
      return FILES.map((f) => ({ key: f.key }));
    }
    return [];
  });

  /** Every key anything was signed for, and whether it was signed to download. */
  const signed: { key: string; download: boolean }[] = [];
  const mediaUrls = jest.fn(
    async (keys: (string | null | undefined)[], _ttl?: number, names?: (string | undefined)[]) =>
      keys.map((key, i) => {
        if (!key) return null;
        signed.push({ key, download: !!names });
        return `https://b2.test/${key}${names ? `?download=${names[i]}` : ''}`;
      }),
  );

  const values: Record<string, string> = {
    MEDIA_HOST: 'media.virgo.test',
    MEDIA_LINK_SECRET: 'secret123',
    MEDIA_ROOT: '/srv/media',
  };
  const config = {
    get: (key: string, fallback?: string) => values[key] ?? fallback,
  } as unknown as ConfigService;

  const service = new AlbumShareService(
    { queryOne, query } as unknown as DatabaseService,
    { mediaUrls, readStream: jest.fn() } as unknown as StorageService,
    new MediaLinkService(config),
    { enqueueAlbum: jest.fn(async () => undefined) } as unknown as HlsService,
    config,
    {} as unknown as NotifyService,
    {} as unknown as WorkspaceActivityService,
  );
  return { service, signed };
}

describe('AlbumShareService.resolve on a portfolio link', () => {
  it('never signs an original, to view or to download', async () => {
    const { service, signed } = galleryOver('portfolio');

    const view = await service.resolve('token');

    const originals = new Set(FILES.map((f) => f.key));
    expect(signed.filter((s) => originals.has(s.key))).toEqual([]);
    expect(signed.some((s) => s.download)).toBe(false);
    for (const shown of view.files) expect(shown.downloadUrl).toBeNull();
  });

  it('shows the widest rendition there is, and leaves out a photograph with none', async () => {
    const { service } = galleryOver('portfolio');

    const view = await service.resolve('token');

    expect(view.files.map((f) => f.id)).toEqual(['id-ceremony', 'id-reception']);
    const [ceremony, reception] = view.files;
    expect(ceremony.url).toBe(ceremony.displaySources.at(-1)?.url);
    expect(ceremony.url).toContain('media.virgo.test');
    expect(ceremony.url).toContain('ceremony-2048.webp');
    expect(reception.url).toBe(`https://b2.test/${STEM}/reception-thumb.webp`);
  });

  it('names nothing the way it was shot, and offers nothing to download', async () => {
    const { service } = galleryOver('portfolio');

    const view = await service.resolve('token');

    expect(JSON.stringify(view)).not.toContain('IMG_SECRET');
    expect(view.files.map((f) => f.originalName)).toEqual(['Wedding - 001', 'Wedding - 002']);
    expect(view.files.every((f) => f.sizeBytes === 0)).toBe(true);
    expect(view.downloads).toBe(false);
    expect(view.totalBytes).toBe(0);
    expect(view.picks.enabled).toBe(false);
  });
});

describe('AlbumShareService.resolve on a client link', () => {
  it('hands over the files as it always has', async () => {
    const { service, signed } = galleryOver('client');

    const view = await service.resolve('token');

    expect(view.files).toHaveLength(3);
    const [ceremony] = view.files;
    expect(ceremony.url).toBe(`https://b2.test/${STEM}/ceremony.jpg`);
    expect(ceremony.downloadUrl).toBe(`https://b2.test/${STEM}/ceremony.jpg?download=Wedding - 001.jpg`);
    expect(ceremony.originalName).toBe('IMG_SECRET_1.JPG');
    expect(ceremony.sizeBytes).toBe(6_000_000);
    expect(view.downloads).toBe(true);
    expect(view.totalBytes).toBe(18_000_000);
    expect(signed.some((s) => s.download)).toBe(true);
  });
});

describe('The zip behind a share link', () => {
  /** Enough of a response for the one answer the route gives here. */
  interface Answer {
    status: jest.Mock<Answer, [number]>;
    json: jest.Mock<Answer, [unknown]>;
  }
  function response(): Answer {
    const res = {} as Answer;
    res.status = jest.fn((_code: number) => res);
    res.json = jest.fn((_body: unknown) => res);
    return res;
  }

  it('has nothing to download on a portfolio link', async () => {
    const { service } = galleryOver('portfolio');

    await expect(service.filesForDownload('token')).resolves.toEqual({
      albumName: 'Wedding',
      files: [],
    });

    const controller = new PublicAlbumController(service, {} as unknown as VisitsService);
    const res = response();
    await controller.downloadAll('token', res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Nothing to download' });
  });

  it('still lists every file on a client link', async () => {
    const { service } = galleryOver('client');

    const zip = await service.filesForDownload('token');

    expect(zip.files.map((f) => f.name)).toEqual([
      'Wedding - 001.jpg',
      'Wedding - 002.jpg',
      'Wedding - 003.jpg',
    ]);
  });
});
