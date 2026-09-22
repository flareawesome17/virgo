import type { AlbumShareService } from '../albums/share/album-share.service';
import type { DatabaseService } from '../database/database.service';
import type { MediaLinkService } from '../storage/media-link.service';
import {
  DOWNLOAD_URL_TTL_SECONDS,
  PUBLISHED_URL_TTL_SECONDS,
} from '../storage/storage.config';
import type { StorageService } from '../storage/storage.service';
import { MAX_SOURCE_BYTES, type ThumbnailsService } from '../storage/thumbnails.service';
import { PortfolioService, type PortfolioItem } from './portfolio.service';

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
 * Since profile pages, a public payload carries no original at all: a single
 * photograph is its thumbnail, and one without a thumbnail is left out. The
 * owner's own editor alone still falls back to the original.
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
  display_widths?: number[] | null;
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
function profileOf(
  { images = [], albums = [], files = [] }: Profile,
  {
    unsignable = [],
    madeThumbnail = 'thumb',
  }: {
    /** Keys the fake signer cannot sign, as with storage unconfigured. */
    unsignable?: string[];
    /** What generate returns when addImage asks for a missing thumbnail. */
    madeThumbnail?: string | null;
  } = {},
) {
  const imageRows = images.map((image, i) => ({
    id: `image-${i}`,
    kind: 'image' as const,
    file_key: image.key,
    album_id: null,
    caption: null,
    image_thumb_key: image.thumb_key,
    image_display_widths: image.display_widths ?? null,
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
      image_thumb_key: null,
      image_display_widths: null,
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

  // The list query, as its SQL reads: on the public list a photograph with no
  // thumbnail does not come back at all. Applied only when the query carries
  // the filter, so a query that lost it would put that photograph on the page.
  const PUBLIC_FILTER = '($2::boolean or f.thumb_key is not null)';
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    if (!sql.includes('from portfolio_items')) return [];
    const forOwner = params[1] === true;
    const shown = sql.includes(PUBLIC_FILTER)
      ? imageRows.filter((row) => forOwner || row.image_thumb_key !== null)
      : imageRows;
    return [...shown, ...albumRows];
  });
  /** The file addImage reads, by key. */
  const everyFile = [...images, ...files];
  const queryOne = jest.fn(async (sql: string, params: unknown[] = []) => {
    if (/from user_files where key = \$1 and user_id = \$2/.test(sql)) {
      const file = everyFile.find((f) => f.key === params[0]);
      return file
        ? {
            content_type: file.content_type,
            size_bytes: String(sizes.get(file.key) ?? 4_000_000),
            thumb_key: file.thumb_key,
            display_widths: file.display_widths ?? null,
            blur_data_url: null,
          }
        : null;
    }
    if (/count\(\*\)::text as count from portfolio_items/.test(sql)) return { count: '0' };
    if (/coalesce\(max\(position\), -1\) \+ 1/.test(sql)) return { next: '0' };
    if (/count\(\*\)::int as n/.test(sql)) return { n: 1 };
    return null;
  });
  const db = { query, queryOne } as unknown as DatabaseService;

  const mediaUrl = jest.fn(
    async (key: string | null | undefined, ttl = DOWNLOAD_URL_TTL_SECONDS) =>
      key && !unsignable.includes(key) ? `https://media.test/${key}?ttl=${ttl}` : null,
  );
  const storage = { mediaUrl } as unknown as StorageService;

  const shares = {
    urlFor: (token: string) => `https://share.test/${token}`,
  } as unknown as AlbumShareService;

  const displaySources = jest.fn(
    (key: string, widths: readonly number[] | null | undefined, ttl?: number) =>
      (widths ?? []).map((width) => ({ width, url: `https://copies.test/${key}-${width}?ttl=${ttl}` })),
  );
  const mediaLink = { displaySources } as unknown as MediaLinkService;

  const generate = jest.fn(async () => madeThumbnail);
  const thumbs = { generate } as unknown as ThumbnailsService;

  return {
    service: new PortfolioService(db, storage, shares, mediaLink, thumbs),
    query,
    queryOne,
    mediaUrl,
    displaySources,
    generate,
  };
}

/** Stated sizes for addImage, by key; anything else is 4 MB. */
const sizes = new Map<string, number>();

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

  it('shows no album cover rather than an original', async () => {
    // A photograph with no thumbnail used to be signed whole for the card:
    // a camera file, EXIF and all, on a public page. Now the card draws its
    // placeholder until there is a thumbnail.
    const fresh = photo('wedding', 'just-uploaded', { thumbnail: false });
    const { service, mediaUrl } = profileOf({ albums: [album('wedding')], files: [fresh] });

    await expect(coversOf(service)).resolves.toEqual([null]);
    expect(mediaUrl).not.toHaveBeenCalledWith(fresh.key, expect.anything());
  });

  it("keeps a cover stored as a URL for the owner's editor, and off the public page", async () => {
    // Served verbatim in the editor, ahead of the stand-in, as the app's own
    // cards do. It predates thumbnails and can point at an original, so the
    // public card never uses it. An album with nothing to show has no cover.
    const stored = `https://cdn.virgo.ph/users/${OWNER}/covers/wedding.jpg`;
    const reception = photo('wedding', 'reception');
    const { service } = profileOf({
      albums: [album('wedding', { coverUrl: stored }), album('empty')],
      files: [reception],
    });

    await expect(coversOf(service)).resolves.toEqual([published(reception.thumb_key), null]);
    const owner = await service.list(OWNER, { forOwner: true });
    expect(owner.flatMap((item) => (item.kind === 'album' ? [item.coverUrl] : []))).toEqual([
      stored,
      null,
    ]);
  });

  it("falls back to the original only in the owner's editor", async () => {
    const fresh = photo('wedding', 'just-uploaded', { thumbnail: false });
    const { service } = profileOf({ albums: [album('wedding')], files: [fresh] });

    const owner = await service.list(OWNER, { forOwner: true });
    expect(owner.flatMap((item) => (item.kind === 'album' ? [item.coverUrl] : []))).toEqual([
      published(fresh.key),
    ]);
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

    // A single photograph is its thumbnail, never the original.
    expect(items[0]).toMatchObject({ kind: 'image', url: published(solo.thumb_key) });
    expect(mediaUrl).toHaveBeenCalled();
    for (const [, ttl] of mediaUrl.mock.calls) {
      expect(ttl).toBe(PUBLISHED_URL_TTL_SECONDS);
    }
  });
});

