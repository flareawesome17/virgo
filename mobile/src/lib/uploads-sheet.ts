import { useSyncExternalStore } from 'react';

/**
 * Two facts about uploads that more than one part of the screen needs: whether
 * the list of uploads is open, and whether an album is showing its upload bar.
 *
 * The list is one sheet, mounted once over the whole app (UploadRing), and
 * opened from two places: the floating ring, and the bar an album shows while
 * files are going into it. And the two are one indicator in two shapes: where
 * the bar is on screen, the ring is not. Neither can read the other's state
 * through props, so it lives here.
 */
let sheetOpen = false;
let barShowing = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const uploadsSheet = {
  open(): void {
    if (sheetOpen) return;
    sheetOpen = true;
    emit();
  },
  close(): void {
    if (!sheetOpen) return;
    sheetOpen = false;
    emit();
  },
  /** Told by the bar itself, as it comes and goes. */
  setBarShowing(showing: boolean): void {
    if (barShowing === showing) return;
    barShowing = showing;
    emit();
  },
};

export function useUploadsSheetOpen(): boolean {
  return useSyncExternalStore(subscribe, () => sheetOpen, () => false);
}

export function useUploadBarShowing(): boolean {
  return useSyncExternalStore(subscribe, () => barShowing, () => false);
}
