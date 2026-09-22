/**
 * Gives existing media the derivatives the confirm path makes for new uploads.
 *
 * A photograph gets whichever of these it is missing, all from ONE read of its
 * original out of B2:
 *
 *   - the 640 px grid thumbnail (migration 038), beside the original in B2
 *   - display copies at DISPLAY_WIDTHS (061), on the media volume
 *   - the inline blur preview (063), in its row
 *
 * A film gets the preview alone. The media worker makes a film's preview from
 * the poster frame it extracted, so that is what is read here as well: a small
 * WebP, not the film.
 *
 * Run inside the API container. It is the one place with everything this
 * needs: the storage credentials, the database URL, the media volume, and the
 * compiled services in dist/ that do the work.
 *
 *   docker exec virgo-api node scripts/backfill-thumbnails.mjs --dry-run
 *   docker exec virgo-api node scripts/backfill-thumbnails.mjs --limit 500
 *   docker exec virgo-api node scripts/backfill-thumbnails.mjs
 *
 * On the production host, through compose:
 *
 *   docker compose -f docker-compose.prod.yml exec api node scripts/backfill-thumbnails.mjs --dry-run
 *
 * Photographs go through ThumbnailsService.generate, the method the confirm
 * endpoint calls, rather than a copy of it. This script used to carry its own
 * sharp pipeline "kept in step" with that service, and fell out of step when
 * the service learned to make display copies and previews: running it as 061
 * and 063 instructed produced thumbnails and nothing else. Sizes, qualities,
 * the 40 MB ceiling and which widths a source earns now have one definition.
 *
 * --dry-run reads nothing out of B2 and writes nothing. It lists what each
 * file is missing and adds up what a real run would download, which is the
 * number the decision to run turns on.
 *
 * Safe to interrupt and to re-run. A file is chosen because it has no preview,
 * and its preview is recorded in the same statement as everything else made
 * from that read, so a finished file is never read again and stopping a run
 * wastes at most the file it was on. Whatever a file already has is kept, not
 * made a second time.
 *
 * A photograph that cannot be decoded is marked `failed`, as it would be on
 * upload, and sorts after everything not yet tried. It cannot hold successive
 * --limit runs in place, and they come back round to it only once nothing
 * else is left.
 *
 * Left alone, as they are on upload: originals over the 40 MB ceiling, and
 * avatars and covers — anything kept in the public bucket — which are
 * re-encoded in place rather than given derivatives. Neither has a preview,
 * so without that rule every one would be picked, and each would gain a
 * thumbnail in the public bucket and display copies that nothing ever reads.
 * Nor does this remake display copies the sweep has evicted. Eviction keeps
 * the preview, and a missing preview is what this looks for.
 *
 * --portfolio is a different question: which photographs can a public
 * profile not show? A profile shows a photograph only through its thumbnail,
 * never the original, so this mode picks every image on a portfolio, or in an
 * album a portfolio link shows, that has no thumbnail — preview or not. Those
 * are GIFs, iPhone HEICs, photographs whose thumbnail once came out no smaller
 * than the original, and originals over 40 MB. ThumbnailsService now makes a
 * thumbnail for all of them, so this runs it again:
 *
 *   - avatars are not skipped here: one already on a portfolio must keep
 *     showing;
 *   - the ceiling is 256 MB rather than 40, since this reads one file at a
 *     time in a container of its own, not on a serving API's confirm path;
 *   - a row is skipped once it has a thumbnail, not once it has a preview.
 *
 * It ends by listing every key still without a thumbnail, with its type and
 * size, and exits 1 if there is any: that is the release gate. A dry run ends
 * the same way with what it found, so its exit 1 means a real run is still
 * needed. Run it from the NEW image, before that image serves — the
 * pipeline's own migrate form:
 *
 *   $env:IMAGE_TAG='<tag>'
 *   docker compose -f docker-compose.prod.yml pull api
 *   docker compose -f docker-compose.prod.yml run --rm --no-deps api node scripts/backfill-thumbnails.mjs --portfolio --dry-run
 *   docker compose -f docker-compose.prod.yml run --rm --no-deps api node scripts/backfill-thumbnails.mjs --portfolio
 *   Remove-Item Env:IMAGE_TAG
 *
 * and once more with `exec api` after the deploy, for anything added through
 * the old API in between. See the profile pages runbook in api/README.md.
 */
