import type { AlbumShareService } from '../albums/share/album-share.service';
import type { DatabaseService } from '../database/database.service';
import {
  DOWNLOAD_URL_TTL_SECONDS,
  PUBLISHED_URL_TTL_SECONDS,
} from '../storage/storage.config';
import type { StorageService } from '../storage/storage.service';
import { PortfolioService } from './portfolio.service';

/**
 * What an album card on a public profile is given to draw.
 *
 * The profile works out its covers in its own query rather than through the
 * app's album list, and the two had drifted apart three ways. A cover its
 * owner chose never reached the profile. With none chosen, the stand-in was
 * the album's oldest photograph where the app shows its newest. And it was
 * signed from the original, so every card on a public page downloaded a whole
 * camera file.
 *
 * The database is faked at the level of the rows that query returns, built
 * from the albums and files below the way its joins build them. Which
 * photograph counts as the newest is decided by the SQL alone, so one test
 * reads the query itself.
 */

const OWNER = 'owner-1';

/** A `user_files` row, as much of one as a card reads. */
interface FileRow {
  album_id: string | null;
  key: string;
  thumb_key: string | null;
}

/** An album on the profile, as much of one as its card reads. */
interface AlbumRow {
  id: string;
  cover_key: string | null;
  cover_url: string | null;
}

function photo(
  albumId: string | null,
  name: string,
  { thumbnail = true } = {},
): FileRow {
  const stem = `users/${OWNER}/albums/2026/09/${name}`;
  return {
    album_id: albumId,
    key: `${stem}.jpg`,
    thumb_key: thumbnail ? `${stem}-thumb.webp` : null,
  };
}

function album(
  id: string,
  cover: { coverKey?: string | null; coverUrl?: string | null } = {},
): AlbumRow {
  return { id, cover_key: cover.coverKey ?? null, cover_url: cover.coverUrl ?? null };
}

/** What the fake signer below returns for a link on a published page. */
const published = (key: string | null) =>
  `https://media.test/${key}?ttl=${PUBLISHED_URL_TTL_SECONDS}`;

interface Profile {
  /** Single photographs, shown first. */
  images?: FileRow[];
  albums?: AlbumRow[];
  /** Everything in those albums, newest first. */
  files?: FileRow[];
}

/**
 * A profile over these photographs and albums.
 *
 * Each album's row carries the photograph chosen as its cover, if that is
 * still one of the album's own, and the album's newest photograph.
 */
function profileOf({ images = [], albums = [], files = [] }: Profile) {
  const imageRows = images.map((image, i) => ({
    id: `image-${i}`,
    kind: 'image' as const,
    file_key: image.key,
    album_id: null,
    caption: null,
  }));

  const albumRows = albums.map((row, i) => {
    const own = files.filter((file) => file.album_id === row.id);
    const chosen = own.find((file) => file.key === row.cover_key);
    const newest = own[0];
    return {
      id: `album-${i}`,
      kind: 'album' as const,
      file_key: null,
      album_id: row.id,
      caption: null,
      album_name: row.id,
      album_cover_url: row.cover_url,
      album_item_count: own.length,
      share_token: `token-${row.id}`,
      chosen_cover_key: chosen?.key ?? null,
      chosen_cover_thumb_key: chosen?.thumb_key ?? null,
      derived_cover_key: newest?.key ?? null,
      derived_cover_thumb_key: newest?.thumb_key ?? null,
    };
  });

  const query = jest.fn(async (sql: string) =>
    sql.includes('from portfolio_items') ? [...imageRows, ...albumRows] : [],
  );
  const db = { query } as unknown as DatabaseService;

  const mediaUrl = jest.fn(
    async (key: string | null | undefined, ttl = DOWNLOAD_URL_TTL_SECONDS) =>
      key ? `https://media.test/${key}?ttl=${ttl}` : null,
  );
  const storage = { mediaUrl } as unknown as StorageService;

  const shares = {
    urlFor: (token: string) => `https://share.test/${token}`,
  } as unknown as AlbumShareService;

  return { service: new PortfolioService(db, storage, shares), query, mediaUrl };
}

/** The cover each album card was given, in order. */
async function coversOf(service: PortfolioService): Promise<(string | null)[]> {
  const items = await service.list(OWNER);
  return items.flatMap((item) => (item.kind === 'album' ? [item.coverUrl] : []));
}

describe('PortfolioService album covers', () => {
  it('draws the cover its owner chose, from its thumbnail', async () => {
    // Ignored outright before: the profile read only a stored URL and its own
    // stand-in, so choosing a cover changed every card but this one.
    const reception = photo('wedding', 'reception');
    const ceremony = photo('wedding', 'ceremony');
    const { service } = profileOf({
      albums: [album('wedding', { coverKey: ceremony.key })],
      files: [reception, ceremony],
    });

    await expect(coversOf(service)).resolves.toEqual([published(ceremony.thumb_key)]);
  });

  it('stands in the newest photograph, from its thumbnail, when none was chosen', async () => {
    const reception = photo('wedding', 'reception');
    const ceremony = photo('wedding', 'ceremony');
    const { service } = profileOf({
      albums: [album('wedding')],
      files: [reception, ceremony],
    });

    await expect(coversOf(service)).resolves.toEqual([published(reception.thumb_key)]);
  });

  it('falls back to the original while a photograph has no thumbnail', async () => {
    const fresh = photo('wedding', 'just-uploaded', { thumbnail: false });
    const { service } = profileOf({ albums: [album('wedding')], files: [fresh] });

    await expect(coversOf(service)).resolves.toEqual([published(fresh.key)]);
  });

  it('still shows a cover stored as a URL before covers were chosen by key', async () => {
    // Served verbatim, ahead of the stand-in, as the app's own cards do. An
    // album with nothing to show has no cover at all.
    const stored = `https://cdn.virgo.ph/users/${OWNER}/covers/wedding.jpg`;
    const { service } = profileOf({
      albums: [album('wedding', { coverUrl: stored }), album('empty')],
      files: [photo('wedding', 'reception')],
    });

    await expect(coversOf(service)).resolves.toEqual([stored, null]);
  });

  it('asks for the newest photograph, not the oldest', async () => {
    // The fake answers with the newest whatever it is asked, so this reads the
    // query. It sorted by created_at ascending, which put the first frame of
    // the day on the card where the app puts the last.
    const { service, query } = profileOf({
      albums: [album('wedding')],
      files: [photo('wedding', 'reception')],
    });

    await service.list(OWNER);

    const asked = query.mock.calls.map(([sql]) => sql).join('\n');
    expect(asked).toMatch(/created_at desc/i);
  });

  it('signs everything for a published page, not with the app lifetime', async () => {
    // Matching the app's covers must not bring its twelve-hour display links
    // with them. A profile is served to strangers and kept by whatever cached
    // it, so an expired link there is a broken photograph.
    const solo = photo(null, 'portrait');
    const reception = photo('wedding', 'reception');
    const cotillion = photo('debut', 'cotillion');
    const { service, mediaUrl } = profileOf({
      images: [solo],
      albums: [album('wedding'), album('debut', { coverKey: cotillion.key })],
      files: [reception, cotillion],
    });

    const items = await service.list(OWNER);

    // A single photograph is still signed from its original. See `present`.
    expect(items[0]).toMatchObject({ kind: 'image', url: published(solo.key) });
    expect(mediaUrl).toHaveBeenCalled();
    for (const [, ttl] of mediaUrl.mock.calls) {
      expect(ttl).toBe(PUBLISHED_URL_TTL_SECONDS);
    }
  });
});
