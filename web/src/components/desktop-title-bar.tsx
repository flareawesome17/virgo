'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';

/**
 * The desktop app's own title bar.
 *
 * Windows draws one and it looks like a browser frame around a web page, which
 * is the tell that gives the whole thing away. The desktop build turns
 * decorations off there and this replaces them.
 *
 * macOS keeps its native controls. `titleBarStyle: "Overlay"` already floats
 * the traffic lights over the app, and hand-drawn ones would be worse: people
 * know exactly how those behave — the hover glyphs, green for fullscreen,
 * option-click to zoom — and an approximation reads as wrong immediately. So
 * this renders only the draggable strip there and lets macOS own the buttons.
 *
 * Nothing here runs on the web: `NEXT_PUBLIC_VIRGO_DESKTOP` is set only by
 * `desktop/scripts/stage-web.mjs`.
 */

const IS_DESKTOP = process.env.NEXT_PUBLIC_VIRGO_DESKTOP === '1';
const IS_WINDOWS = process.env.NEXT_PUBLIC_DESKTOP_OS === 'windows';

/**
 * The slice of Tauri's window API this needs.
 *
 * Declared rather than imported: `@tauri-apps/api` is a dependency of the
 * desktop shell, not of the web app, and adding it to `web/` would ship it to
 * every browser to call four methods that only exist inside the app. The
 * global is there because the shell sets `withGlobalTauri`.
 */
interface TauriWindow {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  onResized(handler: () => void): Promise<() => void>;
}

interface TauriGlobal {
  window?: { getCurrentWindow?: () => TauriWindow };
}

function currentWindow(): TauriWindow | null {
  if (typeof window === 'undefined') return null;
  const tauri = (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
  return tauri?.window?.getCurrentWindow?.() ?? null;
}

/**
 * Windows' own glyphs, at the sizes it draws them.
 *
 * 10px strokes on a 46x32 button is what every other application on the system
 * looks like, and matching it is the entire point — a title bar that is nearly
 * right is more noticeable than one that is obviously custom.
 */
function MinimiseGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path d="M0 5h10" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  );
}

function MaximiseGlyph({ maximised }: { maximised: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      {maximised ? (
        <>
          <path d="M2.5 0.5h7v7h-2" stroke="currentColor" fill="none" strokeWidth="1" />
          <rect x="0.5" y="2.5" width="7" height="7" stroke="currentColor" fill="none" strokeWidth="1" />
        </>
      ) : (
        <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" fill="none" strokeWidth="1" />
      )}
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  );
}

export function DesktopTitleBar() {
  const [maximised, setMaximised] = useState(false);
  // Absent until the shell's IPC grant reaches the page. Kept in state so the
  // buttons are not rendered at all when they could not work — a dead close
  // button is worse than a window with no close button, because the second is
  // obviously a bug and the first looks like the app is hung.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!IS_DESKTOP) return;
    const win = currentWindow();
    if (!win) return;

    setReady(true);
    let unlisten: (() => void) | undefined;

    void win.isMaximized().then(setMaximised);
    void win.onResized(() => void win.isMaximized().then(setMaximised)).then(
      (off) => {
        unlisten = off;
      },
    );

    return () => unlisten?.();
  }, []);

  const minimise = useCallback(() => void currentWindow()?.minimize(), []);
  const toggle = useCallback(() => void currentWindow()?.toggleMaximize(), []);
  const close = useCallback(() => void currentWindow()?.close(), []);

  if (!IS_DESKTOP) return null;

  return (
    <div
      // What tells Tauri this strip drags the window. It works on the empty
      // space and on the mark, and not on the buttons, which stop the event.
      data-tauri-drag-region
      onDoubleClick={IS_WINDOWS ? toggle : undefined}
      className={
        'flex h-8 shrink-0 select-none items-center border-b bg-background ' +
        // macOS puts its traffic lights at the left, so the mark moves out of
        // their way rather than sitting underneath them.
        (IS_WINDOWS ? 'pl-3' : 'pl-20')
      }
    >
      <div data-tauri-drag-region className="flex items-center gap-2">
        <Image
          src="/logo.png"
          alt=""
          width={14}
          height={14}
          className="size-3.5 object-contain"
          // Decorative: the window is already named in the taskbar and the
          // sidebar says Virgo underneath.
          aria-hidden
        />
        <span className="text-xs font-medium text-muted-foreground">Virgo</span>
      </div>

      <div data-tauri-drag-region className="flex-1" />

      {IS_WINDOWS && ready && (
        <div className="flex h-full">
          <button
            type="button"
            onClick={minimise}
            aria-label="Minimise"
            className="grid h-full w-[46px] place-items-center text-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground"
          >
            <MinimiseGlyph />
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label={maximised ? 'Restore' : 'Maximise'}
            className="grid h-full w-[46px] place-items-center text-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground"
          >
            <MaximiseGlyph maximised={maximised} />
          </button>
          {/* The one control Windows colours on hover, and it is the same red
              everywhere on the system. */}
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="grid h-full w-[46px] place-items-center text-foreground/70 transition-colors hover:bg-[#c42b1c] hover:text-white"
          >
            <CloseGlyph />
          </button>
        </div>
      )}
    </div>
  );
}