import { access, constants } from 'node:fs/promises';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../dist/database/database.service.js';
import { QuotaService } from '../dist/quota/quota.service.js';
import { blurDataUrl } from '../dist/storage/blur.js';
import { MediaLinkService } from '../dist/storage/media-link.service.js';
import { StorageConfig } from '../dist/storage/storage.config.js';
import { StorageService } from '../dist/storage/storage.service.js';
import {
  MAX_SOURCE_BYTES,
  ThumbnailsService,
} from '../dist/storage/thumbnails.service.js';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const PORTFOLIO = args.includes('--portfolio');
const limitAt = args.indexOf('--limit');
const LIMIT = limitAt === -1 ? null : Number(args[limitAt + 1]);

// Strict, because a real run costs egress: a mistyped `--dryrun` would
// otherwise run for real, and `--limit 5OO` would quietly mean no limit.
const unknown = args.filter(
  (arg, i) =>
    arg !== '--dry-run' &&
    arg !== '--portfolio' &&
    arg !== '--limit' &&
    (limitAt === -1 || i !== limitAt + 1),
);
if (unknown.length || (LIMIT !== null && !(Number.isInteger(LIMIT) && LIMIT > 0))) {
  console.error(
    'usage: node scripts/backfill-thumbnails.mjs [--portfolio] [--dry-run] [--limit N]',
  );
  process.exit(2);
}

/**
 * The ceiling for --portfolio. One file at a time in a one-off container can
 * afford what a confirm request on the serving API cannot, and the largest
 * TIFF a photographer delivers is well inside it.
 */
const PORTFOLIO_MAX_SOURCE_BYTES = 256 * 1024 * 1024;
const ceiling = PORTFOLIO ? PORTFOLIO_MAX_SOURCE_BYTES : MAX_SOURCE_BYTES;

/**
 * How long ffmpeg may take over one iPhone HEIC here. A request gets fifteen
 * seconds; this reads one file at a time with nobody waiting on it, so a large
 * still that is merely slow still gets its thumbnail.
 */
const STILL_DECODE_TIMEOUT_MS = 120_000;

// The API's own services, put together by hand. Booting the API's module
// instead would also start its scheduled workers in this process, claiming
// jobs from the queue the running API is already working through.
const config = new ConfigService();
const db = new DatabaseService(config);
const storageConfig = new StorageConfig(config);
const mediaLink = new MediaLinkService(config);
const storage = new StorageService(storageConfig, new QuotaService(db), mediaLink);
const thumbs = new ThumbnailsService(storage, db, mediaLink);

const isPhoto = (row) => Boolean(row.content_type?.startsWith('image/'));
const label = (row) => row.key.slice(-32);
const mb = (bytes) => `${(bytes / 1024 ** 2).toFixed(1)} MB`;

// Everything still without a preview, newest first, since that is what is
// likeliest to be looked at. Photographs that failed before go last, so one
// that will never decode cannot hold a --limit window in place.
const everything = () =>
  db
    .query(
      `select key, content_type, size_bytes, thumb_key, display_widths, blur_data_url
         from user_files
        where blur_data_url is null
          and (content_type like 'image/%' or poster_key is not null)
        order by processing_status = 'failed', created_at desc, key desc`,
    )
    // Avatars and covers, which confirm re-encodes in place and never gives
    // derivatives. isPublicKey rather than isAvatarKey: covers are new, and
    // testing for avatars alone picked every one of them.
    .then((rows) => rows.filter((row) => !storageConfig.isPublicKey(row.key)));

