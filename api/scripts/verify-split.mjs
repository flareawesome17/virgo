/**
 * After the bucket split: does the app still serve the media that already
 * existed, and does it serve it from the right bucket?
 *
 * Signs URLs for real rows the way the app does and fetches them. Runs inside
 * the API container so credentials stay there.
 */
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

const PUBLIC = process.env.B2_BUCKET_NAME;
const PRIVATE_ = process.env.B2_MEDIA_BUCKET_NAME || PUBLIC;
const bucketForKey = (k) => (/^users\/[^/]+\/avatars\//.test(k) ? PUBLIC : PRIVATE_);

const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();
const files = (await pg.query('select key, scope from user_files order by scope, created_at')).rows;
const avatars = (await pg.query(
  'select avatar_url from users where avatar_url is not null',
)).rows;
await pg.end();

let ok = 0, bad = 0;
console.log(`checking ${files.length} tracked object(s)\n`);
for (const f of files) {
  const bucket = bucketForKey(f.key);
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: f.key }),
    { expiresIn: 300 },
  );
  const res = await fetch(url);
  const where = bucket === PUBLIC ? 'public ' : 'private';
  if (res.status === 200) ok++;
  else bad++;
  console.log(
    `  ${res.status === 200 ? 'OK  ' : 'FAIL'} ${where}  ${String(f.scope).padEnd(7)} ${f.key.slice(-28)}  ${res.status}`,
  );
}

console.log(`\navatars still reachable at their stored durable URL:`);
for (const { avatar_url } of avatars) {
  const res = await fetch(`${avatar_url}?cb=${files.length}`);
  if (res.status === 200) ok++;
  else bad++;
  console.log(`  ${res.status === 200 ? 'OK  ' : 'FAIL'} ${avatar_url.slice(-34)}  ${res.status}`);
}

console.log(`\n${bad === 0 ? `ALL ${ok} REACHABLE` : `${bad} UNREACHABLE`}`);
process.exit(bad === 0 ? 0 : 1);
