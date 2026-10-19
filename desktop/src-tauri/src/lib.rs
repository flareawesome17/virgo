//! The desktop shell for Virgo.
//!
//! There is no desktop UI in this crate. The product is the Next.js app in
//! `web/`, built in standalone mode and staged into `resources/web` by
//! `scripts/stage-web.mjs`; this shell starts it on a loopback port with the
//! bundled Node runtime and points a webview at it once it answers.
//!
//! Running the real server rather than exporting the app statically is not a
//! preference. Seven routes — `/u/[handle]`, `/chat/[id]`, `/albums/[id]`,
//! `/workspaces/[id]`, `/bookings/[id]`, `/hire/[handle]`, `/jobs/[slug]` —
//! are server-rendered on demand and declare no `generateStaticParams`, because
//! their parameters are account data and unknowable at build time. `proxy.ts`
//! also runs as middleware on every navigation. `output: 'export'` cannot
//! express either, so it would mean restructuring `web/` — a tree that is
//! compared byte-for-byte against `mobile/src` in CI and shared with the web
//! deployment. The server costs ~30 MB and a cold start; the restructure would
//! cost a fork.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::{Ipv4Addr, SocketAddrV4, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use sysinfo::{ProcessesToUpdate, System};
use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{Emitter, Manager, Url, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

/// Ties the Node child's lifetime to this process, whatever ends it.
///
/// `stop_server` only runs on Tauri's exit events. Anything else — a crash,
/// Task Manager, or the updater handing over to the installer — leaves the
/// child running, and it goes on holding `node.exe` open in the install
/// directory. That is not theoretical: an orphan from an earlier session made
/// the 1.10.0 installer fail with "Error opening file for writing", and it
/// would fail an in-app update the same way, at the worst possible moment.
///
/// A job object with `KILL_ON_JOB_CLOSE` moves the guarantee into the kernel:
/// when this process ends, for any reason, Windows closes the job and kills
/// everything in it. No exit handler can promise that, because an exit handler
/// does not run when a process is killed.
///
/// Failure is logged and tolerated. It makes an orphan possible again, which is
/// where this started — not something to refuse to launch over.
#[cfg(windows)]
fn tie_child_to_this_process(child: &Child) {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            log("could not create a job object — the server may outlive a crash");
            return;
        }

        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

        if SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const core::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        ) == 0
        {
            log("could not configure the job object — the server may outlive a crash");
            return;
        }

        if AssignProcessToJobObject(job, child.as_raw_handle() as _) == 0 {
            log("could not assign the server to the job object");
            return;
        }

        // The job handle is deliberately never closed. Holding it open for the
        // life of this process is the whole mechanism: the kernel closes it
        // when this process ends, and that close is what kills the child.
        log("server tied to this process (job object)");
    }
}

#[cfg(not(windows))]
fn tie_child_to_this_process(_child: &Child) {
    // Nothing equivalent is wired up yet. macOS and Linux still rely on the
    // exit handler, so a killed app can leave the server running there — worth
    // solving when macOS updates are added, because that is when it starts to
    // cost something.
}

/// Kills a server left behind by an earlier run of this app.
///
/// Only processes running our own bundled `node`, matched on the full path, are
/// touched — never another Node on the machine. With the job object above this
/// should find nothing; it matters when upgrading from a build that did not
/// have one, and as insurance if the job object ever fails to attach.
///
/// Only orphans: a server whose parent is a running copy of this app is that
/// copy's, and is left alone. This used to kill every server on the bundled
/// `node`, so opening Virgo a second time took the first window's server down
/// on its way to finding the port taken. The single-instance plugin now stops
/// a second launch before it gets here; this keeps a copy that slips past it —
/// another user's session, a build that predates it — from doing the damage.
fn reap_orphaned_servers(node: &Path) {
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::All, true);

    let ours = std::process::id();
    let this_app = std::env::current_exe().ok();
    for process in system.processes().values() {
        if process.pid().as_u32() == ours || process.exe() != Some(node) {
            continue;
        }
        let parent_is_virgo = process
            .parent()
            .and_then(|pid| system.process(pid))
            .is_some_and(|parent| parent.exe().is_some() && parent.exe() == this_app.as_deref());
        if parent_is_virgo {
            log(&format!(
                "leaving pid {} alone: it belongs to a copy of Virgo that is still running",
                process.pid()
            ));
            continue;
        }
        log(&format!(
            "killing a server left behind by an earlier run (pid {})",
            process.pid()
        ));
        process.kill();
    }
}

