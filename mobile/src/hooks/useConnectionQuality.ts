import { useCallback, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import {
  MEDIA_AUTO_LOAD_DEFAULT,
  shouldAutoLoadMedia,
  type ConnectionQuality,
  type MediaAutoLoad,
} from '@/src/api';

/*
 * Chat on a weak signal, the phone's half.
 *
 * Mobile only: the web reads the browser's own connection hints. The rules —
 * what loads by itself, how many messages a chat opens on, whether to poll —
 * are shared in the API module; this only says what the connection is, what
 * this phone was told to do about media, and whether the live socket is up.
 *
 * Module stores rather than one NetInfo listener per caller: every bubble on
 * screen asks, and they all want the same answer.
 */

// ─── Connection quality ──────────────────────────────────────────────────────

/**
 * What NetInfo says, as chat cares about it.
 *
 * Wi-Fi or a cable is 'wifi'. 2G and 3G are 'slow'. Any other mobile line —
 * 4G, 5G, or one whose generation the phone will not say — is 'fast'. No
 * connection, or one NetInfo has found reaches nothing, is 'offline'. Not
 * checked yet reads as 'fast', so a cold start does not hold pictures back.
 */
export function qualityOf(state: Pick<NetInfoState, 'type' | 'isConnected' | 'isInternetReachable' | 'details'>): ConnectionQuality {
  if (state.isConnected === false || state.isInternetReachable === false || state.type === 'none') {
    return 'offline';
  }
  if (state.type === 'wifi' || state.type === 'ethernet') return 'wifi';
  if (state.type === 'cellular') {
    const details = state.details as { cellularGeneration?: string | null } | null;
    const generation = details?.cellularGeneration ?? null;
    if (generation === '2g' || generation === '3g') return 'slow';
    return 'fast';
  }
  return 'fast';
}

let measured: ConnectionQuality = 'fast';
/** Set by hand to try the slow and offline paths without a slow phone. */
let forced: ConnectionQuality | null = null;
const qualityListeners = new Set<() => void>();
let stopNetInfo: (() => void) | null = null;

function emitQuality(): void {
  for (const listener of qualityListeners) listener();
}

function watchNetInfo(): void {
  if (stopNetInfo) return;
  stopNetInfo = NetInfo.addEventListener((state) => {
    const next = qualityOf(state);
    if (next === measured) return;
    measured = next;
    emitQuality();
  });
}

function subscribeQuality(listener: () => void): () => void {
  watchNetInfo();
  qualityListeners.add(listener);
  return () => qualityListeners.delete(listener);
}

/** The connection now, for code outside React: a page size, a typing frame. */
export function getConnectionQuality(): ConnectionQuality {
  watchNetInfo();
  return forced ?? measured;
}

/**
 * Pretends the connection is this, until called with null. For trying the
 * weak-signal paths in development (`forceConnectionQuality('slow')`); never
 * called by the app itself.
 */
export function forceConnectionQuality(quality: ConnectionQuality | null): void {
  forced = quality;
  emitQuality();
}

/** How good the connection is, kept current. */
export function useConnectionQuality(): ConnectionQuality {
  return useSyncExternalStore(subscribeQuality, getConnectionQuality, getConnectionQuality);
}

// ─── Media auto-load setting ─────────────────────────────────────────────────

const MEDIA_KEY = 'virgo.media-auto-load.v1';
const SETTINGS: readonly MediaAutoLoad[] = ['fast', 'always', 'tap'];

let mediaSetting: MediaAutoLoad = MEDIA_AUTO_LOAD_DEFAULT;
let mediaLoaded = false;
const mediaListeners = new Set<() => void>();

function emitMedia(): void {
  for (const listener of mediaListeners) listener();
}

function loadMediaSetting(): void {
  if (mediaLoaded) return;
  mediaLoaded = true;
  AsyncStorage.getItem(MEDIA_KEY)
    .then((raw) => {
      if (raw && (SETTINGS as readonly string[]).includes(raw) && raw !== mediaSetting) {
        mediaSetting = raw as MediaAutoLoad;
        emitMedia();
      }
    })
    .catch(() => {
      // Unreadable storage: the default stands.
    });
}

function subscribeMedia(listener: () => void): () => void {
  loadMediaSetting();
  mediaListeners.add(listener);
  return () => mediaListeners.delete(listener);
}

const getMediaSetting = () => mediaSetting;

/**
 * When photos, films, voice notes and link pictures load by themselves.
 *
 * Kept on this phone only: a data plan belongs to a phone, not an account.
 * `autoLoad` is the answer for right now, on this connection.
 */
export function useMediaAutoLoad() {
  const setting = useSyncExternalStore(subscribeMedia, getMediaSetting, getMediaSetting);
  const quality = useConnectionQuality();
  const setSetting = useCallback((next: MediaAutoLoad) => {
    mediaSetting = next;
    emitMedia();
    AsyncStorage.setItem(MEDIA_KEY, next).catch(() => {
      // Kept for this session at least.
    });
  }, []);
  return { setting, setSetting, autoLoad: shouldAutoLoadMedia(setting, quality) };
}

// ─── The live socket ─────────────────────────────────────────────────────────

let socketLive = false;
const socketListeners = new Set<() => void>();

/**
 * Said by useRealtime: true once the socket is authenticated, false the
 * moment it closes or the app goes to the background.
 */
export function setChatSocketLive(live: boolean): void {
  if (live === socketLive) return;
  socketLive = live;
  for (const listener of socketListeners) listener();
}

function subscribeSocket(listener: () => void): () => void {
  socketListeners.add(listener);
  return () => socketListeners.delete(listener);
}

const getSocketLive = () => socketLive;

/** Whether new messages are arriving live, so a backup poll would only repeat them. */
export function useChatSocketLive(): boolean {
  return useSyncExternalStore(subscribeSocket, getSocketLive, getSocketLive);
}
