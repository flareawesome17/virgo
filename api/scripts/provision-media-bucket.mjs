/**
 * Creates the private media bucket and moves existing album objects into it.
 *
 * Runs inside the API container so the B2 credentials are read from its
 * environment and never leave it.
 *
 * Idempotent: creating a bucket that already exists is treated as success, and
 * an object already present at the destination is not copied again.
 *
 *   node scripts/provision-media-bucket.mjs            # report only
 *   node scripts/provision-media-bucket.mjs --apply    # create + copy
 *   node scripts/provision-media-bucket.mjs --apply --purge-source
 */
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

const APPLY = process.argv.includes('--apply');
const PURGE = process.argv.includes('--purge-source');

const SOURCE = process.env.B2_BUCKET_NAME;
const TARGET = process.env.B2_MEDIA_BUCKET_NAME || 'virgo-prod-media';

// Backblaze shows the endpoint as a bare host; the SDK needs a URL. Same
// normalisation StorageConfig does, so this script talks to the same place.
const endpoint = /^https?:\/\//.test(process.env.B2_ENDPOINT ?? '')
  ? process.env.B2_ENDPOINT
  : `https://${process.env.B2_ENDPOINT}`;

const client = new S3Client({
  endpoint,
  region: process.env.B2_REGION,
  credentials: {
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APPLICATION_KEY,
  },
  forcePathStyle: process.env.B2_FORCE_PATH_STYLE === 'true',
});

const log = (...a) => console.log(...a);

async function bucketExists(name) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: name }));
    return true;
  } catch (err) {
    const code = err?.$metadata?.httpStatusCode;
    if (code === 404) return false;
    if (code === 403) return 'forbidden';
    throw err;
  }
}

log(`source bucket : ${SOURCE}`);
log(`target bucket : ${TARGET}`);
log(`mode          : ${APPLY ? (PURGE ? 'apply + purge source' : 'apply') : 'report only'}\n`);

// --- 1. does the target exist, and may this key make it? -------------------
let exists = await bucketExists(TARGET);
log(`target exists : ${exists}`);

if (exists === false && APPLY) {
  try {
    await client.send(new CreateBucketCommand({ Bucket: TARGET }));
    log('created       : yes (private by default — S3 CreateBucket grants no public read)');
    exists = true;
  } catch (err) {
    log(`created       : NO — ${err?.name}: ${String(err?.message).slice(0, 160)}`);
    log('\nThe application key is probably scoped to one bucket. Create the');
    log(`bucket "${TARGET}" in the Backblaze console as PRIVATE, then re-run.`);
    process.exit(2);
  }
} else if (exists === 'forbidden') {
  log('\nHEAD refused: the key cannot see this bucket. Either the name is taken');
  log('by another account, or the key is scoped to the source bucket only.');
  process.exit(2);
}

// --- 2. which objects need to move? ----------------------------------------
// Avatars stay: they are stored as whole URLs in users.avatar_url and
// denormalised into friends/collaborators, and a URL in a database has to keep
// resolving. Everything else moves, including the objects with no user_files
// row — there are thirty of those, and leaving them behind would leave 400 MB
// of somebody's photographs publicly readable, which is the thing being fixed.
//
// Matches StorageConfig.bucketForKey exactly. If these two ever disagree the
// app looks in the wrong bucket and every affected image 404s.
const IS_AVATAR = /^users\/[^/]+\/avatars\//;

const toMove = [];
let token;
do {
  const page = await client.send(
    new ListObjectsV2Command({ Bucket: SOURCE, ContinuationToken: token }),
  );
  for (const obj of page.Contents ?? []) {
    if (!IS_AVATAR.test(obj.Key)) toMove.push({ key: obj.Key, size: obj.Size });
  }
  token = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (token);

log(`\nobjects to move: ${toMove.length}`);
for (const o of toMove.slice(0, 5)) log(`  ${o.key}  (${o.size} bytes)`);
if (toMove.length > 5) log(`  … and ${toMove.length - 5} more`);

if (!APPLY) {
  log('\nReport only. Re-run with --apply to create and copy.');
  process.exit(0);
}

// --- 3. copy ---------------------------------------------------------------
let copied = 0, skipped = 0, failed = 0;
for (const { key } of toMove) {
  try {
    try {
      await client.send(new HeadObjectCommand({ Bucket: TARGET, Key: key }));
      skipped++;
      continue;
    } catch (err) {
      if (err?.$metadata?.httpStatusCode !== 404) throw err;
    }
    await client.send(
      new CopyObjectCommand({
        Bucket: TARGET,
        Key: key,
        CopySource: `/${SOURCE}/${key}`,
      }),
    );
    copied++;
  } catch (err) {
    failed++;
    log(`  FAILED ${key}: ${err?.name}: ${String(err?.message).slice(0, 120)}`);
  }
}
log(`\ncopied ${copied}, already present ${skipped}, failed ${failed}`);

// --- 4. verify every object landed before removing anything ----------------
let verified = 0;
for (const { key } of toMove) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: TARGET, Key: key }));
    verified++;
  } catch {
    log(`  MISSING at target: ${key}`);
  }
}
log(`verified at target: ${verified}/${toMove.length}`);

if (!PURGE) {
  log('\nSource copies left in place. Re-run with --purge-source once the app');
  log('is confirmed reading from the new bucket — until then they are still');
  log('publicly readable, which is the thing being fixed.');
  process.exit(verified === toMove.length ? 0 : 1);
}

if (verified !== toMove.length) {
  log('\nRefusing to purge: not every object is verified at the target.');
  process.exit(1);
}

let purged = 0;
for (const { key } of toMove) {
  await client.send(new DeleteObjectCommand({ Bucket: SOURCE, Key: key }));
  purged++;
}
log(`purged ${purged} from ${SOURCE}`);
