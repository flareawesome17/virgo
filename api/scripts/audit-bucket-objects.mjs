/**
 * Classifies everything in the source bucket before anything is moved.
 *
 * The rule that matters is not "which scope is this" but "does any durable URL
 * in the database point at it". A row storing `https://cdn…/<key>` keeps
 * resolving only while that key stays in the public bucket, so those objects
 * must stay put and everything else can move behind signed URLs.
 *
 * Reports only; changes nothing.
 */
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Client } from 'pg';

const endpoint = /^https?:\/\//.test(process.env.B2_ENDPOINT ?? '')
  ? process.env.B2_ENDPOINT
  : `https://${process.env.B2_ENDPOINT}`;

const s3 = new S3Client({
  endpoint,
  region: process.env.B2_REGION,
  credentials: {
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APPLICATION_KEY,
  },
  forcePathStyle: process.env.B2_FORCE_PATH_STYLE === 'true',
});

const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

const tracked = new Set(
  (await pg.query('select key from user_files')).rows.map((r) => r.key),
);

// Every column that stores a whole URL rather than a key.
const urlRows = await pg.query(`
  select avatar_url as url from users where avatar_url is not null
  union all select friend_avatar_url from friends where friend_avatar_url is not null
  union all select avatar_url from collaborators where avatar_url is not null
  union all select cover_url from albums where cover_url is not null
`);

/** The object key a stored URL points at, or null if it is not ours. */
function keyFromUrl(url) {
  try {
    return decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '') || null;
  } catch {
    return null;
  }
}

const pinned = new Set();
for (const { url } of urlRows.rows) {
  const k = keyFromUrl(url);
  if (k) pinned.add(k);
}
await pg.end();

const objects = [];
let token;
do {
  const page = await s3.send(
    new ListObjectsV2Command({ Bucket: process.env.B2_BUCKET_NAME, ContinuationToken: token }),
  );
  objects.push(...(page.Contents ?? []));
  token = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (token);

const inBucket = new Set(objects.map((o) => o.Key));
const stay = objects.filter((o) => pinned.has(o.Key));
const move = objects.filter((o) => !pinned.has(o.Key));
const mb = (l) => (l.reduce((n, o) => n + (o.Size ?? 0), 0) / 1024 ** 2).toFixed(1);

console.log(`objects in bucket        : ${objects.length}  (${mb(objects)} MB)`);
console.log(`rows in user_files       : ${tracked.size}`);
console.log(`keys pinned by a URL row : ${pinned.size}\n`);
console.log(`  STAY public (pinned)   ${String(stay.length).padStart(3)}  ${mb(stay)} MB`);
console.log(`  MOVE to private        ${String(move.length).padStart(3)}  ${mb(move)} MB`);
console.log(`    of which tracked     ${String(move.filter((o) => tracked.has(o.Key)).length).padStart(3)}`);
console.log(`    of which orphaned    ${String(move.filter((o) => !tracked.has(o.Key)).length).padStart(3)}`);

const dangling = [...pinned].filter((k) => !inBucket.has(k));
if (dangling.length) {
  console.log(`\n  WARNING: ${dangling.length} URL row(s) point at an object that is not in the bucket:`);
  for (const k of dangling.slice(0, 5)) console.log(`    ${k.slice(0, 78)}`);
}

console.log('\n  pinned keys:');
for (const o of stay) console.log(`    ${o.Key.slice(0, 78)}  ${(o.Size / 1024).toFixed(0)} KB`);
