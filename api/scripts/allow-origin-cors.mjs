/**
 * Adds an origin to both buckets' CORS rules.
 *
 * Uploads go straight from the browser to B2 through a presigned PUT, so the
 * bucket — not the API — decides which origins may send one. An origin missing
 * from these rules fails the preflight with a 403 and no
 * `Access-Control-Allow-Origin`, and the upload dies before a byte moves. The
 * app sees a failed upload with nothing useful attached to it.
 *
 * That is how the desktop app arrived: it serves itself from
 * http://127.0.0.1:41730, which is a different origin from web.virgo.ph and was
 * in nobody's allow-list. Uploading worked in a browser and failed in the app,
 * with everything else about the two identical.
 *
 * Existing rules are preserved — the origin is added to the rule that already
 * allows the web app, so the operations, headers and max-age stay whatever they
 * were rather than being reinvented here.
 *
 * Needs a key that may write bucket settings. An application key scoped to a
 * single bucket cannot, and will fail at authorize or at update; use the master
 * key, or make the change in the B2 console.
 *
 *   node scripts/allow-origin-cors.mjs http://127.0.0.1:41730
 *   node scripts/allow-origin-cors.mjs http://127.0.0.1:41730 --apply
 */
const APPLY = process.argv.includes('--apply');
const ORIGIN = process.argv.find((a) => /^https?:\/\//.test(a));

if (!ORIGIN) {
  console.error('Usage: node scripts/allow-origin-cors.mjs <origin> [--apply]');
  process.exit(2);
}

const KEY_ID = process.env.B2_KEY_ID;
const APP_KEY = process.env.B2_APPLICATION_KEY;
const BUCKETS = [process.env.B2_BUCKET_NAME, process.env.B2_MEDIA_BUCKET_NAME].filter(
  Boolean,
);

if (!KEY_ID || !APP_KEY) {
  console.error('B2 credentials are not set in this environment.');
  process.exit(2);
}
if (BUCKETS.length === 0) {
  console.error('Neither B2_BUCKET_NAME nor B2_MEDIA_BUCKET_NAME is set.');
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
  console.error(
    'Authorize failed. A key scoped to one bucket cannot read or write bucket ' +
      'settings — use the master key.\n  ' +
      JSON.stringify(auth).slice(0, 200),
  );
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
let changed = 0;

for (const name of BUCKETS) {
  const bucket = buckets.find((b) => b.bucketName === name);
  if (!bucket) {
    console.error(`\n${name}: not visible to this key — skipped.`);
    continue;
  }

  const rules = bucket.corsRules ?? [];
  console.log(`\n${name}  (${rules.length} rule(s))`);

  if (rules.length === 0) {
    console.error(
      '  No CORS rules at all. This script extends an existing rule rather ' +
        'than inventing a policy; set one up first, or copy from the other ' +
        'bucket with sync-bucket-cors.mjs.',
    );
    continue;
  }

  let touched = false;
  const next = rules.map((rule) => {
    const origins = rule.allowedOrigins ?? [];
    // Only the rule that already covers browser uploads. A bucket can carry
    // several — adding the origin to all of them would grant it whatever the
    // others allow, which is not what is being asked for here.
    const isUploadRule = (rule.allowedOperations ?? []).some((op) =>
      op.includes('put') || op.includes('post') || op.includes('upload'),
    );
    if (!isUploadRule || origins.includes(ORIGIN)) return rule;
    touched = true;
    return { ...rule, allowedOrigins: [...origins, ORIGIN] };
  });

  for (const rule of next) {
    console.log(
      `  ${String(rule.corsRuleName).padEnd(24)} ${(rule.allowedOrigins ?? []).join(', ')}`,
    );
  }

  if (!touched) {
    console.log(`  Nothing to change — ${ORIGIN} is already allowed, or no rule covers uploads.`);
    continue;
  }

  if (!APPLY) {
    console.log(`  Would add ${ORIGIN}. Re-run with --apply.`);
    changed += 1;
    continue;
  }

  await call('b2_update_bucket', {
    accountId,
    bucketId: bucket.bucketId,
    corsRules: next,
  });
  console.log(`  Applied.`);
  changed += 1;
}

if (!APPLY && changed > 0) {
  console.log('\nReport only. Re-run with --apply to make these changes.');
}
