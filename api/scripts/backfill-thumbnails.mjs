/**
 * Makes thumbnails for images uploaded before thumbnails existed.
 *
 * Run inside the API container, which already holds the storage credentials
 * and the database URL:
 *
 *   docker exec virgo-api node scripts/backfill-thumbnails.mjs
 *   docker exec virgo-api node scripts/backfill-thumbnails.mjs --dry-run
 *
 * Idempotent: rows that already have a `thumb_key` are skipped, so it is safe
 * to run repeatedly and safe to interrupt. Also worth running after any spell
 * where storage was unreachable and confirms fell back to no thumbnail.
 */
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import pg from 'pg';
import sharp from 'sharp';

const DRY = process.argv.includes('--dry-run');

// Kept in step with ThumbnailsService. Divergence would mean the backfill
// writes thumbnails that look different from the ones uploads produce.
const THUMB_EDGE = 640;
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

const endpointRaw = process.env.B2_ENDPOINT ?? '';
const endpoint = endpointRaw.startsWith('http')
  ? endpointRaw
  : `https://${endpointRaw}`;

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
  AVATARS.test(key)
    ? process.env.B2_BUCKET_NAME
    : process.env.B2_MEDIA_BUCKET_NAME;

const thumbKeyFor = (key) => `${key.replace(/\.[^./]+$/, '')}-thumb.webp`;

async function readAll(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const { rows } = await db.query(
  `select key, content_type, size_bytes
     from user_files
    where thumb_key is null
      and content_type like 'image/%'
      and content_type <> 'image/gif'
    order by created_at desc`,
);

console.log(`${rows.length} image(s) without a thumbnail${DRY ? ' (dry run)' : ''}`);

let made = 0;
let skipped = 0;
let failed = 0;

for (const row of rows) {
  const size = Number(row.size_bytes);
  if (size > MAX_SOURCE_BYTES) {
    console.log(`  skip  ${row.key.slice(-28)}  (${Math.round(size / 1024 ** 2)} MB, too large)`);
    skipped++;
    continue;
  }

  try {
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: bucketFor(row.key), Key: row.key }),
    );
    const body = await sharp(await readAll(obj.Body), { failOn: 'none' })
      .rotate()
      .resize(THUMB_EDGE, THUMB_EDGE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();

    if (body.length >= size) {
      console.log(`  skip  ${row.key.slice(-28)}  (thumbnail would be larger)`);
      skipped++;
      continue;
    }

    const thumbKey = thumbKeyFor(row.key);
    if (!DRY) {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucketFor(thumbKey),
          Key: thumbKey,
          Body: body,
          ContentType: 'image/webp',
        }),
      );
      await db.query('update user_files set thumb_key = $2 where key = $1', [
        row.key,
        thumbKey,
      ]);
    }
    const saved = Math.round((1 - body.length / size) * 100);
    console.log(
      `  ok    ${row.key.slice(-28)}  ${Math.round(size / 1024)} kB -> ${Math.round(body.length / 1024)} kB  (-${saved}%)`,
    );
    made++;
  } catch (err) {
    console.log(`  FAIL  ${row.key.slice(-28)}  ${err.message}`);
    failed++;
  }
}

console.log(`\nmade=${made} skipped=${skipped} failed=${failed}`);
await db.end();
