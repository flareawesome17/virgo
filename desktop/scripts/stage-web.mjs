#!/usr/bin/env node
/**
 * Assembles the Next.js app and a Node runtime into `src-tauri/`, ready to be
 * bundled by Tauri.
 *
 * The desktop app does not reimplement the web client — it runs it. The same
 * `web/` tree that serves web.virgo.ph is built here in standalone mode and
 * launched on a loopback port by the Rust shell, with the webview pointed at
 * it. Nothing under `web/` is modified, which matters: that tree is compared
 * byte-for-byte against `mobile/src` by `scripts/check-client-sync.mjs`, and a
 * desktop-only edit there would fail the check for everybody.
 *
 * The layout below is the same one `web/Dockerfile` produces, for the same
 * reason — `.next/standalone` bundles only the modules the server actually
 * reaches, and Next expects `static/` and `public/` to be replaced alongside
 * it rather than being included in that bundle.
 *
 *   node scripts/stage-web.mjs            build, then stage
 *   node scripts/stage-web.mjs --no-build stage an existing .next/
 */
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, '..');
const repo = resolve(desktop, '..');
const web = join(repo, 'web');

const RESOURCES = join(desktop, 'src-tauri', 'resources', 'web');
const BINARIES = join(desktop, 'src-tauri', 'binaries');

const skipBuild = process.argv.includes('--no-build');

/**
 * Where the desktop build points its API calls.
 *
 * `NEXT_PUBLIC_*` is inlined at build time rather than read at runtime, so this
 * is baked into the bundle and cannot be changed after the fact.
 *
 * The development API is the default, and deliberately so: it runs with
 * `ALLOW_LAN_ORIGINS=true` and therefore already accepts this app's
 * `http://127.0.0.1:41730` origin. Production does not, until
 * `http://127.0.0.1:41730` is added to its `CORS_ORIGINS` — and until then a
 * production build gets through the whole launch and then fails every request
 * at the preflight, which the sign-in screen reports as "Could not reach the
 * server". Defaulting to the API that works keeps a fresh clone from looking
 * broken.
 *
 * For a release build, once that entry exists:
 *
 *   VIRGO_API_URL=https://api.virgo.ph node scripts/stage-web.mjs
 */
const API_URL = process.env.VIRGO_API_URL || 'https://virgo-dev-api.virgo.ph';

function step(msg) {
  console.log(`\n\x1b[36m▸\x1b[0m ${msg}`);
}

/**
 * The version this build will identify itself as.
 *
 * Read from tauri.conf.json rather than passed in, so it is by construction the
 * same number the installer carries — the update banner compares it against the
 * newest release, and a bundle that disagreed with its own installer would
 * either nag forever or never mention an update at all.
 *
 * The release workflow rewrites that file from the tag before this script runs.
 * Locally it is whatever the file says, which is correct: a local build is not
 * a release and has no business claiming a version it does not have.
 */