/// The running Node process, kept so it can be killed on exit.
///
/// A webview closing does not reap its server: without this the process
/// survives the window, keeps the port, and a second launch picks a different
/// one and leaks another. Held globally rather than in Tauri state because the
/// exit handler runs after managed state has been torn down.
static SERVER: Mutex<Option<Child>> = Mutex::new(None);

/// How long the server gets to answer before the splash reports failure.
///
/// Generous on purpose: this is a cold Node start plus Next's first render, on
/// whatever disk the user has, possibly through an antivirus filter driver on
/// Windows. Ten seconds is comfortable on a dev machine and not always enough
/// on a cold laptop.
const READY_TIMEOUT: Duration = Duration::from_secs(45);

/// Appends a line to `%TEMP%\virgo-desktop.log`.
///
/// A release build sets `windows_subsystem = "windows"`, which means no console
/// is attached and every `println!` goes nowhere. Without this, a failure to
/// start is invisible: the window shows the splash's error text and there is no
/// way to find out what the shell actually tried. `println!` is kept as well
/// for `cargo tauri dev`, where there is a terminal to read.
fn log(message: &str) {
    println!("[shell] {message}");
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(log_path()) {
        let _ = writeln!(file, "{message}");
    }
}

fn log_path() -> PathBuf {
    std::env::temp_dir().join("virgo-desktop.log")
}

/// How big the log may grow before a launch starts a fresh one.
///
/// It only ever grew: every launch and every line Next printed was appended to
/// the same file in temp, for as long as the app had been installed. Two
/// megabytes holds many launches' worth, which is all anyone reads it for.
const LOG_LIMIT: u64 = 2 * 1024 * 1024;

/// Moves an oversized log aside as `virgo-desktop.log.old`, replacing the
/// previous one, so there is at most one launch-sized history behind the
/// current file. Once per launch, before anything is written.
fn rotate_log() {
    let path = log_path();
    let Ok(meta) = std::fs::metadata(&path) else {
        return;
    };
    if meta.len() >= LOG_LIMIT {
        let _ = std::fs::rename(&path, path.with_extension("log.old"));
    }
}

/// Drops Windows' `\\?\` extended-length prefix from a path.
///
/// `AppHandle::path().resolve()` canonicalises, and on Windows canonicalising
/// yields the extended-length form. Rust and the Win32 API accept it happily —
/// Node does not. Handed `\\?\C:\…\web` as a working directory it exits
/// immediately, before printing anything, which surfaces as a `spawn()` that
/// returns `Ok` for a process that is already gone.
///
/// Only the plain drive form is unwrapped. `\\?\UNC\server\share` is left alone
/// because stripping the prefix there produces `UNC\server\share`, which is not
/// a path at all.
fn strip_extended_prefix(path: PathBuf) -> PathBuf {
    let text = path.to_string_lossy();
    match text.strip_prefix(r"\\?\") {
        Some(rest) if !rest.starts_with("UNC\\") => PathBuf::from(rest),
        _ => path,
    }
}

/// Finds the staged Next server.
///
/// Tauri's resource directory is not in the same place in every layout — a bare
/// `target/release` binary, an MSI install, an NSIS install and a macOS `.app`
/// each put it somewhere different, and `BaseDirectory::Resource` resolves to
/// only one of them. Rather than encode a guess, every plausible root is tried
/// and the first one actually holding `server.js` wins.
///
/// This was not defensive programming up front. The first build resolved to a
/// path that did not exist, the shell reported the failure to a splash screen
/// that could not be read from outside the app, and nothing spawned.
fn find_server_root(handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(path) = handle
        .path()
        .resolve("web", tauri::path::BaseDirectory::Resource)
    {
        candidates.push(strip_extended_prefix(path));
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            // Bare `cargo tauri build` output, and the NSIS install root.
            candidates.push(dir.join("web"));
            // MSI, and Tauri's usual Windows resource convention.
            candidates.push(dir.join("resources").join("web"));
            // macOS: the executable lives in Contents/MacOS.
            candidates.push(dir.join("..").join("Resources").join("web"));
        }
    }

    for candidate in &candidates {
        if candidate.join("server.js").is_file() {
            return Ok(candidate.clone());
        }
    }

    Err(format!(
        "Could not find server.js. Looked in:\n{}",
        candidates
            .iter()
            .map(|p| format!("  {}", p.display()))
            .collect::<Vec<_>>()
            .join("\n")
    ))
}

