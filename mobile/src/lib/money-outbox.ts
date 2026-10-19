import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { ApiError, moneyApi, queryKeys, type MoneyEntryInput } from '@/src/api';

/**
 * Money entries written with no signal, kept until the server has them.
 *
 * The pamasahe and the meal happen at the venue, and venues are where the
 * signal isn't. An expense logged there waits here — on the phone, across
 * restarts — and goes up the moment there is a connection.
 *
 * Mobile only: the web app is online by definition, and this leans on
 * AsyncStorage and NetInfo. Each entry carries the id the form made for it
 * and keeps it across every attempt; the server saves one entry per id, so a
 * send whose answer never arrived cannot save it twice.
 */

export interface QueuedMoneyEntry {
  input: MoneyEntryInput & { id: string };
  queuedAt: string;
  attempts: number;
  /** The server turned it down for a reason a retry won't fix. Kept to be seen. */
  error: string | null;
}

const EMPTY: readonly QueuedMoneyEntry[] = [];

let owner: string | null = null;
let items: readonly QueuedMoneyEntry[] = EMPTY;
const listeners = new Set<() => void>();

const storageKey = (userId: string) => `virgo.money-outbox.v1:${userId}`;

function publish(next: readonly QueuedMoneyEntry[]): void {
  items = next;
  const userId = owner;
  if (userId) {
    const write =
      items.length > 0
        ? AsyncStorage.setItem(storageKey(userId), JSON.stringify(items))
        : AsyncStorage.removeItem(storageKey(userId));
    write.catch(() => {
      // Storage full or unavailable. The queue still works for this session.
    });
  }
  for (const listener of listeners) listener();
}

/** Loads the signed-in person's queue from the last session. */
export async function loadMoneyOutbox(userId: string): Promise<void> {
  if (owner === userId) return;
  // Another account's queue stays saved under its own key, and goes up when
  // that account is back. Only what was queued before any account had loaded
  // is carried into this one.
  if (owner !== null) items = EMPTY;
  owner = userId;
  let stored: QueuedMoneyEntry[] = [];
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (raw) stored = JSON.parse(raw) as QueuedMoneyEntry[];
  } catch {
    stored = [];
  }
  if (owner !== userId) return;
  const valid = stored.filter((i) => i && typeof i.input?.id === 'string');
  const known = new Set(valid.map((i) => i.input.id));
  publish([...valid, ...items.filter((i) => !known.has(i.input.id))]);
}

/** Signing out takes the queue with it: it is that account's money. */
export function resetMoneyOutbox(): void {
  const userId = owner;
  owner = null;
  items = EMPTY;
  for (const listener of listeners) listener();
  if (userId) AsyncStorage.removeItem(storageKey(userId)).catch(() => undefined);
}

/** Keeps an entry to send when there is a connection. */
export function queueMoneyEntry(input: MoneyEntryInput & { id: string }): void {
  if (items.some((i) => i.input.id === input.id)) return;
  publish([...items, { input, queuedAt: new Date().toISOString(), attempts: 0, error: null }]);
}

/** Lets go of one the server refused, at the person's say-so. */
export function discardQueuedMoneyEntry(id: string): void {
  publish(items.filter((i) => i.input.id !== id));
}

function patch(id: string, change: Partial<QueuedMoneyEntry>): void {
  publish(items.map((i) => (i.input.id === id ? { ...i, ...change } : i)));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Everything waiting, oldest first. */
export function useMoneyOutbox(): readonly QueuedMoneyEntry[] {
  return useSyncExternalStore(subscribe, () => items, () => EMPTY);
}

let flushing: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Sends what is waiting, one at a time, oldest first.
 *
 * A connection failure stops the run and tries again later, backing off. A
 * refusal marks the entry and moves on — except a receipt that went stale
 * while the entry waited (an upload is only held a day), which is dropped so
 * the entry itself still saves.
 */
export function flushMoneyOutbox(queryClient: QueryClient): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    clearTimeout(retryTimer);
    let saved = false;
    for (const item of items) {
      if (item.error) continue;
      try {
        await moneyApi.create(item.input);
        discardQueuedMoneyEntry(item.input.id);
        saved = true;
      } catch (error) {
        if (error instanceof ApiError && error.status === 0) {
          patch(item.input.id, { attempts: item.attempts + 1 });
          retryTimer = setTimeout(
            () => void flushMoneyOutbox(queryClient),
            Math.min(5000 * 2 ** Math.min(item.attempts, 5), 120_000),
          );
          break;
        }
        if (error instanceof ApiError && error.status === 400 && item.input.receiptId) {
          const { receiptId: _stale, ...rest } = item.input;
          patch(item.input.id, { input: rest });
          retryTimer = setTimeout(() => void flushMoneyOutbox(queryClient), 0);
          break;
        }
        patch(item.input.id, {
          error: error instanceof ApiError ? error.message : 'It could not be saved.',
        });
      }
    }
    if (saved) void queryClient.invalidateQueries({ queryKey: queryKeys.money.all });
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/**
 * Keeps the queue moving. Mounted once, with the session: loads what was
 * left last time and sends whatever is waiting whenever a connection comes
 * back or the app comes to the front.
 */
export function useMoneyOutboxSender(userId: string | undefined): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!userId) {
      resetMoneyOutbox();
      return undefined;
    }
    void loadMoneyOutbox(userId).then(() => flushMoneyOutbox(queryClient));

    let wasOnline = true;
    const offNet = NetInfo.addEventListener((state) => {
      const online = !!state.isConnected && state.isInternetReachable !== false;
      if (online && !wasOnline) void flushMoneyOutbox(queryClient);
      wasOnline = online;
    });
    const offApp = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flushMoneyOutbox(queryClient);
    });
    return () => {
      offNet();
      offApp.remove();
      clearTimeout(retryTimer);
    };
  }, [userId, queryClient]);
}
