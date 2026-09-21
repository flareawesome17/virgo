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
  content_type: string;
}

/** An album on the profile, as much of one as its card reads. */
interface AlbumRow {
  id: string;
  cover_key: string | null;
  cover_url: string | null;
  /** The stored counter, which a card must not read. */
  item_count: number;
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
    content_type: 'image/jpeg',
  };
}

/** `count` photographs in an album. */
function photos(albumId: string, count: number): FileRow[] {
  return Array.from({ length: count }, (_, i) => photo(albumId, `${albumId}-${i + 1}`));
}

/** A film or a recording, which an album holds but its portfolio link never shows. */
function media(albumId: string, name: string, contentType: string): FileRow {
  return {
    album_id: albumId,
    key: `users/${OWNER}/albums/2026/09/${name}`,
    thumb_key: null,
    content_type: contentType,
  };
}

const film = (albumId: string, name: string) => media(albumId, `${name}.mp4`, 'video/mp4');
const recording = (albumId: string, name: string) =>
  media(albumId, `${name}.m4a`, 'audio/mp4');

function album(
  id: string,
  fields: { coverKey?: string | null; coverUrl?: string | null; storedCount?: number } = {},
): AlbumRow {
  return {
    id,
    cover_key: fields.coverKey ?? null,
    cover_url: fields.coverUrl ?? null,
    item_count: fields.storedCount ?? 0,
  };
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
 * still one of the album's own, the album's newest photograph, and how many
 * photographs it holds, as text because that is how the driver hands back a
 * bigint. Its films and recordings are none of those. The stored counter
 * rides along as `album_item_count`, the name the query used to read it by.
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
    const own = files.filter(
      (file) => file.album_id === row.id && file.content_type.startsWith('image/'),
    );
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
      album_item_count: row.item_count,
      album_photo_count: String(own.length),
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

/** The number each album card says, in order. */
async function countsOf(
  service: PortfolioService,
  options: { forOwner?: boolean } = {},
): Promise<number[]> {
  const items = await service.list(OWNER, options);
  return items.flatMap((item) => (item.kind === 'album' ? [item.itemCount] : []));
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

/**
 * How many photographs an album card says it holds.
 *
 * The number was `albums.item_count`, a counter the app bumped after each
 * upload. Nothing on the server kept it true, and the app stopped bumping it
 * once the album list began counting rows for itself, so a published card
 * said whatever the column last held: 0 for an album made since, 24 for one
 * holding 5. The card also says "photos" and opens the album's portfolio
 * link, which shows photographs and nothing else, so counting films and
 * recordings promised visitors work that gallery never shows them.
 *
 * Each album's row carries the stored counter beside the count, so a card
 * that reads the wrong one says so. What is counted, and in whose album, is
 * decided by the SQL alone, so one test reads the query itself.
 */
describe('PortfolioService album counts', () => {
  it('says what the album holds, not what its stored counter claims', async () => {
    // The first album was made after the app stopped bumping the counter.
    // The second drifted the other way: the album recorded in
    // albums.repository.ts, reading 24 while holding 5.
    const { service } = profileOf({
      albums: [album('debut', { storedCount: 0 }), album('wedding', { storedCount: 24 })],
      files: [...photos('debut', 36), ...photos('wedding', 5)],
    });

    await expect(countsOf(service)).resolves.toEqual([36, 5]);
  });

  it('counts photographs only, as its gallery shows them', async () => {
    // A counter bumped per upload counted the films and the vows with the
    // photographs, on a card that says "photos" and opens a link showing
    // photographs alone. An album holding only a film says 0.
    const { service } = profileOf({
      albums: [album('wedding', { storedCount: 5 }), album('speeches', { storedCount: 1 })],
      files: [
        ...photos('wedding', 3),
        film('wedding', 'first-dance'),
        recording('wedding', 'vows'),
        film('speeches', 'best-man'),
      ],
    });

    await expect(countsOf(service)).resolves.toEqual([3, 0]);
  });

  it("gives the owner's editor the number the public card shows", async () => {
    // The editor's row is the owner's view of that card, so it says "photos"
    // too, rather than counting what visitors are never shown.
    const { service } = profileOf({
      albums: [album('wedding', { storedCount: 24 })],
      files: [...photos('wedding', 5), film('wedding', 'first-dance')],
    });

    await expect(countsOf(service, { forOwner: true })).resolves.toEqual([5]);
  });

  it("asks for the photographs in the owner's album, not the counter", async () => {
    // The fake counts for itself whatever it is asked, so this reads the
    // query. The count hangs off `a`, which the join has already checked is
    // this user's album, rather than off the item's own `album_id`: an
    // album's files are billed to its owner, whoever uploaded them, so being
    // in that album is the ownership check.
    const { service, query } = profileOf({
      albums: [album('wedding', { storedCount: 24 })],
      files: photos('wedding', 5),
    });

    await service.list(OWNER);

    const asked = query.mock.calls.map(([sql]) => sql).join('\n');
    expect(asked).not.toMatch(/\bitem_count\b/);

    const counted =
      /\(select count\(\*\)[\s\S]*?\)\s+as album_photo_count/i.exec(asked)?.[0] ?? '';
    expect(counted).toMatch(/from user_files/i);
    expect(counted).toMatch(/content_type like 'image\/%'/i);
    expect(counted).toMatch(/\.album_id\s*=\s*a\.id\b/);
    expect(asked).toMatch(/a\.user_id\s*=\s*p\.user_id/);
  });
});
