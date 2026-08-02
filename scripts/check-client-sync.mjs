#!/usr/bin/env node
/**
 * Keeps the web and mobile clients in step.
 *
 * The two apps share a transport layer — the same endpoints, the same request
 * and response types, the same query keys — and drift there is silent. A field
 * added to one `types.ts` and not the other does not fail a build; it fails at
 * runtime, on one platform, on whichever screen reads the field.
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
};

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

for (const area of ['api', 'hooks']) {
  const webDir = join(WEB, area);
  for (const file of walk(webDir)) {
    const key = `${area}/${file}`;
    if (key in PLATFORM_SPECIFIC) continue;

    const mobilePath = join(MOBILE, area, file);
    let mobileText;
    try {
      mobileText = readFileSync(mobilePath, 'utf8');
    } catch {
      missing.push(key);
      continue;
    }

    compared++;
    if (normalise(readFileSync(join(webDir, file), 'utf8')) !== normalise(mobileText)) {
      drifted.push(key);
    }
  }
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
