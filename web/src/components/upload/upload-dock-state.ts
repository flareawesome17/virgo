/** Pure logic for the upload dock. Only `import type` allowed (tests load it directly). */

export interface DockItem {
  status: 'queued' | 'uploading' | 'done' | 'failed' | 'cancelled' | 'skipped';
  sizeBytes: number;
  progress: number;
  skipReason?: 'duplicate' | 'possible';
  albumName?: string;
}

export interface BatchSummary {
  total: number;
  done: number;
  failed: number;
  uploading: number;
  queued: number;
  duplicates: number;
  possible: number;
  /** 0..1, byte-weighted, cancelled and skipped excluded. */
  fraction: number;
  remainingBytes: number;
  album: string | null;
}

export function summarize(items: readonly DockItem[]): BatchSummary {
  const count = (status: DockItem['status']) => items.filter((i) => i.status === status).length;
  const counted = items.filter((i) => i.status !== 'cancelled' && i.status !== 'skipped');
  const totalBytes = counted.reduce((s, i) => s + i.sizeBytes, 0);
  const doneBytes = counted.reduce((s, i) => s + i.sizeBytes * i.progress, 0);
  const albums = new Set(counted.map((i) => i.albumName).filter(Boolean));
  return {
    total: counted.length,
    done: count('done'),
    failed: count('failed'),
    uploading: count('uploading'),
    queued: count('queued'),
    duplicates: items.filter((i) => i.status === 'skipped' && i.skipReason === 'duplicate').length,
    possible: items.filter((i) => i.status === 'skipped' && i.skipReason === 'possible').length,
    fraction: totalBytes > 0 ? doneBytes / totalBytes : 0,
    remainingBytes: totalBytes - doneBytes,
    album: albums.size === 1 ? ([...albums][0] as string) : null,
  };
}

export type DockStatus = 'idle' | 'checking' | 'uploading' | 'failed' | 'done';

export function dockStatus(s: BatchSummary, checking: number): DockStatus {
  if (s.queued + s.uploading > 0) return 'uploading';
  if (checking > 0) return 'checking';
  if (s.failed > 0) return 'failed';
  if (s.done > 0 || s.duplicates + s.possible > 0) return 'done';
  return 'idle';
}

export function filesLeft(s: BatchSummary, checking: number): number {
  return s.queued + s.uploading + checking;
}

export function badgeText(n: number): string {
  return n > 99 ? '99+' : String(Math.max(0, Math.floor(n)));
}

export function badge(
  status: DockStatus,
  s: BatchSummary,
  checking: number,
): { text: string; tone: 'neutral' | 'danger' } | null {
  if (status === 'uploading' || status === 'checking') {
    return { text: badgeText(filesLeft(s, checking)), tone: 'neutral' };
  }
  if (status === 'failed') return { text: badgeText(s.failed), tone: 'danger' };
  return null;
}

export function ringDash(fraction: number, radius: number): { circumference: number; offset: number } {
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  const circumference = 2 * Math.PI * radius;
  return { circumference, offset: circumference * (1 - f) };
}

/** Distances in px from the viewport bottom to the icon's bottom edge. */
export interface DockBounds {
  floor: number;
  ceiling: number;
}

export function dockBounds(i: {
  viewportHeight: number;
  size: number;
  floorOffset: number;
  topInset: number;
  margin: number;
}): DockBounds {
  const floor = i.margin + Math.max(0, i.floorOffset);
  return { floor, ceiling: Math.max(floor, i.viewportHeight - i.topInset - i.size - i.margin) };
}

export function clampDockBottom(desired: number, b: DockBounds): number {
  if (!Number.isFinite(desired)) return b.floor;
  return Math.min(b.ceiling, Math.max(b.floor, desired));
}

/** Keyboard move for the focused icon: a delta, or a limit to jump to. */
export function nudge(key: string, shift: boolean): number | 'floor' | 'ceiling' | null {
  const step = shift ? 64 : 16;
  if (key === 'ArrowUp') return step;
  if (key === 'ArrowDown') return -step;
  if (key === 'Home') return 'ceiling';
  if (key === 'End') return 'floor';
  return null;
}

export function parseStoredBottom(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function dockLabel(status: DockStatus, s: BatchSummary, checking: number): string {
  if (status === 'failed') return `${s.failed} upload${s.failed === 1 ? '' : 's'} failed. Open uploads`;
  if (status === 'done') return 'Uploads done. Open uploads';
  const left = filesLeft(s, checking);
  const pct = Math.round(Math.min(1, Math.max(0, s.fraction)) * 100);
  return `Uploads, ${left} file${left === 1 ? '' : 's'} left, ${pct}%. Open uploads`;
}

export interface DockState {
  batchId: number;
  minimised: boolean;
  /** Failed count the person has already seen; only more failures re-open. */
  failedAck: number;
}
export type DockEvent =
  | { type: 'batch-started' }
  | { type: 'minimise'; failed: number }
  | { type: 'expand' }
  | { type: 'failed-changed'; failed: number };

export const INITIAL_DOCK: DockState = { batchId: 0, minimised: false, failedAck: 0 };

export function shouldAutoOpen(state: DockState, failed: number): boolean {
  return state.minimised && failed > state.failedAck;
}

export function dockReducer(state: DockState, event: DockEvent): DockState {
  switch (event.type) {
    case 'batch-started':
      return { batchId: state.batchId + 1, minimised: false, failedAck: 0 };
    case 'minimise':
      return { ...state, minimised: true, failedAck: event.failed };
    case 'expand':
      return state.minimised ? { ...state, minimised: false } : state;
    case 'failed-changed': {
      if (shouldAutoOpen(state, event.failed)) {
        return { ...state, minimised: false, failedAck: event.failed };
      }
      const ack = Math.min(state.failedAck, event.failed);
      return ack === state.failedAck ? state : { ...state, failedAck: ack };
    }
  }
}