/**
 * A single photograph on a profile.
 *
 * It used to be signed from the original, because a thumbnail looked soft on
 * the web's tiles. That sent every visitor the camera file, EXIF and GPS
 * included. The public list now carries the 640 px thumbnail and the media
 * host's copies, and leaves out a photograph that has neither.
 */
describe('PortfolioService photographs', () => {
  it('shows a photograph as its thumbnail, with exactly the public keys', async () => {
    const solo = { ...photo(null, 'portrait'), display_widths: [1024, 2048] };
    const { service, displaySources } = profileOf({ images: [solo] });

    const [item] = await service.list(OWNER);

    expect(item).toEqual({
      id: 'image-0',
      kind: 'image',
      url: published(solo.thumb_key),
      caption: null,
      displaySources: displaySources(solo.key, [1024, 2048], PUBLISHED_URL_TTL_SECONDS),
    });
    expect(Object.keys(item).sort()).toEqual(['caption', 'displaySources', 'id', 'kind', 'url']);
    expect(displaySources).toHaveBeenCalledWith(solo.key, [1024, 2048], PUBLISHED_URL_TTL_SECONDS);
  });

  it('never signs an original for the public list', async () => {
    const solo = photo(null, 'portrait');
    const bare = photo(null, 'unthumbnailed', { thumbnail: false });
    const { service, mediaUrl } = profileOf({
      images: [solo, bare],
      albums: [album('wedding')],
      files: [photo('wedding', 'reception', { thumbnail: false })],
    });

    await service.list(OWNER);

    for (const [key] of mediaUrl.mock.calls) {
      expect(String(key)).not.toMatch(/\.jpg$/);
    }
  });

  it('leaves a photograph without a thumbnail off the public list, in SQL', async () => {
    const solo = photo(null, 'portrait');
    const bare = photo(null, 'unthumbnailed', { thumbnail: false });
    const { service, query } = profileOf({ images: [solo, bare] });

    const items = await service.list(OWNER);

    expect(items.map((item) => item.id)).toEqual(['image-0']);
    const [sql, params] = query.mock.calls[0];
    expect(params).toEqual([OWNER, false]);
    expect(sql).toContain('($2::boolean or f.thumb_key is not null)');
  });

  it('leaves out a photograph whose thumbnail cannot be signed, rather than send an empty url', async () => {
    const solo = photo(null, 'portrait');
    const other = photo(null, 'other');
    const { service } = profileOf({ images: [solo, other] }, { unsignable: [solo.thumb_key!] });

    const items = await service.list(OWNER);

    expect(items.map((item) => item.id)).toEqual(['image-1']);
  });

  it('gives the owner every photograph, saying which ones the public page leaves out', async () => {
    const solo = photo(null, 'portrait');
    const bare = photo(null, 'unthumbnailed', { thumbnail: false });
    const { service, query } = profileOf({ images: [solo, bare] });

    const items = await service.list(OWNER, { forOwner: true });

    expect(query.mock.calls[0][1]).toEqual([OWNER, true]);
    expect(items).toEqual([
      expect.objectContaining({
        url: published(solo.thumb_key),
        fileKey: solo.key,
        publiclyShown: true,
      }),
      // The original, so the owner can still recognise it and take it off.
      expect.objectContaining({
        url: published(bare.key),
        fileKey: bare.key,
        publiclyShown: false,
      }),
    ]);
  });

  it('counts what the public page leaves out, photographs with no thumbnail', async () => {
    const { service, queryOne } = profileOf({});

    await expect(service.hiddenCount(OWNER)).resolves.toBe(1);

    const [sql, params] = queryOne.mock.calls[0];
    expect(params).toEqual([OWNER]);
    expect(sql).toMatch(/p\.kind = 'image'/);
    expect(sql).toMatch(/f\.thumb_key is null/);
    expect(sql).toMatch(/f\.user_id = p\.user_id/);
  });

  it("answers an empty reorder with the owner's list", async () => {
    // The editor's cache is written from this response; the public list
    // would drop the keys it matches on and every photograph it leaves out.
    const bare = photo(null, 'unthumbnailed', { thumbnail: false });
    const { service, query } = profileOf({ images: [bare] });

    const items: PortfolioItem[] = await service.reorder(OWNER, []);

    expect(query.mock.calls[0][1]).toEqual([OWNER, true]);
    expect(items).toEqual([expect.objectContaining({ fileKey: bare.key, publiclyShown: false })]);
  });
});

