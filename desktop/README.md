# Virgo — desktop

A Tauri shell that runs the existing web client as a native Windows and macOS
application. **No product code lives here.** The app you get is `web/`, byte for
byte, in a native window.

## Why this and not react-native-windows

The feasibility audit found the mobile app cannot be extended to desktop without
leaving Expo: none of its 32 Expo packages ship a Windows or macOS
implementation, and `expo-router` — imported by 78 files — needs four native
peers that no desktop platform supplies in full (Windows has 1 of 4, macOS 3 of
4). That is a re-platform, not a port.

`web/` is already a complete second client. It shares `src/api`, `src/hooks` and
four `src/lib` helpers with `mobile/`, byte-for-byte, enforced in CI by
`scripts/check-client-sync.mjs`. Wrapping it reuses that work instead of
starting a third UI tree.

## How it works

```
  Tauri window
    ├─ splash/index.html          shown immediately, ~1 s
    └─ http://127.0.0.1:41730     the real app, once the server answers
         ▲
         └── node server.js       Next standalone, spawned by the Rust shell
                                  on the loopback port, killed on exit
```

`src-tauri/src/lib.rs` starts the bundled Node runtime against the staged
server on port 41730, polls until the socket accepts, then moves the webview
off the splash. The port is fixed because `http://127.0.0.1:41730` is the
origin the API accepts. The server binds `127.0.0.1` only, so an open app does
not put a signed-in session on the local network.

The shell also decides what the window may show. Its own splash and the app on
41730 load in it; every other link goes to the system browser, and a new
window (`target="_blank"`, `window.open`) is never a second webview. The one
exception is a download the app marks with `#virgo-download`: that loads, and
the shell saves it to the Downloads folder and tells the page when it is done.
Only one copy runs: a second launch focuses the open window and exits.

### Why a server and not a static export

`output: 'export'` cannot build this app. Seven routes are server-rendered on
demand and declare no `generateStaticParams`, because their parameters are
account data:

```
/u/[handle]   /chat/[id]     /albums/[id]   /workspaces/[id]
/bookings/[id]   /hire/[handle]   /jobs/[slug]
```

`proxy.ts` also runs as middleware on every navigation, which a static export
drops entirely. Making the app exportable means restructuring `web/` — a tree
shared with the web deployment and compared against `mobile/src` in CI. Running
the real server costs ~30 MB and a cold start. That is the cheaper side of the
trade.

## The window

Two things stop it reading as a web page in a frame.

**macOS gets an overlay title bar.** `titleBarStyle: "Overlay"` with
`hiddenTitle` lets the app run to the top of the window, with the traffic lights
floating over it rather than sitting in a separate grey strip. The app shell
pads its top by `pt-7` to keep the sidebar clear of them, and what that leaves
is the region macOS still treats as the title bar — so the window is still
dragged by it.

That padding is decided at build time from the target triple, not sniffed from
the user agent, because it changes layout: working it out after hydration would
paint the Windows layout first and jump. `stage-web.mjs` sets
`NEXT_PUBLIC_DESKTOP_OS` alongside the desktop flag.

**The window remembers where it was.** `tauri-plugin-window-state` saves size
and position on exit and restores them on launch. Opening at the same centred
1280×860 every time, whatever the user did last, is a small thing that reads as
a web page rather than an application.

On Windows the app draws its own title bar, `DesktopTitleBar` in `web/`, and
the shell turns the system frame off. That needs Tauri's JS API in a page
loaded from `http://127.0.0.1:41730`, an origin the webview treats as remote,
so the capabilities in `src-tauri/capabilities/` grant IPC to that origin and
list exactly what it may do: the window controls, its title and badge, holding
a close while uploads run, notifications, the updater, and opening links only
to `api.virgo.ph`. Nothing reads the filesystem or runs a shell.

## Updates

**Deploying the web does not update the desktop app.** The app runs the web
client, but its own copy of it: `stage-web.mjs` builds `web/` in standalone
mode and stages that build into `src-tauri/resources/web`, which Tauri bundles
into the installer. Every installed copy runs the web app exactly as it was at
the release it was installed or last updated from. A deploy to web.virgo.ph
changes the browser and nothing on anyone's desktop. Only the API is shared
live: the app calls `api.virgo.ph` like any other client, so a server change
reaches it at once.