// What a public profile shows, without a thumbnail: photographs on a
// portfolio, and every photograph in an album a live portfolio link shows.
// Avatars included, since one already on a portfolio has to keep showing.
const PORTFOLIO_SQL = `select f.key, f.content_type, f.size_bytes, f.thumb_key,
         f.display_widths, f.blur_data_url
    from user_files f
   where f.content_type like 'image/%'
     and f.thumb_key is null
     and (exists (select 1 from portfolio_items p
                   where p.kind = 'image' and p.file_key = f.key and p.user_id = f.user_id)
          or exists (select 1 from album_share_links l
                      where l.album_id = f.album_id and l.user_id = f.user_id
                        and l.purpose = 'portfolio' and l.revoked_at is null))
   order by f.created_at desc, f.key desc`;

const candidates = PORTFOLIO ? await db.query(PORTFOLIO_SQL) : await everything();

const backlog = candidates.filter(
  (row) => !isPhoto(row) || Number(row.size_bytes) <= ceiling,
);
const work = LIMIT ? backlog.slice(0, LIMIT) : backlog;

function describe(rows) {
  const photos = rows.filter(isPhoto);
  const bytes = photos.reduce((sum, row) => sum + Number(row.size_bytes), 0);
  return `${photos.length} photograph(s), ${mb(bytes)} to read, and ${rows.length - photos.length} film poster(s)`;
}

console.log(
  `${PORTFOLIO ? 'On a public profile without a thumbnail' : 'Without a preview'}: ${describe(backlog)}${DRY ? ' (dry run)' : ''}`,
);
if (work.length < backlog.length) {
  console.log(`This run, by --limit: ${describe(work)}`);
}
if (candidates.length > backlog.length) {
  console.log(
    `Left alone: ${candidates.length - backlog.length} photograph(s) over ${mb(ceiling)}${PORTFOLIO ? '' : ', as on upload'}`,
  );
}

/**
 * Reasons a real run must not start.
 *
 * The two media volume checks guard one trap. ThumbnailsService treats a
 * display copy it cannot write as a lost optimisation rather than a failure,
 * which is right for an upload that must not fail over one. Here it would
 * mean every photograph still gets its preview and so counts as done, is
 * never chosen again, and never gets the copies. Nothing else makes them.
 */
async function blockers() {
  const found = [];
  if (!storageConfig.isConfigured) {
    found.push('Storage is not configured (B2_*), so nothing can be read.');
  }
  if (work.some(isPhoto)) {
    if (!mediaLink.isConfigured) {
      found.push(
        'The media host is not configured (MEDIA_HOST, MEDIA_LINK_SECRET), so no display copy can be made.',
      );
    } else {
      try {
        await access(mediaLink.root, constants.W_OK);
      } catch {
        found.push(
          `The media volume, MEDIA_ROOT="${mediaLink.root}", is missing or not writable by this user. See the chown in docs/MEDIA_DELIVERY.md, phase 2.`,
        );
      }
    }
  }
  return found;
}

const stop = work.length ? await blockers() : [];
if (stop.length) {
  console.log(DRY ? '\nA real run would refuse to start:' : '\nRefusing to start:');
  for (const reason of stop) console.log(`  - ${reason}`);
  if (!DRY) {
    await db.onModuleDestroy();
    process.exit(1);
  }
}
if (work.length) console.log('');

/** The row as it is now. The list above was read once, and a run is long. */
function current(key) {
  return db.queryOne(
    `select thumb_key, display_widths, blur_data_url, poster_key, processing_status
       from user_files
      where key = $1`,
    [key],
  );
}

/** What a file lacks, which is what a real run will try to make. */
function missing(row) {
  if (!isPhoto(row)) return 'preview, from the poster';
  // A GIF's thumbnail is animated. It gets no display copy, on upload or
  // here: one would be a still, opened in place of the motion.
  const gif = row.content_type === 'image/gif';
  const lacks = [];
  if (!row.thumb_key) lacks.push(gif ? 'animated thumbnail' : 'thumbnail');
  if (!gif && !row.display_widths?.length) lacks.push('display copies');
  if (!row.blur_data_url) lacks.push('preview');
  return `${lacks.join(', ')}  (${row.content_type}, ${mb(Number(row.size_bytes))})`;
}

let read = 0;
let thumbnails = 0;
let displayed = 0;
let previews = 0;
let failed = 0;
let skipped = 0;

