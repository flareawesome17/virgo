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
    └─ http://127.0.0.1:<port>    the real app, once the server answers
         ▲
         └── node server.js       Next standalone, spawned by the Rust shell
                                  on a loopback port, killed on exit
```

`src-tauri/src/lib.rs` reserves a free port, starts the bundled Node runtime
against the staged server, polls until the socket accepts, then moves the
webview off the splash. The server binds `127.0.0.1` only, so an open app does
not put a signed-in session on the local network.

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

Windows keeps its standard frame for now. Replacing it means drawing the
controls in the app, which needs Tauri's JS API — and that is not injected here,
because the app is loaded from `http://127.0.0.1:41730`, an origin the webview
treats as remote. Granting IPC to that origin is a deliberate decision rather
than a detail, so it is not taken as part of this.

## Updates

There is no auto-updater, and for this architecture that is less of a gap than
it sounds. The app *is* the web client, so every product change reaches it the
moment the server is deployed — no installer involved. The installer only needs
replacing when the shell itself changes, which is rare.

What the app cannot work out on its own is that it has been superseded. So
`DesktopUpdateBanner` in `web/src/components` asks `/downloads/latest` on load,
compares it to the version staged into the bundle, and offers the installer for
the platform it is running on. Dismissal is remembered per version, so saying
"not now" to 1.8.0 does not also silence 1.9.0.

Two things make that work, both of them build-time:

- `NEXT_PUBLIC_VIRGO_DESKTOP` is set only by `stage-web.mjs`, so the banner is
  inert in the image serving web.virgo.ph. It cannot be detected at runtime:
  Tauri injects its API only into pages it serves itself, and this bundle is
  loaded over `http://127.0.0.1:41730`, which the webview treats as remote.
  Nothing on the page can tell itself apart from a browser tab.
- `NEXT_PUBLIC_DESKTOP_VERSION` is read out of `tauri.conf.json` by the same
  script, so it is by construction the number the installer carries. A bundle
  that disagreed with its own installer would either nag forever or never
  mention an update at all.

A local `npm run stage` picks up whatever version that file says, which is
usually behind the newest release — so a locally built app will offer to update
itself to the real one. That is correct rather than a bug.

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
- **Offline.** The app talks to `api.virgo.ph` for everything. The shell starts
  and the UI renders offline; the content does not load. TanStack Query's
  AsyncStorage persistence is mobile-only — web has no equivalent.
- **No desktop integration yet.** No tray, no native menu, no notifications, no
  deep links, no auto-update. Tauri supports all of them; none is wired.
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
- **Port race.** The free port is reserved by binding and releasing, so another
  process can take it in the gap. Surfaces as a failed start, never as a wrong
  connection, because the port is passed to Node explicitly.
