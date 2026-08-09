/**
 * Reports whether the credentials in the environment can reach each bucket.
 *
 * Prints statuses and a short fingerprint only — never the key itself.
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

for (const bucket of [process.env.B2_BUCKET_NAME, 'virgo-prod-media']) {
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
}