async function photograph(row) {
  const before = await current(row.key);
  // Deleted, or finished by its own confirm, since the list was read. For
  // --portfolio, finished means it has a thumbnail, which a preview says
  // nothing about.
  const done = PORTFOLIO ? before?.thumb_key : before?.blur_data_url;
  if (!before || done) {
    skipped++;
    const why = !before ? 'deleted' : PORTFOLIO ? 'already has a thumbnail' : 'already has a preview';
    return `  skip  ${label(row)}  ${why}`;
  }

  await thumbs.generate(
    row.key,
    row.content_type,
    Number(row.size_bytes),
    PORTFOLIO
      ? { displayWidths: before.display_widths, blurDataUrl: before.blur_data_url }
      : { thumbKey: before.thumb_key, displayWidths: before.display_widths },
    { maxSourceBytes: ceiling, stillDecodeTimeoutMs: STILL_DECODE_TIMEOUT_MS },
  );
  read++;

  // generate never throws. It records a failure as the row's status and
  // logs the reason as a warning, which lands just above this line.
  const after = await current(row.key);
  if (!after) {
    skipped++;
    return `  skip  ${label(row)}  deleted while it was being read`;
  }
  if (after.processing_status === 'failed') {
    failed++;
    return `  FAIL  ${label(row)}  see the warning above`;
  }

  const made = [];
  if (!before.thumb_key && after.thumb_key) {
    thumbnails++;
    made.push('thumbnail');
  }
  if (!before.display_widths?.length && after.display_widths?.length) {
    displayed++;
    made.push(after.display_widths.join('+'));
  }
  if (!before.blur_data_url && after.blur_data_url) {
    previews++;
    made.push('preview');
  }
  return `  ok    ${label(row)}  ${made.join(', ') || 'nothing could be made'}`;
}

async function film(row) {
  const before = await current(row.key);
  if (!before?.poster_key || before.blur_data_url) {
    skipped++;
    const why = !before ? 'deleted' : before.blur_data_url ? 'already has a preview' : 'no poster';
    return `  skip  ${label(row)}  ${why}`;
  }

  const chunks = [];
  for await (const chunk of await storage.readStream(before.poster_key)) chunks.push(chunk);
  read++;

  const blur = await blurDataUrl(Buffer.concat(chunks));
  if (!blur) {
    failed++;
    return `  FAIL  ${label(row)}  the poster would not decode`;
  }
  // Keeps one the media worker may have written since.
  await db.query(
    'update user_files set blur_data_url = coalesce(blur_data_url, $2) where key = $1',
    [row.key, blur],
  );
  previews++;
  return `  ok    ${label(row)}  preview, from the poster`;
}

for (const row of work) {
  if (DRY) {
    console.log(`  plan  ${label(row)}  ${missing(row)}`);
    continue;
  }
  try {
    console.log(isPhoto(row) ? await photograph(row) : await film(row));
  } catch (err) {
    console.log(`  FAIL  ${label(row)}  ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

console.log(
  DRY
    ? '\nDry run: nothing was read or written.'
    : `\nread=${read} thumbnails=${thumbnails} display=${displayed} previews=${previews} failed=${failed} skipped=${skipped}`,
);

// The gate: every photograph a public profile still leaves out, each one a
// tile missing from somebody's page, by full key with its type and size, and
// exit 1 while there is any. After a real run the list is read again rather
// than tallied, so a photograph added while this ran, or one over the ceiling
// that was never tried, is counted too. A dry run changed nothing, so its
// list is the one it started from, and its exit 1 says a real run is still
// needed.
if (PORTFOLIO) {
  const left = DRY ? candidates : await db.query(PORTFOLIO_SQL);
  if (left.length) {
    console.log(
      `\n${DRY ? 'Without' : 'Still without'} a thumbnail on a public profile: ${left.length}`,
    );
    for (const row of left) {
      const size = Number(row.size_bytes);
      const never = size > ceiling ? `  (over ${mb(ceiling)}, never read)` : '';
      console.log(`  ${row.key}  ${row.content_type}  ${mb(size)}${never}`);
    }
    await db.onModuleDestroy();
    process.exit(1);
  }
  console.log('\nEvery photograph on a public profile has a thumbnail.');
}
await db.onModuleDestroy();
