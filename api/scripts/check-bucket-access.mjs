/**
 * Reports whether the credentials in the environment can reach each bucket,
 * and whether each bucket keeps the versions an overwrite or a delete leaves.
 *
 * Prints statuses and a short fingerprint only — never the key itself, a
 * token or the account id.
 *
 * The version report is the one to read before profile covers ship. Avatar
 * and cover normalisation overwrite the uploaded original in place, and a
 * delete sends a key with no version. On a bucket set to keep every version,
 * the camera original — EXIF and GPS included — survives both as a hidden
 * prior version. Both buckets must read "keeps only the last version"; the
 * setting is Buckets → Lifecycle Settings in the B2 console.
 *
 * B2's S3 API has no lifecycle calls, so that part asks B2's native API,
 * through fetch, with the same key.
 *
 *   docker compose -f docker-compose.prod.yml exec api node scripts/check-bucket-access.mjs
 */
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';

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

const fp = (s) => createHash('sha256').update(String(s ?? '')).digest('hex').slice(0, 10);
console.log(`key fingerprint: ${fp(process.env.B2_KEY_ID)} (id length ${(process.env.B2_KEY_ID ?? '').length})`);

// The two the API uses, from the same variables it reads. The media bucket
// falls back to the public one when unset, as StorageConfig does, and is then
// listed once.
const buckets = [
  ...new Set(
    [process.env.B2_BUCKET_NAME, process.env.B2_MEDIA_BUCKET_NAME || process.env.B2_BUCKET_NAME]
      .filter(Boolean),
  ),
];

/**
 * A session on B2's native API, or the reason there is none.
 *
 * The token and the account id stay inside this script. Neither is printed,
 * and a failure reports only its HTTP status.
 */
async function nativeSession() {
  try {
    const basic = Buffer.from(
      `${process.env.B2_KEY_ID ?? ''}:${process.env.B2_APPLICATION_KEY ?? ''}`,
    ).toString('base64');
    const res = await fetch('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', {
      headers: { Authorization: `Basic ${basic}` },
    });
    if (!res.ok) return { error: `unreadable (${res.status})` };
    const body = await res.json();
    const apiUrl = body?.apiInfo?.storageApi?.apiUrl;
    if (!apiUrl || !body.authorizationToken || !body.accountId) {
      return { error: 'unreadable (no storage API in the answer)' };
    }
    return { apiUrl, token: body.authorizationToken, accountId: body.accountId };
  } catch (err) {
    return { error: `unreadable (${err?.name ?? 'error'})` };
  }
}

/**
 * What a bucket does with the versions an overwrite or a delete leaves.
 *
 * "Keep only the last version" in the console is a rule over the whole bucket
 * (an empty prefix) that deletes a hidden version a day after it is hidden.
 * Anything else keeps them.
 */
async function versionPolicy(session, bucketName) {
  if (session.error) return session.error;
  try {
    const res = await fetch(`${session.apiUrl}/b2api/v3/b2_list_buckets`, {
      method: 'POST',
      headers: { Authorization: session.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: session.accountId, bucketName }),
    });
    if (!res.ok) return `unreadable (${res.status})`;
    const body = await res.json();
    const bucket = (body?.buckets ?? []).find((b) => b.bucketName === bucketName);
    if (!bucket) return 'unreadable (not visible to this key)';
    const rules = bucket.lifecycleRules ?? [];
    const lastOnly = rules.some(
      (rule) =>
        (rule.fileNamePrefix ?? '') === '' &&
        typeof rule.daysFromHidingToDeleting === 'number' &&
        rule.daysFromHidingToDeleting <= 1,
    );
    return lastOnly ? 'keeps only the last version' : 'KEEPS PREVIOUS VERSIONS';
  } catch (err) {
    return `unreadable (${err?.name ?? 'error'})`;
  }
}

const session = await nativeSession();

for (const bucket of buckets) {
  let verdict;
  try {
    // HeadBucket is refused to bucket-restricted B2 keys even when object
    // operations work, so it reports failure for a key that is perfectly
    // usable. Listing is both a truer test and what the migration needs.
    const r = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }),
    );
    verdict = `OK (${r.KeyCount ?? 0} key seen)`;
  } catch (err) {
    verdict = `${err?.$metadata?.httpStatusCode ?? '?'} ${err?.name ?? 'error'}`;
  }
  console.log(`  ${String(bucket).padEnd(20)} ${verdict}`);
  console.log(`  ${''.padEnd(20)} versions: ${await versionPolicy(session, bucket)}`);
}