function desktopVersion() {
  try {
    const config = JSON.parse(
      readFileSync(join(desktop, 'src-tauri', 'tauri.conf.json'), 'utf8'),
    );
    return typeof config.version === 'string' ? config.version : '';
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ build */

const VERSION = desktopVersion();

/**
 * Which desktop platform this bundle is for.
 *
 * Needed at build time rather than sniffed at runtime because it decides
 * layout: on macOS the window uses an overlay title bar, so the traffic lights
 * float over the app's own sidebar and the top of it has to be padded out of
 * their way. Deciding that after hydration would show the wrong layout first
 * and jump, which is worse than the seam it is meant to remove.
 *
 * `targetTriple` is a function declaration and therefore hoisted, so this can
 * run before its definition further down.
 */
const TRIPLE = targetTriple();
const DESKTOP_OS = TRIPLE.includes('apple-darwin')
  ? 'macos'
  : TRIPLE.includes('windows')
    ? 'windows'
    : 'linux';

if (!skipBuild) {
  step(`Building web/ ${VERSION || '(unversioned)'} against ${API_URL}`);
  // `shell: true` on Windows, and it has to be. npm is a `.cmd` shim there, and
  // since the fix for CVE-2024-27980 Node refuses to spawn `.cmd` without a
  // shell — naming `npm.cmd` directly fails with EINVAL rather than running.
  //
  // That earns a DEP0190 warning in Node 24, which is about arguments being
  // concatenated into the command line instead of escaped. It does not apply
  // here: the arguments are the two string literals below and no input reaches
  // them.
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: web,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_API_URL: API_URL,
      NEXT_PUBLIC_APP_ORIGIN: process.env.NEXT_PUBLIC_APP_ORIGIN || 'https://web.virgo.ph',
      NEXT_PUBLIC_SITE_ORIGIN: process.env.NEXT_PUBLIC_SITE_ORIGIN || 'https://virgo.ph',
      // What tells the web client it is the desktop app. Nothing on the page
      // can work this out at runtime: Tauri injects its API only into pages it
      // serves itself, and this bundle is loaded over http://127.0.0.1:41730,
      // which the webview treats as remote. Set only here, so the image that
      // serves web.virgo.ph compiles the update banner away entirely.
      NEXT_PUBLIC_VIRGO_DESKTOP: '1',
      NEXT_PUBLIC_DESKTOP_VERSION: VERSION,
      NEXT_PUBLIC_DESKTOP_OS: DESKTOP_OS,
    },
  });
  if (result.status !== 0) {
    console.error('\nweb build failed — nothing staged.');
    process.exit(result.status ?? 1);
  }
}

const standalone = join(web, '.next', 'standalone');
if (!existsSync(join(standalone, 'server.js'))) {
  console.error(
    `\nNo standalone server at ${standalone}.\n` +
      `web/next.config.ts must keep \`output: 'standalone'\`, and the build must have run.`,
  );
  process.exit(1);
}

/* ------------------------------------------------------------------ stage */

step('Staging server bundle');
rmSync(RESOURCES, { recursive: true, force: true });
mkdirSync(RESOURCES, { recursive: true });

// server.js, its package.json, and the traced subset of node_modules.
cpSync(standalone, RESOURCES, { recursive: true });

// Client chunks. Deliberately not part of the standalone bundle — Next expects
// whatever is current to be dropped in beside it, so a stale copy here would
// serve a hashed chunk the HTML never asks for.
cpSync(join(web, '.next', 'static'), join(RESOURCES, '.next', 'static'), {
  recursive: true,
});

// Fonts, icons, and the notification sounds the chat screen plays.
if (existsSync(join(web, 'public'))) {
  cpSync(join(web, 'public'), join(RESOURCES, 'public'), { recursive: true });
}

/* ----------------------------------------------------------- node runtime */

/**
 * The Node binary is shipped with the app rather than assumed on the machine.
 *
 * Tauri names sidecars `<name>-<target-triple>` and strips the triple back off
 * when it bundles, so the file lands beside the app executable at runtime —
 * `Contents/MacOS/node` on macOS, next to the .exe on Windows. That is also the
 * directory a code-signing pass expects a nested executable to be in, which is
 * why this is a sidecar and not a resource.
 */
function targetTriple() {
  if (process.env.VIRGO_TARGET_TRIPLE) return process.env.VIRGO_TARGET_TRIPLE;

  // rustc is the authority when it is installed.
  // No shell needed: rustc is a real executable, not a `.cmd` shim.
  const probe = spawnSync('rustc', ['-vV'], { encoding: 'utf8' });
  if (probe.status === 0) {
    const host = /^host:\s*(.+)$/m.exec(probe.stdout ?? '');
    if (host) return host[1].trim();
  }

  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  if (process.platform === 'win32') return `${arch}-pc-windows-msvc`;
  if (process.platform === 'darwin') return `${arch}-apple-darwin`;
  return `${arch}-unknown-linux-gnu`;
}

/** The triple this script is itself running on. */
function hostTriple() {
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  if (process.platform === 'win32') return `${arch}-pc-windows-msvc`;
  if (process.platform === 'darwin') return `${arch}-apple-darwin`;
  return `${arch}-unknown-linux-gnu`;
}

