#!/usr/bin/env node
/**
 * Keeps the web and mobile clients in step.
 *
 * The two apps share a transport layer — the same endpoints, the same request
 * and response types, the same query keys — plus a handful of pure helpers
 * under `lib/`, and drift in any of it is silent. A field added to one
 * `types.ts` and not the other does not fail a build; it fails at runtime, on
 * one platform, on whichever screen reads the field.
 *
 * So the shared files are compared directly. Two differences are expected and
 * normalised away rather than flagged:
 *
 *   - Line endings. The web tree is CRLF, the mobile tree is LF.
 *   - The import prefix. Mobile resolves `@/src/…`, web resolves `@/…`.
 *
 * Anything else is real drift and fails the check.
 *
 * Platform-specific files are listed and skipped explicitly, so adding one is
 * a deliberate edit here rather than a quiet exemption.
 *
 *   node scripts/check-client-sync.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const WEB = join(root, 'web', 'src');
const MOBILE = join(root, 'mobile', 'src');

/**
 * Files that legitimately differ, with the reason.
 *
 * Each of these touches a platform API that has no counterpart on the other:
 * SecureStore against localStorage, a FormData upload against a blob, an
 * AppState listener against visibilitychange.
 */
const PLATFORM_SPECIFIC = {
  'api/client.ts': 'different fetch and refresh plumbing',
  'api/config.ts': 'EXPO_PUBLIC_* vs NEXT_PUBLIC_*',
  'api/tokens.ts': 'SecureStore vs localStorage',
  'api/index.ts': 'exports differ with the platform files',
  'api/endpoints/storage.ts': 'file upload differs by platform',
  'hooks/useRealtime.ts': 'AppState vs visibilitychange; buzz vs toast',
  'hooks/useAuth.ts': 'navigation and token storage differ',
  'hooks/useUpload.ts': 'picks files through a platform API',
  'hooks/useAlbumFiles.ts': 'thumbnail handling differs',
  'hooks/useNearby.ts': 'location permission differs',
  'hooks/useChat.ts': 'foreground alerting differs',
  // navigator.onLine against NetInfo. Same concern, no shared implementation;
  // mobile's copy is called useOffline.ts.
  'hooks/useOnline.ts': 'mobile equivalent is useOffline.ts',
  // Mobile has no hook: the album screen calls the shared albumShareApi
  // directly. The endpoint module — the part that has to agree — is compared.
  'hooks/useAlbumShare.ts': 'mobile calls albumShareApi from the screen',
  'lib/queryClient.ts': 'AsyncStorage persistence has no web counterpart',
  'lib/sounds.ts': 'expo-audio vs WebAudio',
};

/**
 * Shared files under `lib/`, named one by one.
 *
 * `api/` and `hooks/` can be walked because everything in them is meant to
 * match. `lib/` cannot: web has `analytics.ts`, `image.ts` and `version.ts`
 * that mobile has no use for, and mobile has `notifications.ts`,
 * `query-focus.ts` and `themePreference.ts` that web has no use for. Walking it
 * would report a dozen files as missing and teach everyone to ignore the
 * output.
 *
 * These six are duplicated on purpose. Four are pure logic and must match;
 * `queryClient.ts` and `sounds.ts` are named here anyway, and exempted in
 * PLATFORM_SPECIFIC above, so that "these two are allowed to differ" is
 * recorded rather than left to be rediscovered.
 *
 * Keeping them in step was a matter of remembering until now — which held
 * right up until an event type was renamed in one copy of `calendar.ts`, at
 * which point one client draws the right colour and the other draws the
 * fallback.
 */
const SHARED_LIB = [
  'calendar.ts',
  'job-form.ts',
  // Which day a photograph belongs under. Both galleries group by it, and a
  // difference here puts the same frame under different days on each.
  'media-days.ts',
  'ph-locations.ts',
  'presence-store.ts',
  'queryClient.ts',
  'sounds.ts',
];

function walk(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, base, out);
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(relative(base, full).split(sep).join('/'));
    }
  }
  return out;
}

/** Strips the two differences that are not drift. */
function normalise(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/@\/src\//g, '@/')
    // Mobile writes sibling hooks as './useX'; web writes '@/hooks/useX'.
    .replace(/from '\.\/(use[A-Za-z]+)'/g, "from '@/hooks/$1'");
}

const drifted = [];
const missing = [];
let compared = 0;

/** Every path to compare, relative to each client's `src/`. */
const keys = [
  ...['api', 'hooks'].flatMap((area) =>
    walk(join(WEB, area)).map((file) => `${area}/${file}`),
  ),
  ...SHARED_LIB.map((file) => `lib/${file}`),
];

for (const key of keys) {
  if (key in PLATFORM_SPECIFIC) continue;

  let webText;
  let mobileText;
  try {
    // Web first: a SHARED_LIB entry naming a file that does not exist there is
    // a mistake in this script, not drift between the clients.
    webText = readFileSync(join(WEB, key), 'utf8');
    mobileText = readFileSync(join(MOBILE, key), 'utf8');
  } catch {
    missing.push(key);
    continue;
  }

  compared++;
  if (normalise(webText) !== normalise(mobileText)) drifted.push(key);
}

console.log(`Compared ${compared} shared file(s).`);

if (missing.length) {
  console.log(`\nOn web but not mobile:`);
  for (const file of missing) console.log(`  ${file}`);
}

if (drifted.length) {
  console.log(`\nOut of sync:`);
  for (const file of drifted) {
    console.log(`  ${file}`);
    console.log(`    diff web/src/${file} mobile/src/${file}`);
  }
}

if (missing.length || drifted.length) {
  console.log(
    `\nEither port the change across, or — if the file genuinely cannot be` +
      `\nshared — add it to PLATFORM_SPECIFIC in this script with the reason.`,
  );
  process.exit(1);
}

console.log('web and mobile agree on every shared file.');

// The palette is shared the same way, through a generator rather than by
// copying: every client's colours come from design/tokens.json, and this is
// the check that none of the generated copies was edited by hand.
try {
  execFileSync(process.execPath, [join(root, 'scripts', 'build-tokens.mjs'), '--check'], {
    stdio: 'inherit',
  });
} catch {
  process.exit(1);
}
