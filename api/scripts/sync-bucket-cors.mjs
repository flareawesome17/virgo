/**
 * Copies the public bucket's CORS rules onto the private media bucket.
 *
 * A bucket created through the console starts with no CORS rules at all, so
 * the browser's preflight for a presigned PUT gets no
 * `Access-Control-Allow-Origin` back and the upload dies before a byte moves.
 * The old bucket already had working rules; this makes the new one match
 * rather than inventing a policy from scratch.
 *
 * Uses B2's **native** API, not the S3 one: the S3 endpoint is not always
 * reachable from inside this container, and PutBucketCors is not part of B2's
 * S3-compatible surface anyway.
 *
 *   node scripts/sync-bucket-cors.mjs           # report only
 *   node scripts/sync-bucket-cors.mjs --apply
 */
const APPLY = process.argv.includes('--apply');

const KEY_ID = process.env.B2_KEY_ID;
const APP_KEY = process.env.B2_APPLICATION_KEY;
const SOURCE = process.env.B2_BUCKET_NAME;
const TARGET = process.env.B2_MEDIA_BUCKET_NAME;

if (!KEY_ID || !APP_KEY) {
  console.error('B2 credentials are not set in this environment.');
  process.exit(2);
}

const auth = await (
  await fetch('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', {
    headers: {
      Authorization: `Basic ${Buffer.from(`${KEY_ID}:${APP_KEY}`).toString('base64')}`,
    },
  })
).json();

if (!auth.authorizationToken) {
  console.error('Authorize failed:', JSON.stringify(auth).slice(0, 200));
  process.exit(2);
}

const apiUrl = auth.apiInfo.storageApi.apiUrl;
const accountId = auth.accountId;

async function call(name, body) {
  const res = await fetch(`${apiUrl}/b2api/v3/${name}`, {
    method: 'POST',
    headers: {
      Authorization: auth.authorizationToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${name}: ${JSON.stringify(json).slice(0, 220)}`);
  return json;
}

const { buckets } = await call('b2_list_buckets', { accountId });
const src = buckets.find((b) => b.bucketName === SOURCE);
const dst = buckets.find((b) => b.bucketName === TARGET);

console.log(`buckets visible : ${buckets.map((b) => b.bucketName).join(', ')}\n`);
if (!src || !dst) {
  console.error(`Could not see both ${SOURCE} and ${TARGET}.`);
  process.exit(2);
}

const show = (b) =>
  `${b.bucketName.padEnd(20)} type=${String(b.bucketType).padEnd(10)} corsRules=${
    b.corsRules?.length ?? 0
  }`;
console.log('  ' + show(src));
console.log('  ' + show(dst));

console.log(`\nsource rules:\n${JSON.stringify(src.corsRules ?? [], null, 2)}`);

if (!src.corsRules?.length) {
  console.error('\nThe source bucket has no CORS rules to copy.');
  process.exit(1);
}

if (!APPLY) {
  console.log('\nReport only. Re-run with --apply to copy these onto ' + TARGET + '.');
  process.exit(0);
}

await call('b2_update_bucket', {
  accountId,
  bucketId: dst.bucketId,
  corsRules: src.corsRules,
});

const after = (await call('b2_list_buckets', { accountId })).buckets.find(
  (b) => b.bucketName === TARGET,
);
console.log(`\napplied. ${TARGET} now has ${after.corsRules?.length ?? 0} rule(s):`);
console.log(JSON.stringify(after.corsRules ?? [], null, 2));