So a web fix reaches desktop users the same way a change to the shell does:
through a release. Publishing a `vX.Y.Z` release runs the release workflow,
which builds new installers from that tag, web app included, and attaches them
to the release. Installed copies then find the update and offer it in the app.
Every `v*` release rebuilds the installers whether or not its change was meant
for desktop, so there is nothing extra to do beyond cutting the release, and
nothing reaches a desktop until somebody does.

How the app finds out: `DesktopUpdateBanner` in `web/src/components` asks
`tauri-plugin-updater` on launch, every 30 minutes while the app is open, and
when the window comes back after five minutes away. The plugin polls

```
https://api.virgo.ph/downloads/updater/{{target}}/{{arch}}/{{current_version}}?bundle={{bundle_type}}
```

which `api/src/downloads` answers with the newest release's signed installer,
or `204` when the app is current. The update downloads inside the app with a
progress bar, then asks before restarting. Dismissal is remembered per version,
so saying "not now" to 1.8.0 does not also silence 1.9.0. Nothing is installed
unless it is signed with the key whose public half is in `tauri.conf.json`.

`?bundle=` is there for Windows, which ships two installers that put the app in
different places: the MSI installs it for the whole machine, the NSIS
`-setup.exe` for the current user. Running the NSIS installer over an MSI
install does not update it; it installs a second copy beside the first. So the
plugin says which installer it came from, the API answers `msi` with the
release's `.msi` and its `.msi.sig`, and answers anything else with the NSIS
installer. Anything else includes no parameter at all, which is what every
copy built before the parameter existed sends: an MSI install from before it is
still offered the NSIS installer until it is reinstalled from a newer MSI. A
release missing its signed MSI offers MSI installs nothing rather than the
wrong installer.

Two things are fixed at build time:

- `NEXT_PUBLIC_VIRGO_DESKTOP` is set only by `stage-web.mjs`, so the image
  serving web.virgo.ph compiles the banner away entirely.
- The version the update check compares against is the shell's own, from
  `tauri.conf.json`, which the release workflow stamps from the tag.
  `NEXT_PUBLIC_DESKTOP_VERSION` is read out of the same file by
  `stage-web.mjs`, so the web bundle states the number its installer carries.
  Settings → About shows it, and update announcements are targeted by it.

A local `npm run stage` picks up whatever version that file says, which is
usually behind the newest release — so a locally built app will offer to update
itself to the real one. That is correct rather than a bug.

## The log

A release build has no console, so the shell writes what it does to
`%TEMP%\virgo-desktop.log` (on macOS, `$TMPDIR/virgo-desktop.log`): each step
of starting up, and every line the Next server prints, prefixed `[next]`. The
splash's error text points there when the app fails to start.

It is rotated at launch. Once it reaches about 2 MB it is renamed
`virgo-desktop.log.old`, replacing the previous one, and a fresh file is
started, so there is the current log and at most one older copy. Before that
it only ever grew, for as long as the app had been installed.

## The API has to allow this app's origin

The webview loads the app from `http://127.0.0.1:41730` and calls the API
directly from there, so that address is the `Origin` on every request and the
API must list it. Without it the browser refuses the call at the preflight and
the sign-in screen reports *"Could not reach the server. Check your connection
and try again."* — which reads like the API is down when it is answering
perfectly well.

This is why `APP_PORT` in `lib.rs` is a constant. The first version reserved a
free port per launch, which cannot work: an allow-list holds exact strings, and
an origin that changes every launch is never on it.

`http://127.0.0.1:41730` is now named in all four config files —
`api/.env`, `api/.env.example`, `.env.production` and
`.env.production.example` — so dev and production agree.

| Environment | Status |
| --- | --- |
| Dev (`virgo-dev-api.virgo.ph`) | **live.** The container was recreated and the preflight returns `access-control-allow-origin: http://127.0.0.1:41730` |
| Production (`api.virgo.ph`) | **repo config updated, host not.** `.env.production` is gitignored and the real copy lives on the production host — that file needs the same entry, then the API restarted |