describe('PortfolioService.addImage', () => {
  const inserted = (query: jest.Mock) =>
    query.mock.calls.filter(([sql]) => /insert into portfolio_items/.test(sql));

  it('makes a thumbnail for a photograph that has none, then adds it', async () => {
    const gif = { ...photo(null, 'loop', { thumbnail: false }), content_type: 'image/gif' };
    const { service, generate, query } = profileOf({ images: [gif] });

    await service.addImage(OWNER, gif.key);

    expect(generate).toHaveBeenCalledWith(gif.key, 'image/gif', 4_000_000, {
      displayWidths: null,
      blurDataUrl: null,
    });
    expect(inserted(query)).toHaveLength(1);
  });

  it('adds a photograph that already has one without making another', async () => {
    const solo = photo(null, 'portrait');
    const { service, generate, query } = profileOf({ images: [solo] });

    await service.addImage(OWNER, solo.key);

    expect(generate).not.toHaveBeenCalled();
    expect(inserted(query)).toHaveLength(1);
  });

  it('refuses one no web copy can be made of, with a sentence to act on', async () => {
    const heic = { ...photo(null, 'IMG_0001', { thumbnail: false }), content_type: 'image/heic' };
    const { service, query } = profileOf({ images: [heic] }, { madeThumbnail: null });

    await expect(service.addImage(OWNER, heic.key)).rejects.toEqual(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'PORTFOLIO_NO_WEB_COPY',
          message: "That photo can't be shown on your profile. Try a JPEG or PNG copy of it.",
        }),
      }),
    );
    expect(inserted(query)).toHaveLength(0);
  });

  it('refuses one too large to read, without trying', async () => {
    const tiff = { ...photo(null, 'master', { thumbnail: false }), content_type: 'image/tiff' };
    sizes.set(tiff.key, MAX_SOURCE_BYTES + 1);
    const { service, generate, query } = profileOf({ images: [tiff] });

    await expect(service.addImage(OWNER, tiff.key)).rejects.toEqual(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'PORTFOLIO_TOO_LARGE' }),
      }),
    );
    expect(generate).not.toHaveBeenCalled();
    expect(inserted(query)).toHaveLength(0);
  });

  it.each(['avatars', 'covers'])('refuses a key from %s before reading anything', async (scope) => {
    // Both belong to the profile: changing either deletes the object, and a
    // tile made from one would vanish with it.
    const { service, queryOne } = profileOf({});

    await expect(
      service.addImage(OWNER, `users/${OWNER}/${scope}/2026/09/me.webp`),
    ).rejects.toThrow('Choose a photo from your uploads.');
    expect(queryOne).not.toHaveBeenCalled();
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