/// The port the app serves itself on.
///
/// Fixed, and that is a CORS requirement rather than a preference. The webview
/// loads the app from `http://127.0.0.1:<APP_PORT>` and calls `api.virgo.ph`
/// directly from there, so this address is the `Origin` header on every
/// request. The API matches Origin against a list of exact strings, so a port
/// chosen fresh each launch could never be on that list — which is exactly what
/// the first version of this file did, and every request failed the preflight
/// with "Could not reach the server".
///
/// Chosen from the ephemeral range but well away from the ports this project
/// already uses: 3000 is the web dev server, 3001 the API, 4123 the Tauri dev
/// server.
const APP_PORT: u16 = 41730;

/// Whether `APP_PORT` can be bound right now.
///
/// There is a race between this check and Node binding, which is unavoidable
/// and harmless: losing it surfaces as a failed start with the message below,
/// never as a connection to the wrong server.
fn port_available(port: u16) -> bool {
    TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, port)).is_ok()
}

/// The bundled Node runtime.
///
/// Tauri strips the target triple off a sidecar when bundling and places it
/// beside the app executable, so this looks there first. The PATH fallback is
/// what makes `cargo tauri dev` work without staging a sidecar into
/// `target/debug/` — in a bundled app the sidecar is always present and the
/// fallback never runs.
fn node_binary() -> PathBuf {
    let name = if cfg!(windows) { "node.exe" } else { "node" };

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let sidecar = dir.join(name);
            if sidecar.is_file() {
                return sidecar;
            }
        }
    }

    PathBuf::from(name)
}

/// Blocks until something is listening on `port`, or the timeout expires.
///
/// A TCP connect rather than an HTTP request: Next's startup banner has changed
/// wording between majors and matching on it would break at the next upgrade,
/// whereas "the socket accepts" is stable. The short settle afterwards covers
/// the gap between `listen()` and the first route being able to render.
fn wait_for_server(port: u16, timeout: Duration) -> bool {
    let addr = SocketAddrV4::new(Ipv4Addr::LOCALHOST, port);
    let deadline = Instant::now() + timeout;

    while Instant::now() < deadline {
        if TcpStream::connect_timeout(&addr.into(), Duration::from_millis(500)).is_ok() {
            thread::sleep(Duration::from_millis(250));
            return true;
        }
        thread::sleep(Duration::from_millis(150));
    }

    false
}