Do **not** reach for `ALLOW_LAN_ORIGINS` on production instead —
`api/src/config/cors.ts` is explicit that it is a development setting, and it
would widen the allow-list to every plain-HTTP origin on the machine and the
LAN rather than to one exact address.

One consequence worth knowing before this ships. `CORS_ORIGINS` is not only a
CORS list: `admin.controller.ts` consults it in `consoleOrigin()` to decide
whether an admin password-reset link may point at the request's `Origin`.
Listing `http://127.0.0.1:41730` therefore means a reset link *could* be
directed at that address — which is only reachable by something already running
on the admin's own machine, so exploiting it needs local code execution first.
That is a small widening, not a new remote path, but it is the reason the file
says every entry is a trust decision.

WebSockets are unaffected either way: `realtime.gateway.ts` does not check
`Origin`, and authenticates from a token sent after the connection opens, so
live chat and notifications work regardless of which API is configured.

### And so does the storage bucket

Uploads do not go through the API. The client asks for a presigned URL and then
`PUT`s the file straight to Backblaze, so the **bucket** decides which origins
may upload — a second allow-list, in a different system, that has to learn the
same address.

Missing from it, the preflight answers 403 with no
`Access-Control-Allow-Origin` and the upload fails before a byte moves. Uploading
works in a browser and fails in the desktop app, with nothing else different
between them, which is a confusing way to find out.

```bash
node scripts/allow-origin-cors.mjs http://127.0.0.1:41730          # report
node scripts/allow-origin-cors.mjs http://127.0.0.1:41730 --apply  # change it
```

Run from `api/`, with a key that may write bucket settings. The application key
the API uses is scoped to its buckets and cannot — use the master key, or make
the change in the B2 console.

Both buckets need it: `B2_BUCKET_NAME` and `B2_MEDIA_BUCKET_NAME`.

## Prerequisites

### Windows

Three things, in this order. The C++ build tools are not optional and not
bundled with Rust: `rustc` defaults to the MSVC toolchain and shells out to
`link.exe`, so without them `cargo build` fails at the link step with
`linker 'link.exe' not found` — after downloading the whole dependency tree.

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

```powershell
winget install --id Rustlang.Rustup -e
```

Then **open a new terminal**, or the shell you installed from will not have
`cargo` on its `PATH` — the installer edits the stored environment, which a
running process does not re-read. To refresh in place instead:

```powershell
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
```

```powershell
cargo install tauri-cli --version "^2"
```

WebView2 is required too, but ships with Windows 11 — check with
`Get-ItemProperty "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"`.

> Note for anything scripted: this project's shell is **Windows PowerShell 5.1**,
> where `&&` and `||` are parser errors rather than chain operators. Use `;`, or
> `if ($?) { … }` when the second command depends on the first.

### macOS

```bash
xcode-select --install
```

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

```bash
cargo install tauri-cli --version "^2"
```

## Use

```bash
npm run icons     # once: generates src-tauri/icons/ from web/public/icon.png
npm run dev       # next dev on :4123, in a native window, with hot reload
npm run build     # builds web/, stages it, produces an installer
```

`npm run stage` builds and stages without invoking cargo, which is the useful
half when you only want to check the server bundle. `npm run stage:quick`
re-stages an existing `web/.next` without rebuilding.

The API the build points at is baked in at build time, because `NEXT_PUBLIC_*`
is inlined rather than read at runtime:

```bash
VIRGO_API_URL=https://virgo-dev-api.virgo.ph npm run stage
```

Defaults to `https://api.virgo.ph`.

### Checking the shell without building it

The release workflow is the only place the shell is built, so check a change
to `src-tauri/` before it gets there. The build script wants the staged icons,
sidecar and server on disk; `stage-check.mjs` puts placeholders in whichever
are missing, and never replaces a real staged file:

```bash
node scripts/stage-check.mjs
cd src-tauri && cargo clippy --locked -- -D warnings && cargo clippy --locked --release -- -D warnings
```

The `Desktop check` workflow runs the same on Windows and macOS for any pull
request that touches `desktop/`. `--locked` fails when `Cargo.lock` is behind
`Cargo.toml`: run `cargo check` without it and commit the lock it writes.

## What is verified, and what is not

The web half was run end to end from the staged bundle on this machine:

