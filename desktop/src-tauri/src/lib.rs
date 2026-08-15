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

use std::io::{BufRead, BufReader, Write};
use std::net::{Ipv4Addr, SocketAddrV4, TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::{Emitter, Manager};

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
    let path = std::env::temp_dir().join("virgo-desktop.log");
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{message}");
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

    if !port_available(APP_PORT) {
        return Err(format!(
            "Port {APP_PORT} is already in use. Virgo serves itself on this exact port \
             because it is the origin the API accepts — on any other port every request \
             is refused at the CORS preflight. Quit the other copy of Virgo, or whatever \
             else is holding the port, and try again."
        ));
    }

    let port = APP_PORT;
    let node = node_binary();
    log(&format!("node binary: {}", node.display()));

    let mut command = Command::new(&node);
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
    if let Some(mut child) = SERVER.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
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

                let port = match start_server(resources) {
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
                        let _ = window.eval(&format!(
                            "window.location.replace('http://127.0.0.1:{port}/')"
                        ));
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
