/**
 * Re-encodes profile photographs that were stored before every avatar was.
 *
 *   docker compose -f docker-compose.prod.yml exec api node scripts/reencode-old-avatars.mjs --dry-run
 *   docker compose -f docker-compose.prod.yml exec api node scripts/reencode-old-avatars.mjs
 *
 * ── Why ──────────────────────────────────────────────────────────────────────
 *
 * An avatar used to be re-encoded only when it was larger than 512 px. A photo
 * already smaller than that was stored exactly as the camera wrote it — which
 * means the EXIF is still on it, GPS included, on a picture shown on every
 * public profile. v1.12.17 made the re-encode unconditional, so everything
 * uploaded since is clean; these are the ones from before.
 *
 * Check (f) of the profile-pages runbook is what finds them:
 *
 *   select content_type, count(*) from user_files
 *    where key ~ '^users/[^/]+/avatars/' and content_type <> 'image/webp'
 *    group by 1;
 *
 * ── The bucket setting matters ───────────────────────────────────────────────
 *
 * normaliseAvatar rewrites the object under its own key. On a bucket that
 * keeps every version that HIDES the original rather than destroying it, and
 * the camera file survives as a prior version — so running this would achieve
 * nothing but a second copy. Both buckets were set to keep only the last
 * version on 2026-09-22; scripts/check-bucket-access.mjs prints the current
 * setting, and it is worth reading before this is run.
 *
 * ── What it does not touch ───────────────────────────────────────────────────
 *
 * Covers. They are already re-encoded on confirm and have been since they
 * existed, so there is no older shape of them to fix.
 */
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../dist/database/database.service.js';
import { QuotaService } from '../dist/quota/quota.service.js';
import { MediaLinkService } from '../dist/storage/media-link.service.js';
import { StorageConfig } from '../dist/storage/storage.config.js';
import { StorageService } from '../dist/storage/storage.service.js';
import { ThumbnailsService } from '../dist/storage/thumbnails.service.js';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const unknown = args.filter((a) => a !== '--dry-run');
if (unknown.length) {
  console.error('usage: node scripts/reencode-old-avatars.mjs [--dry-run]');
  process.exit(2);
}

const config = new ConfigService();
const db = new DatabaseService(config);
const storageConfig = new StorageConfig(config);
const mediaLink = new MediaLinkService(config);
const storage = new StorageService(storageConfig, new QuotaService(db), mediaLink);
const thumbs = new ThumbnailsService(storage, db, mediaLink);

/**
 * Every avatar that is not already a WebP.
 *
 * WebP is what normaliseAvatar writes, so anything else predates the
 * unconditional re-encode. Joined to nothing: an avatar row whose account is
 * gone has already been swept, and one whose owner still exists is the case
 * that matters.
 */
const CANDIDATES = `
  select key, user_id, content_type, size_bytes
    from user_files
   where key ~ '^users/[^/]+/avatars/'
     and content_type is not null
     and content_type <> 'image/webp'
   order by key
`;

const rows = await db.query(CANDIDATES);
console.log(
  `${rows.length} profile photograph(s) still stored as uploaded` + (DRY ? ' (dry run)' : ''),
);
for (const row of rows) {
  console.log(`  ${row.content_type.padEnd(12)} ${row.key}`);
}

if (DRY) {
  console.log('\nDry run: nothing was read or written.');
  await db.onModuleDestroy();
  process.exit(0);
}

let done = 0;
let failed = 0;

for (const row of rows) {
  // normaliseAvatar is idempotent and never throws: it returns what is stored,
  // or null when it declined. A null here is a photograph sharp could not read
  // at all, which is worth naming rather than counting.
  const made = await thumbs.normaliseAvatar(row.key, row.content_type, Number(row.size_bytes));
  if (made) {
    done++;
    console.log(`  rewrote ${row.key} -> ${made.contentType} ${made.size} bytes`);
  } else {
    failed++;
    console.error(`  could not re-encode ${row.key} (${row.content_type})`);
  }
}

console.log(`\nrewritten=${done} failed=${failed}`);

const left = await db.query(CANDIDATES);
if (left.length > 0) {
  console.log(`${left.length} still not WebP — those are the ones that failed above.`);
}

await db.onModuleDestroy();
process.exit(failed > 0 ? 1 : 0);