| Check | Result |
| --- | --- |
| `web/` builds with `output: 'standalone'` | passes |
| Staged server boots on a loopback port | passes |
| Sign-in renders, no console errors | passes |
| Client-side navigation (sign-in → sign-up) | passes |
| Dynamic routes — the 5 tested | all 200 |
| Middleware: `/@mika` rewrite | 200, URL preserved |
| Middleware: `/auth/sign-in` → `/sign-in` | 308 |
| `api.virgo.ph` baked in, no localhost leakage | passes |

The Rust shell compiles and bundles:

| Check | Result |
| --- | --- |
| `cargo tauri build` on a cold cache | passes, no API fixes needed |
| MSI + NSIS installers produced | 42 MB / 28 MB |
| Sidecar and resources land beside the exe | `node.exe`, `web/server.js` |
| App launches | passes |
| Node child spawns, Next reports ready | passes |
| Webview moves off the splash to the server | passes |
| Server bound to loopback only | `127.0.0.1:41730` |
| Closing the window reaps Node | no orphan, port released |
| Port already taken → clear error | passes, names the port and why it is fixed |
| Cross-origin API call from the app's origin | `401 Invalid email or password` — a real response, not a CORS block |

The startup path was observed end to end from the release binary:

```
starting
server root: C:\…\target\release\web
node binary: C:\…\target\release\node.exe
[next] ▲ Next.js 16.3.0
[next] ✓ Ready in 0ms
node spawned, waiting on port 55397
ready — moving the webview to port 55397
```

Getting there took one fix. The first build started the app but never spawned
Node, because `AppHandle::path().resolve()` returns Windows' extended-length
form and Node cannot use it:

```
Error: EISDIR: illegal operation on a directory, lstat 'C:'
    at Object.realpathSync (node:fs:2745:25)
```

`strip_extended_prefix` in `lib.rs` drops the prefix. The `server root:` line
above, with no `\\?\`, is that fix working.

## Known gaps

- **Smart App Control blocks unsigned builds intermittently.** This machine has
  `VerifiedAndReputablePolicyState = 1` (enforced). One freshly linked binary
  was refused outright — `An Application Control policy has blocked this file`
  — and the same binary launched normally minutes later, because Smart App
  Control decides per binary hash against a cloud reputation lookup. Expect a
  new build to be refused sometimes and to start working on its own. **Do not
  switch Smart App Control off to work around it**: on Windows 11 that is
  one-way and cannot be re-enabled without reinstalling the OS. The real fix is
  an Authenticode signature — an EV certificate carries reputation immediately,
  a standard one accrues it.
- **Payload.** ~122 MB staged before compression: 33 MB app, 89 MB Node. A
  smaller runtime, or a static export after restructuring the seven dynamic
  routes, is where that goes if it matters.
- **Offline.** The app talks to `api.virgo.ph` for everything. The desktop build
  keeps the query cache on disk for a day (`virgo.offline.cache`), so what was
  last open still shows without a connection; nothing new loads, and changes
  wait for one.
- **Desktop integration is partial.** Updates (see above), system
  notifications, the unread count in the window title and the Dock badge, and
  on macOS a View menu with Reload, Back and Forward are wired (Windows keeps
  WebView2's F5 and Alt+Left). Clicking a notification brings Virgo forward but
  does not open what it was about. There is no tray and there are no deep links
  yet; Tauri supports both.
- **Signing.** macOS signs and notarises in the release workflow once the six
  `APPLE_*` repository secrets exist. The Node sidecar is signed with
  `src-tauri/Entitlements.plist`, because V8 needs JIT under the hardened
  runtime, and `stage-web.mjs` keeps sharp out of `resources/`, which Tauri
  does not sign. Windows still needs the Authenticode certificate described
  above; unsigned builds are refused outright on machines with Smart App
  Control enforced.
- **Build times.** A rebuild links over the existing `virgo-desktop.exe`, and
  Windows locks a running executable — the linker then retries for as long as
  the app is open. One rebuild here took 67 minutes for that reason instead of
  two. Close the app before rebuilding.
- **One port.** The fixed port means one running copy per machine: a second
  Windows user signed in at the same time cannot open Virgo while the first has
  it open, and gets "Port 41730 is already in use". Allowing a range would mean
  the API accepting each of those origins.