/// Starts the Next server and hands back the port it was told to use.
fn start_server(resources: PathBuf) -> Result<u16, String> {
    let server_js = resources.join("server.js");
    if !server_js.is_file() {
        return Err(format!(
            "No server at {}. Run `node scripts/stage-web.mjs` before building.",
            server_js.display()
        ));
    }

    let node = node_binary();
    log(&format!("node binary: {}", node.display()));

    // Before claiming the port, clear anything this app left running last time.
    // A build without the job object below could orphan its server, and that
    // orphan both holds the port and — more damagingly — keeps `node.exe` open
    // in the install directory, which is what makes an installer or an in-app
    // update fail partway through.
    reap_orphaned_servers(&node);

    if !port_available(APP_PORT) {
        // Reaching here means the holder is not a server this build started —
        // those were just cleared. It can still be Virgo: a copy installed
        // somewhere else runs a different `node` and is deliberately left
        // alone, which is exactly what happens when a development build meets
        // an installed one.
        return Err(format!(
            "Port {APP_PORT} is already in use. Virgo serves itself on this exact port \
             because it is the origin the API accepts — on any other port every request \
             is refused at the CORS preflight. Close the other copy of Virgo, or whatever \
             else is holding the port, and try again."
        ));
    }

    let port = APP_PORT;

    let mut command = Command::new(&node);

    // Before server.js, so it is in place when Next names its process: on
    // macOS that name checks the server in with Launch Services as an app of
    // its own, and a "node" tile appeared in the Dock beside Virgo. The file
    // is staged beside server.js; a build staged before it existed starts
    // without it, as it always did.
    #[cfg(target_os = "macos")]
    {
        let keep_title = resources.join("keep-process-title.cjs");
        if keep_title.is_file() {
            command.arg("--require").arg(&keep_title);
        }
    }

    command
        .arg(&server_js)
        // `current_dir` matters: Next resolves `.next/static` and `public`
        // relative to the working directory, not to server.js.
        .current_dir(&resources)
        .env("NODE_ENV", "production")
        .env("PORT", port.to_string())
        // Loopback only. The default binds every interface, which would put a
        // signed-in session on the local network for as long as the app is open.
        .env("HOSTNAME", "127.0.0.1")
        .env("NEXT_TELEMETRY_DISABLED", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Keeps the console window from flashing up on Windows.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not start the Node runtime: {e}"))?;

    // Immediately, and before anything can go wrong further down: from here on
    // the child cannot outlive this process, however this process ends.
    tie_child_to_this_process(&child);

    // Next's output is the only diagnostic when a start fails, and a piped
    // stream that nobody reads fills its buffer and blocks the writer. Drained
    // on background threads and forwarded to the terminal in a dev run.
    for stream in [
        child.stdout.take().map(|s| Box::new(s) as Box<dyn std::io::Read + Send>),
        child.stderr.take().map(|s| Box::new(s) as Box<dyn std::io::Read + Send>),
    ]
    .into_iter()
    .flatten()
    {
        thread::spawn(move || {
            for line in BufReader::new(stream).lines().map_while(Result::ok) {
                log(&format!("[next] {line}"));
            }
        });
    }

    // A process that dies on startup still returns `Ok` from `spawn` — the
    // failure happens after the handle exists. Without this the only symptom is
    // `wait_for_server` timing out 45 seconds later against a process that has
    // not existed for most of that time.
    thread::sleep(Duration::from_millis(600));
    if let Ok(Some(status)) = child.try_wait() {
        return Err(format!(
            "The Node runtime exited immediately with {status}. Server root: {}",
            resources.display()
        ));
    }

    *SERVER.lock().unwrap() = Some(child);
    Ok(port)
}

/// Stops the server. Safe to call more than once.
fn stop_server() {
    // Before the kill, so the watchdog reads it as a deliberate stop and does
    // not race us to restart a server we are in the middle of shutting down.
    SHUTTING_DOWN.store(true, Ordering::SeqCst);

    if let Some(mut child) = SERVER.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

/// Set by `stop_server`, so the watchdog can tell a quit from a crash.
static SHUTTING_DOWN: AtomicBool = AtomicBool::new(false);

/// How often the watchdog asks whether the server is still there.
///
/// A second is far below what anyone notices and costs nothing — it is one
/// non-blocking `try_wait` on a process handle.
const WATCH_EVERY: Duration = Duration::from_secs(1);

/// How many times a dead server is restarted before the app gives up.
///
/// Bounded because a server that cannot start will not start on the tenth
/// attempt either, and a loop that keeps trying forever spends the user's
/// battery showing them the same blank window.
const MAX_RESTARTS: u32 = 3;

/// How long a restarted server has to stay up before its earlier crashes stop
/// counting towards `MAX_RESTARTS`.
///
/// The count never went down, so three unrelated crashes across a week of the
/// app being left open used up the allowance, and the fourth, however far
/// apart, ended in "Virgo stopped responding". A server that keeps dying fails
/// well inside this window; one that has run for ten minutes is healthy.
const HEALTHY_AFTER: Duration = Duration::from_secs(10 * 60);

/// Watches the server for the rest of the app's life.
///
/// Startup was already supervised — a 45-second timeout and an error on the
/// splash. Nothing watched it afterwards. Once the webview had moved to the
/// server, a Node process that died took the app with it silently: no error,
/// no restart, just a window that loads forever. That is what killing the
/// helper process by hand looked like, and it is also what an out-of-memory
/// kill or a crashed render would look like.
///
/// The webview cannot be told about this through Tauri's event system. The app
/// page is served from a loopback address, which the webview treats as remote,
/// and Tauri injects its API only into its own pages — so `emit` reaches the
/// splash and nothing else. `eval` does reach it, which is why recovery is
/// driven by evaluating a reload rather than by asking the page to do anything.
fn supervise(handle: tauri::AppHandle, resources: PathBuf, port: u16) {
    thread::spawn(move || {
        let mut restarts = 0u32;
        let mut last_restart: Option<Instant> = None;

        loop {
            thread::sleep(WATCH_EVERY);

            if SHUTTING_DOWN.load(Ordering::SeqCst) {
                return;
            }

            // The lock is held only for the poll itself. `wait()` would be
            // simpler but would hold it for the life of the process, and
            // `stop_server` needs it to quit.
            let exited = {
                let mut guard = SERVER.lock().unwrap();
                match guard.as_mut() {
                    Some(child) => child.try_wait().ok().flatten(),
                    // Taken by stop_server between the check above and here.
                    None => return,
                }
            };

            let Some(status) = exited else {
                if restarts > 0 && last_restart.is_some_and(|at| at.elapsed() >= HEALTHY_AFTER) {
                    log(&format!(
                        "the server has stayed up since its last restart — {restarts} earlier restart(s) no longer count"
                    ));
                    restarts = 0;
                    last_restart = None;
                }
                continue;
            };

            // Drop the handle before restarting, so `start_server` is not
            // storing a child into a slot that still holds the dead one.
            SERVER.lock().unwrap().take();

            restarts += 1;
            log(&format!(
                "the server exited on its own with {status} — restart {restarts} of {MAX_RESTARTS}"
            ));

            if restarts > MAX_RESTARTS {
                log("giving up on restarting the server");
                report_lost(&handle);
                return;
            }

            // The port was held by the process that just died, and the next
            // thing `start_server` does is refuse to start if it is still
            // taken. A moment's grace is cheaper than spending an attempt on
            // the operating system not having caught up yet.
            thread::sleep(Duration::from_millis(500));

            match start_server(resources.clone()).and_then(|restarted| {
                if wait_for_server(restarted, READY_TIMEOUT) {
                    Ok(restarted)
                } else {
                    Err(format!("the restarted server did not answer on port {restarted}"))
                }
            }) {
                Ok(_) => {
                    last_restart = Some(Instant::now());
                    log("server back up — reloading the webview");
                    if let Some(window) = handle.get_webview_window("main") {
                        // `replace`, not `reload`: a reload would replay
                        // whatever request failed while the server was gone,
                        // which for a POST means asking the browser to resend
                        // it. The app is a client-rendered SPA, so landing on
                        // the root costs a navigation and nothing else.
                        let _ = window.eval(format!(
                            "window.location.replace('http://127.0.0.1:{port}/')"
                        ));
                    }
                }
                Err(message) => {
                    log(&format!("restart failed: {message}"));
                    // Round again: the count is what stops this, not this arm.
                }
            }
        }
    });
}

/// Tells the user the app is not coming back, in the window they are looking at.
///
/// Written straight into the document rather than navigated to, because the
/// page in the webview is the dead server's and there is nothing left to serve
/// a page from. Deliberately plain: no styling to load, no request to make.
fn report_lost(handle: &tauri::AppHandle) {
    let Some(window) = handle.get_webview_window("main") else {
        return;
    };

    let _ = window.eval(
        r#"document.documentElement.innerHTML =
            '<body style="margin:0;display:grid;place-items:center;height:100vh;' +
            'background:#161311;color:#f2ede8;font:15px system-ui,sans-serif;text-align:center">' +
            '<div style="max-width:32rem;padding:0 1.5rem">' +
            '<h1 style="font-size:19px;margin:0 0 .5rem">Virgo stopped responding</h1>' +
            '<p style="margin:0;color:#948278;line-height:1.6">The part of the app that runs in the ' +
            'background closed and could not be restarted. Quit Virgo and open it again. If it keeps ' +
            'happening, the log is at virgo-desktop.log in your temporary files folder.</p>' +
            '</div></body>';"#,
    );
}

/// The Next dev server `cargo tauri dev` points the window at (`devUrl`).
const DEV_PORT: u16 = 4123;

/// Whether the window may show `url` itself: its own splash, the app it
/// serves, and, in a dev build, the dev server.
///
/// The splash is `tauri://localhost` on macOS and `http://tauri.localhost` on
/// Windows. `about:` and `blob:` are the webview's own and never leave it.
fn is_app_url(url: &Url) -> bool {
    match url.scheme() {
        "tauri" | "about" | "blob" => true,
        "http" | "https" => match url.host_str() {
            Some("tauri.localhost") => true,
            Some("127.0.0.1") => {
                let port = url.port_or_known_default();
                port == Some(APP_PORT) || (cfg!(debug_assertions) && port == Some(DEV_PORT))
            }
            _ => false,
        },
        _ => false,
    }
}

/// The fragment the web app puts on a link it knows is a download.
///
/// A navigation is decided before its response arrives, so nothing here can
/// tell a download from a page. The two downloads the app offers — an
/// original, and an album as a zip — are signed links served as attachments,
/// and the app marks them; anything else outside the app goes to the browser.
/// A fragment never reaches the server, so the signature is untouched.
const DOWNLOAD_MARK: &str = "virgo-download";

fn is_marked_download(url: &Url) -> bool {
    // Plain http only in a dev build, whose API may be a local one.
    let secure = url.scheme() == "https" || (cfg!(debug_assertions) && url.scheme() == "http");
    secure && url.fragment() == Some(DOWNLOAD_MARK)
}

/// Hands a link the window will not show to the system browser.
///
/// Links out of the app did nothing at all: Terms and Privacy on sign-up, the
/// Open on a share link, a profile's website, a public page. The webview was
/// asked to navigate away from the app, or to open a window it had no way to
/// draw. Only web and mail links go anywhere; any other scheme a page asks for
/// is dropped. The log names the host only, because these are often signed
/// links whose query is a credential.
fn open_outside<R: tauri::Runtime>(handle: &tauri::AppHandle<R>, url: &Url) {
    if !matches!(url.scheme(), "http" | "https" | "mailto") {
        log(&format!("not opening a {} link", url.scheme()));
        return;
    }
    let host = url.host_str().unwrap_or("").to_owned();
    if let Err(error) = handle.opener().open_url(url.as_str(), None::<&str>) {
        log(&format!("could not open a link to {host} in the browser: {error}"));
    } else {
        log(&format!("opened a link to {host} in the browser"));
    }
}

/// Where each download in progress is being written, by URL.
///
/// Kept from the start of a download because macOS reports no path when it
/// finishes, and the app wants to say which file was saved.
static DOWNLOADS: Mutex<Option<HashMap<String, PathBuf>>> = Mutex::new(None);

/// Saves downloads to the Downloads folder and tells the page when each ends.
///
/// Without a handler a download did nothing on macOS and showed WebView2's own
/// panel on Windows, while the app said "Your browser takes it from here". The
/// destination the webview proposes is already the right one — the Downloads
/// folder, the server's file name, numbered rather than overwriting — so it is
/// kept. The page hears about the end through a DOM event, the only channel
/// that reaches a page served from the loopback address.
fn on_download<R: tauri::Runtime>(webview: tauri::Webview<R>, event: DownloadEvent<'_>) -> bool {
    match event {
        DownloadEvent::Requested { url, destination } => {
            log(&format!(
                "download from {} to {}",
                url.host_str().unwrap_or("?"),
                destination.display()
            ));
            DOWNLOADS
                .lock()
                .unwrap()
                .get_or_insert_with(HashMap::new)
                .insert(url.to_string(), destination.clone());
            true
        }
        DownloadEvent::Finished { url, path, success } => {
            let planned = DOWNLOADS
                .lock()
                .unwrap()
                .as_mut()
                .and_then(|map| map.remove(url.as_str()));
            let path = path.or(planned);
            let name = path
                .as_deref()
                .and_then(Path::file_name)
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_else(|| "The file".to_owned());
            log(&format!("download {}: {name}", if success { "finished" } else { "failed" }));

            // Only where it certainly exists: "Show in folder" on a file that
            // never arrived would open the folder and find nothing.
            let shown = path.filter(|_| success).map(|p| p.display().to_string());
            let detail = serde_json::json!({ "name": name, "path": shown, "ok": success });
            let _ = webview.eval(format!(
                "window.dispatchEvent(new CustomEvent('virgo:download-finished', {{ detail: {detail} }}))"
            ));
            true
        }
        _ => true,
    }
}

/// Reload, Back and Forward in the macOS menu bar, and a Quit that asks.
///
/// The default menu has none of them, so on a Mac there was no way to reload
/// a page that had gone wrong, and no keyboard Back. Windows needs nothing:
/// WebView2 keeps F5 and Alt+Left itself.
#[cfg(target_os = "macos")]
fn add_navigation_menu(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, MenuItemKind, PredefinedMenuItem};

    let handle = app.handle();
    let menu = Menu::default(handle)?;
    let reload = MenuItem::with_id(handle, "virgo-reload", "Reload", true, Some("CmdOrCtrl+R"))?;
    let back = MenuItem::with_id(handle, "virgo-back", "Back", true, Some("CmdOrCtrl+["))?;
    let forward = MenuItem::with_id(handle, "virgo-forward", "Forward", true, Some("CmdOrCtrl+]"))?;
    let separator = PredefinedMenuItem::separator(handle)?;

    // Into the existing View menu, where a Mac app keeps Reload.
    let view = menu.items()?.into_iter().find_map(|item| match item {
        MenuItemKind::Submenu(submenu) if submenu.text().ok().as_deref() == Some("View") => Some(submenu),
        _ => None,
    });
    match view {
        Some(view) => view.append_items(&[&separator, &reload, &back, &forward])?,
        None => log("no View menu to add Reload to"),
    }

    // Quit by closing the window, rather than the predefined item's straight
    // terminate. Terminating is not a close, so nothing could ask first: ⌘Q
    // with uploads running dropped them, where the red button asks. Once the
    // window has closed the app exits as it always did, because the last
    // window going is what ends it.
    let quit = MenuItem::with_id(handle, "virgo-quit", "Quit Virgo", true, Some("CmdOrCtrl+Q"))?;
    if let Some(MenuItemKind::Submenu(app_menu)) = menu.items()?.into_iter().next() {
        let predefined = app_menu.items()?.into_iter().enumerate().find_map(|(position, item)| match item {
            MenuItemKind::Predefined(item)
                if item.text().is_ok_and(|text| text.replace('&', "").starts_with("Quit")) =>
            {
                Some((position, item))
            }
            _ => None,
        });
        match predefined {
            Some((position, item)) => {
                app_menu.remove(&item)?;
                app_menu.insert(&quit, position)?;
            }
            None => log("no Quit item to replace"),
        }
    }
    app.set_menu(menu)?;

    app.on_menu_event(|app, event| {
        if event.id().as_ref() == "virgo-quit" {
            match app.get_webview_window("main") {
                Some(window) => {
                    let _ = window.close();
                }
                None => app.exit(0),
            }
            return;
        }
        let script = match event.id().as_ref() {
            "virgo-reload" => "window.location.reload()",
            "virgo-back" => "window.history.back()",
            "virgo-forward" => "window.history.forward()",
            _ => return,
        };
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.eval(script);
        }
    });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    rotate_log();

    let builder = tauri::Builder::default();

    // First, as the plugin requires: a second launch has to exit before
    // anything else starts, and above all before `start_server` goes looking
    // for the port. It brings the open window forward instead. Clicking a
    // Windows notification launches the app again too, so this is also what
    // brings Virgo forward from one.
    //
    // Release builds only. The lock is keyed on the app's identifier, which a
    // `cargo tauri dev` build shares, so with the installed app open a dev run
    // would focus it and quit. A dev build starts no server and uses its own
    // port, so the two never got in each other's way.
    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        log("another launch — focusing the open window instead");
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));

    builder
        // Restores the window to where it was left, and saves it on exit.
        // Opening at the same centred 1280x860 every launch, whatever the user
        // did last time, is a small thing that reads as "web page in a frame"
        // rather than as an application.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // Kept as the fallback route to an installer, and for any other link
        // the app needs to hand to the browser.
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Desktop alerts: a notification that arrives while the window is behind
        // others shows in the system's notification centre. The web client asks
        // through the standard Notification API, which this plugin provides.
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Built here rather than by Tauri from the config, which is the
            // only way to attach what happens to links and downloads. The
            // config still says everything else about the window; it is
            // marked `"create": false` so it is not made twice.
            let config = app
                .config()
                .app
                .windows
                .iter()
                .find(|window| window.label == "main")
                .cloned()
                .ok_or("tauri.conf.json has no main window")?;
            let navigating = app.handle().clone();
            let opening = app.handle().clone();
            WebviewWindowBuilder::from_config(app.handle(), &config)?
                .on_navigation(move |url| {
                    if is_app_url(url) || is_marked_download(url) {
                        return true;
                    }
                    open_outside(&navigating, url);
                    false
                })
                // target="_blank" and window.open: never a second webview,
                // which would be a bare window with no way back to the app.
                .on_new_window(move |url, _features| {
                    open_outside(&opening, &url);
                    NewWindowResponse::Deny
                })
                .on_download(on_download)
                .build()?;

            #[cfg(target_os = "macos")]
            add_navigation_menu(app)?;

            // Windows draws a title bar the app replaces with its own, so the
            // system one is turned off before the window is ever shown.
            //
            // Done here rather than in tauri.windows.conf.json, which is the
            // documented way and did not take effect — the built app kept
            // WS_CAPTION and showed two title bars, one above the other. This
            // is explicit and verifiable, and it keeps every window decision in
            // one place instead of splitting them across two config files.
            //
            // macOS is untouched on purpose: there the traffic lights *are* the
            // decorations, and turning them off would take the native controls
            // with them. It keeps them and the overlay title bar style.
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "windows")]
                let _ = window.set_decorations(false);

                // The window is created hidden so the frame above is never
                // painted and then removed, which reads as a flicker on launch.
                let _ = window.show();
            }

            // In `cargo tauri dev` the webview is already pointed at the Next
            // dev server named by `devUrl`, which `beforeDevCommand` started.
            // Spawning the staged production server too would start a second
            // Next on another port and then navigate away from the one with
            // hot reload attached.
            if cfg!(debug_assertions) {
                println!("[shell] dev build — using devUrl, not starting a server");
                return Ok(());
            }

            let handle = app.handle().clone();

            // The window is already up showing `splash/index.html`, so this
            // work happens off the main thread — blocking here would leave the
            // splash unpainted for the whole of Next's cold start.
            thread::spawn(move || {
                let fail = |handle: &tauri::AppHandle, message: String| {
                    log(&format!("FAILED: {message}"));
                    let _ = handle.emit("startup-failed", message);
                };

                log("starting");

                let resources = match find_server_root(&handle) {
                    Ok(path) => {
                        log(&format!("server root: {}", path.display()));
                        path
                    }
                    Err(message) => return fail(&handle, message),
                };

                // Cloned: the watchdog below needs the same path to restart
                // from, and `start_server` takes it by value.
                let port = match start_server(resources.clone()) {
                    Ok(port) => {
                        log(&format!("node spawned, waiting on port {port}"));
                        port
                    }
                    Err(message) => return fail(&handle, message),
                };

                if !wait_for_server(port, READY_TIMEOUT) {
                    return fail(
                        &handle,
                        format!("The server did not answer on port {port} within 45s."),
                    );
                }

                log(&format!("ready — moving the webview to port {port}"));

                match handle.get_webview_window("main") {
                    // `location.replace` rather than an assignment so the splash
                    // does not become a back-history entry.
                    Some(window) => {
                        let _ = window.eval(format!(
                            "window.location.replace('http://127.0.0.1:{port}/')"
                        ));

                        // From here the splash is gone and `startup-failed` can
                        // no longer reach anybody, so the server needs watching
                        // by something that does not depend on the page.
                        supervise(handle.clone(), resources, port);
                    }
                    None => fail(&handle, "The main window was gone by the time the server was ready.".into()),
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build the Virgo desktop shell")
        .run(|_handle, event| {
            // Covers both the last window closing and the process being asked
            // to quit; `stop_server` is idempotent so the overlap is harmless.
            if let tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit = event {
                stop_server();
            }
        });
}
