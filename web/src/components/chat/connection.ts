'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  MEDIA_AUTO_LOAD_DEFAULT,
  shouldAutoLoadMedia,
  type ConnectionQuality,
  type MediaAutoLoad,
} from '@/api';

/*
 * How good the line is, and what the person wants loaded over it.
 *
 * Here rather than in hooks/: everything there is compared file for file
 * with the phone app, and the phone reads its connection through NetInfo, not
 * `navigator`. Nothing about this file could be the same on both.
 */

/** What Chromium browsers say about the line. Safari and the desktop webview may say nothing. */
interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: string;
  type?: string;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
}

function networkInformation(): NetworkInformation | undefined {
  try {
    return (navigator as Navigator & { connection?: NetworkInformation }).connection;
  } catch {
    return undefined;
  }
}

/**
 * The line right now.
 *
 * Save data, or a browser measuring 2G, is 'slow'; Wi-Fi or a cable is
 * 'wifi'; anything else, including a browser that says nothing at all, is
 * 'fast' — the honest default, since most people asking are on a decent line
 * and treating everyone as slow would hide every picture for no reason.
 *
 * A browser's "3g" is not slow here. It is Chrome's guess from round-trip
 * time, not the radio: a desktop on good Wi-Fi in the Philippines measured
 * 450 ms to a nearby server and was called "3g" (2026-11-17), which would have
 * held back every picture for most people at a desk. The phone app, which
 * knows the actual radio, still treats 3G as slow. Only a mobile browser that
 * says it is on cellular gets the same treatment here.
 */
export function readConnectionQuality(): ConnectionQuality {
  if (typeof navigator === 'undefined') return 'fast';
  try {
    if (navigator.onLine === false) return 'offline';
    const line = networkInformation();
    if (!line) return 'fast';
    const estimate = line.effectiveType ?? '';
    if (line.saveData || /^(slow-2g|2g)$/.test(estimate)) return 'slow';
    if (estimate === '3g' && line.type === 'cellular') return 'slow';
    if (line.type === 'wifi' || line.type === 'ethernet') return 'wifi';
    return 'fast';
  } catch {
    return 'fast';
  }
}

function subscribeToConnection(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const line = networkInformation();
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  try {
    line?.addEventListener?.('change', onChange);
  } catch {
    // A browser that describes the line but cannot report changes to it.
  }
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
    try {
      line?.removeEventListener?.('change', onChange);
    } catch {
      // As above.
    }
  };
}

const fastOnServer = (): ConnectionQuality => 'fast';

/** The line, kept current as it changes or drops. */
export function useConnectionQuality(): ConnectionQuality {
  return useSyncExternalStore(subscribeToConnection, readConnectionQuality, fastOnServer);
}

// ─── The setting ─────────────────────────────────────────────────────────────

/** Per browser: a data plan belongs to a device, not to an account. */
const SETTING_KEY = 'virgo.chat.media-auto-load';

/** What this tab chose when storage refused to keep it. */
let remembered: MediaAutoLoad | null = null;
const settingListeners = new Set<() => void>();

function isSetting(value: unknown): value is MediaAutoLoad {
  return value === 'fast' || value === 'always' || value === 'tap';
}

export function readMediaAutoLoad(): MediaAutoLoad {
  if (remembered) return remembered;
  try {
    const stored = window.localStorage.getItem(SETTING_KEY);
    return isSetting(stored) ? stored : MEDIA_AUTO_LOAD_DEFAULT;
  } catch {
    return MEDIA_AUTO_LOAD_DEFAULT;
  }
}

export function setMediaAutoLoad(value: MediaAutoLoad): void {
  try {
    window.localStorage.setItem(SETTING_KEY, value);
    remembered = null;
  } catch {
    // Private windows and blocked storage: kept for this tab instead.
    remembered = value;
  }
  for (const listener of settingListeners) listener();
}

function subscribeToSetting(onChange: () => void): () => void {
  settingListeners.add(onChange);
  // Another tab changing it.
  const onStorage = (event: StorageEvent) => {
    if (event.key === SETTING_KEY) onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    settingListeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

const defaultOnServer = (): MediaAutoLoad => MEDIA_AUTO_LOAD_DEFAULT;

/**
 * "Load photos, films and voice notes automatically", and whether that means
 * yes right now, on this line.
 */
export function useMediaAutoLoad(): {
  setting: MediaAutoLoad;
  setSetting: (value: MediaAutoLoad) => void;
  autoLoad: boolean;
  quality: ConnectionQuality;
} {
  const setting = useSyncExternalStore(subscribeToSetting, readMediaAutoLoad, defaultOnServer);
  const quality = useConnectionQuality();
  const setSetting = useCallback((value: MediaAutoLoad) => setMediaAutoLoad(value), []);
  return { setting, setSetting, autoLoad: shouldAutoLoadMedia(setting, quality), quality };
}
