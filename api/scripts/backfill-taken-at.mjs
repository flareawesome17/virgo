/**
 * Reads capture dates for media uploaded before migration 064.
 *
 * Run inside the API container, which holds the storage credentials, the
 * database URL, ffprobe and the compiled parser:
 *
 *   docker exec virgo-api node scripts/backfill-taken-at.mjs
 *   docker exec virgo-api node scripts/backfill-taken-at.mjs --dry-run
 *   docker exec virgo-api node scripts/backfill-taken-at.mjs --limit 500
 *
 * Photographs: JPEG and TIFF are dated from their first 256 KB, a ranged read
 * rather than the whole file. Other formats (HEIC, PNG, WebP, AVIF) keep their
 * EXIF where only a decoder finds it, so those are read whole — up to the same
 * 40 MB ceiling uploads use — and handed to sharp.
 *
 * Films: ffprobe reads the container's tags over a signed URL, fetching only
 * what it needs.
 *
 * Safe to interrupt and to re-run: only rows still missing a date are read. A
 * file that genuinely has no date stays null and is read again next time,
 * which is why --limit exists.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import pg from 'pg';
import sharp from 'sharp';
import {
  takenAtFromExif,
  takenAtFromHead,
  takenAtFromVideoTags,
} from '../dist/storage/capture-time.js';

const run = promisify(execFile);
const DRY = process.argv.includes('--dry-run');
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : null;

// Kept in step with ThumbnailsService.
const HEAD_BYTES = 256 * 1024;
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

const endpointRaw = process.env.B2_ENDPOINT ?? '';
const endpoint = endpointRaw.startsWith('http') ? endpointRaw : `https://${endpointRaw}`;
const s3 = new S3Client({
  endpoint,
  region: process.env.B2_REGION,
  credentials: {
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APPLICATION_KEY,
  },
});

const AVATARS = /^users\/[^/]+\/avatars\//;
const bucketFor = (key) =>
  AVATARS.test(key) ? process.env.B2_BUCKET_NAME : process.env.B2_MEDIA_BUCKET_NAME;

async function read(key, bytes) {
  const obj = await s3.send(
    new GetObjectCommand({
      Bucket: bucketFor(key),
      Key: key,
      ...(bytes ? { Range: `bytes=0-${bytes - 1}` } : {}),
    }),
  );
  const chunks = [];
  for await (const chunk of obj.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function photoDate(row) {
  const type = row.content_type;
  if (type === 'image/jpeg' || type === 'image/tiff') {
    return takenAtFromHead(await read(row.key, HEAD_BYTES));
  }
  if (Number(row.size_bytes) > MAX_SOURCE_BYTES) return null;
  const { exif } = await sharp(await read(row.key), { failOn: 'none' }).metadata();
  return takenAtFromExif(exif);
}

async function filmDate(row) {
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucketFor(row.key), Key: row.key }),
    { expiresIn: 600 },
  );
  const { stdout } = await run(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format_tags', '-of', 'json', url],
    { maxBuffer: 2 * 1024 * 1024, timeout: 120_000 },
  );
  return takenAtFromVideoTags(JSON.parse(stdout).format?.tags);
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const { rows } = await db.query(
  `select key, content_type, size_bytes
     from user_files
    where taken_at is null
      and album_id is not null
      and (content_type like 'image/%' or content_type like 'video/%')
    order by created_at desc
    ${LIMIT ? `limit ${Math.max(1, Math.floor(LIMIT))}` : ''}`,
);

console.log(`${rows.length} file(s) without a capture date${DRY ? ' (dry run)' : ''}`);

let dated = 0;
let undated = 0;
let failed = 0;

for (const row of rows) {
  const label = row.key.slice(-32);
  try {
    const takenAt = row.content_type.startsWith('video/')
      ? await filmDate(row)
      : await photoDate(row);
    if (!takenAt) {
      console.log(`  none  ${label}`);
      undated++;
      continue;
    }
    if (!DRY) {
      await db.query(
        'update user_files set taken_at = $2::timestamp where key = $1 and taken_at is null',
        [row.key, takenAt],
      );
    }
    console.log(`  ok    ${label}  ${takenAt}`);
    dated++;
  } catch (err) {
    console.log(`  FAIL  ${label}  ${err.message}`);
    failed++;
  }
}

console.log(`\ndated=${dated} undated=${undated} failed=${failed}`);
await db.end();
