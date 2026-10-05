'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useRouter } from 'next/navigation';

/** What a person is asked before something they typed is thrown away. */
export const DISCARD_TITLE = 'Discard your changes?';
export const DISCARD_BODY = "What you've typed here will be lost.";

/*
 * Every form with something typed in it right now, by where it lives.
 *
 * The Create menu's dialogs open over whatever page is on screen, and used to
 * navigate to what they made. A router.push is not a link click, so nothing
 * asked first: a half-written job post was thrown away by making a workspace
 * on top of it. The Create dialogs are scoped as `create`; everything else is
 * the page's, and isPageDirty says whether leaving would lose any of it.
 */
const dirtyForms = new Map<symbol, string>();
const DiscardScopeContext = createContext('page');

/** Marks the guards beneath it as belonging somewhere other than the page. */
export const DiscardScope = DiscardScopeContext.Provider;

/** Whether a form outside the Create dialogs has unsaved changes. */
export function isPageDirty(): boolean {
  for (const scope of dirtyForms.values()) if (scope !== 'create') return true;
  return false;
}

/*
 * The one question a page is waiting on, answered by DiscardPrompt, which is
 * mounted once at the root.
 *
 * In the app rather than through window.confirm: the desktop shell's webview
 * is not guaranteed to draw a native confirm on every platform, and one that
 * answers no without asking would block every link on a page with something
 * typed in it, with nothing on screen to say why.
 */
let pendingDiscard: (() => void) | null = null;
const discardListeners = new Set<() => void>();

function setPendingDiscard(next: (() => void) | null): void {
  pendingDiscard = next;
  for (const listener of discardListeners) listener();
}

/** Asks whether to throw away what was typed; `onDiscard` runs on a yes. */
export function askToDiscard(onDiscard: () => void): void {
  setPendingDiscard(onDiscard);
}

/** For DiscardPrompt: whether it is asking, and its two answers. */
export function useDiscardQuestion(): {
  asking: boolean;
  keepEditing: () => void;
  discard: () => void;
} {
  const pending = useSyncExternalStore(
    (listener) => {
      discardListeners.add(listener);
      return () => discardListeners.delete(listener);
    },
    () => pendingDiscard,
    () => null,
  );
  return {
    asking: pending !== null,
    keepEditing: () => setPendingDiscard(null),
    discard: () => {
      const run = pendingDiscard;
      setPendingDiscard(null);
      run?.();
    },
  };
}

/**
 * Asks before a form with something typed in it is thrown away.
 *
 * The web twin of the phone's guard, minus the navigator it hooks into there.
 * A half-written profile went with a reload, a closed tab, or a click on the
 * sidebar, without a word. Now, while the form is dirty, the browser asks
 * before the page unloads, and a click on a link inside the app asks first
 * too. Client navigations that do not start from a link — a Back press, a
 * router.push from a button — are not caught; the links are where people
 * actually wander off.
 *
 * `values` is what the form holds; it is compared with what it held once it
 * was `ready` (straight away for a new one, after the saved values have been
 * filled in for an edit), so opening an edit and leaving it asks nothing.
 * While `ready` is false nothing is dirty, which is what lets a dialog pass
 * its `open` and stop guarding the moment it closes. Call `allowLeave` before
 * leaving after a save, which is a leave nobody needs to confirm; call
 * `markSaved` after a save that stays on the page.
 */
export function useDiscardGuard(
  values: unknown,
  ready = true,
): {
  dirty: boolean;
  allowLeave: () => void;
  /** After a save that stays on the screen: what is there now is kept. */
  markSaved: () => void;
} {
  const now = JSON.stringify(values);
  // State rather than a ref, so the snapshot is never read during render from
  // something React does not know changed. Taken during render, not in an
  // effect, so the first frame of a filled-in edit is already clean.
  const [base, setBase] = useState<string | null>(null);
  if (ready && base === null) setBase(now);
  const dirty = ready && base !== null && now !== base;
  const leaving = useRef(false);
  const router = useRouter();
  const scope = useContext(DiscardScopeContext);

  useEffect(() => {
    if (!dirty) return;
    const id = Symbol(scope);
    dirtyForms.set(id, scope);
    return () => {
      dirtyForms.delete(id);
    };
  }, [dirty, scope]);

  useEffect(() => {
    if (!dirty) return;

    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (leaving.current) return;
      event.preventDefault();
      // Older Chromium asks only when this is set too.
      event.returnValue = '';
    };

    // Capture on the document runs before React's own listeners on the root,
    // so a declined click never reaches next/link's handler at all.
    const click = (event: MouseEvent) => {
      if (leaving.current || event.defaultPrevented || event.button !== 0) return;
      // A modified click opens a new tab or window; this page stays as it is.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.hasAttribute('download')) return;
      const target = anchor.getAttribute('target');
      if (target && target !== '_self') return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      // Another site is a real unload, which beforeunload already covers.
      if (url.origin !== window.location.origin) return;
      // A jump within the page leaves the form where it is.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      // Held while the question is asked, then made by hand on a yes.
      event.preventDefault();
      event.stopPropagation();
      askToDiscard(() => {
        leaving.current = true;
        router.push(`${url.pathname}${url.search}${url.hash}`);
      });
    };

    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', click, true);
    };
  }, [dirty, router]);

  const allowLeave = useCallback(() => {
    leaving.current = true;
  }, []);

  // Taken again from the next render's values.
  const markSaved = useCallback(() => setBase(null), []);

  return { dirty, allowLeave, markSaved };
}

/**
 * Runs `leave` now when there is nothing to lose, and after a yes otherwise.
 *
 * For a page's own Back button, which no link capture sees.
 */
export function leaveIfDiscarded(dirty: boolean, leave: () => void): void {
  if (!dirty) leave();
  else askToDiscard(leave);
}

/**
 * A dialog's close, asked about first when its form is dirty.
 *
 * `close` goes to the Dialog's onOpenChange and its Cancel button, so
 * Escape, the overlay, the X and Cancel all ask; a save calls the dialog's
 * own onOpenChange(false) and closes without asking. While `asking`, the
 * dialog shows an AlertDialog of DISCARD_TITLE and DISCARD_BODY, whose
 * Keep editing is `keepEditing` and whose Discard is `discard`. A clean form
 * closes on the first Escape, as it always did.
 */
export function useGuardedClose(
  dirty: boolean,
  onOpenChange: (open: boolean) => void,
): {
  close: (open: boolean) => void;
  asking: boolean;
  keepEditing: () => void;
  discard: () => void;
} {
  const [asking, setAsking] = useState(false);
  return {
    close: (open) => {
      if (open || !dirty) onOpenChange(open);
      else setAsking(true);
    },
    asking,
    keepEditing: () => setAsking(false),
    discard: () => {
      setAsking(false);
      onOpenChange(false);
    },
  };
}

/**
 * A key that changes each time a dialog opens.
 *
 * A dialog that stays mounted between uses kept whatever was typed into it,
 * and a snapshot taken once could not tell this opening's changes from the
 * last one's. Keying the form on this gives every opening fresh state and a
 * fresh snapshot, while the dialog itself stays mounted long enough to
 * animate closed.
 */
export function useOpeningKey(open: boolean): number {
  const [seen, setSeen] = useState({ open, key: 0 });
  if (open !== seen.open) setSeen({ open, key: open ? seen.key + 1 : seen.key });
  return seen.key;
}
