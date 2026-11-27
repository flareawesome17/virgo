import { requireOptionalNativeModule } from 'expo';
import type { ItemResult, NativeItem } from './handoff-plan';

/**
 * The app's own background-upload module (modules/virgo-uploads), in builds
 * that have it: iOS hands every item to a background URL session, Android to
 * a foreground-service job (docs/BACKGROUND_UPLOADS.md). Builds from before it
 * have no such module, and those keep sending from JavaScript.
 */
interface VirgoUploadsModule {
  /** Resolves with how many were handed over; the rest are in takeResults. */
  enqueue(items: NativeItem[]): Promise<number>;
  /** Ids the system still holds. */
  active(): Promise<string[]>;
  /** What finished since the last call, oldest first. Emptied as it is read. */
  takeResults(): Promise<(ItemResult & { etag?: string })[]>;
  cancel(ids: string[]): Promise<void>;
  addListener(
    event: 'progress',
    listener: (event: { id: string; sent: number; total: number }) => void,
  ): { remove(): void };
  addListener(event: 'finished', listener: (event: ItemResult) => void): { remove(): void };
}

export const nativeUploads = requireOptionalNativeModule<VirgoUploadsModule>('VirgoUploads');