/** How nodejs.org names the build for a Rust target triple. */
function nodeBuildFor(triple) {
  const arch = triple.startsWith('aarch64')
    ? 'arm64'
    : triple.startsWith('x86_64')
      ? 'x64'
      : null;
  const platform = triple.includes('apple-darwin')
    ? 'darwin'
    : triple.includes('windows')
      ? 'win'
      : triple.includes('linux')
        ? 'linux'
        : null;
  return arch && platform ? { platform, arch } : null;
}

/**
 * Fetches the Node runtime for a platform this script is not running on.
 *
 * Cross-compiling is the only way to produce an Intel macOS build now: GitHub's
 * `macos-13` runners no longer get picked up, and a job asking for one waits
 * until it times out — two releases hung on exactly that. Xcode targets
 * x86_64 from an Apple Silicon runner without complaint, but the Node sidecar
 * cannot come from `process.execPath` there, because that binary is arm64 and
 * would be bundled into an app that only Intel Macs are meant to run.
 *
 * The version fetched is the one running this script, so a cross-built app
 * ships the same runtime as a native one.
 */
async function fetchNodeFor(build, version, dest) {
  const name = `node-${version}-${build.platform}-${build.arch}`;
  const url = `https://nodejs.org/dist/${version}/${name}.tar.gz`;

  console.log(`  downloading ${name}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download ${url} — ${response.status} ${response.statusText}`);
  }

  const archive = join(BINARIES, `${name}.tar.gz`);
  writeFileSync(archive, Buffer.from(await response.arrayBuffer()));

  try {
    // Only the executable is wanted, so the member is named explicitly and its
    // two leading directories stripped.
    //
    // Run from inside the directory, with a bare filename, rather than given
    // absolute paths. GNU tar reads an argument containing a colon as
    // `host:path` and tries to fetch it over the network — an absolute Windows
    // path fails with "Cannot connect to C: resolve failed". `--force-local`
    // fixes that on GNU tar and is rejected outright by the BSD tar macOS
    // ships, so avoiding the colon is the portable answer.
    const extracted = spawnSync(
      'tar',
      ['-xzf', `${name}.tar.gz`, '--strip-components=2', `${name}/bin/node`],
      { cwd: BINARIES, stdio: 'inherit' },
    );
    if (extracted.status !== 0) throw new Error(`Could not extract ${archive}`);
    renameSync(join(BINARIES, 'node'), dest);
    chmodSync(dest, 0o755);
  } finally {
    rmSync(archive, { force: true });
  }
}

step('Staging Node runtime');
mkdirSync(BINARIES, { recursive: true });

const triple = TRIPLE;
const host = hostTriple();
const ext = triple.includes('windows') ? '.exe' : '';
const dest = join(BINARIES, `node-${triple}${ext}`);

if (triple === host) {
  // The common case, and free: the runtime already running this script is the
  // one the app should ship.
  copyFileSync(process.execPath, dest);
  if (process.platform !== 'win32') chmodSync(dest, 0o755);
} else {
  const build = nodeBuildFor(triple);
  if (!build) {
    console.error(`\nNo Node build is known for the target ${triple}.`);
    process.exit(1);
  }
  await fetchNodeFor(build, process.version, dest);
}

console.log(
  `  node ${process.version} → binaries/node-${triple}${ext}` +
    (triple === host ? ' (host)' : ` (cross-built on ${host})`),
);

/* ---------------------------------------------------------------- summary */

console.log(`
\x1b[32m✓\x1b[0m Staged.

  server     src-tauri/resources/web/server.js
  API        ${API_URL}
  version    ${VERSION || '(none — the update banner stays quiet)'}
  runtime    node ${process.version} (${triple})
  target     ${triple === host ? 'native' : `cross-built on ${host}`}
  platform   ${DESKTOP_OS}

Next: cargo tauri build   (or: cargo tauri dev)
`);
