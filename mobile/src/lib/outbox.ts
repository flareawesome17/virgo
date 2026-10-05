import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/**
 * Messages on their way out, kept until the server has them.
 *
 * This lived in the thread screen's state, so leaving the screen threw away
 * every message that had not gone yet, and nothing ever sent one that failed
 * while offline: "Waiting for connection" waited for a tap that never came.
 * Here the queue outlives the screen and the app, and the sender in useChat
 * works through it whenever the connection comes back.
 *
 * Each message gets its id before the first attempt and keeps it across every
 * retry. The server stores one message per id, so a retry after a response
 * that never arrived cannot send the words twice.
 */

/**
 * - sending: on its way, or about to be.
 * - waiting: the network failed it; sent again when the connection is back.
 * - failed: the server turned it down for a reason a retry might not fix.
 *   Retried only by a tap.
 * - refused: a block froze the conversation. Not retried at all until it
 *   thaws, when it becomes `failed` again.
 */
export type OutboxStatus = 'sending' | 'waiting' | 'failed' | 'refused';

export interface OutboxItem {
  clientId: string;
  conversationId: string;
  body: string;
  replyToId?: string;
  replyToBody?: string | null;
  replyToSender?: string | null;
  mentionIds: string[];
  status: OutboxStatus;
  createdAt: string;
  /** Attempts so far, for the retry backoff. */
  attempts: number;
}

/**
 * A random v4 uuid.
 *
 * Math.random rather than a crypto source: this is a key that keeps one
 * sender's retries together, not a secret, and Hermes has no randomUUID.
 */
export function newClientId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const EMPTY: readonly OutboxItem[] = [];

let owner: string | null = null;
let items: OutboxItem[] = [];
/** Each conversation's items, rebuilt on change so a screen gets a stable array. */
let byConversation = new Map<string, readonly OutboxItem[]>();
const listeners = new Set<() => void>();

const storageKey = (userId: string) => `virgo.outbox.v1:${userId}`;

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function save(): void {
  const userId = owner;
  if (!userId) return;
  clearTimeout(saveTimer);
  // Batched: a send changes an item two or three times in a second.
  saveTimer = setTimeout(() => {
    const value = items.length > 0 ? JSON.stringify(items) : null;
    const write = value
      ? AsyncStorage.setItem(storageKey(userId), value)
      : AsyncStorage.removeItem(storageKey(userId));
    write.catch(() => {
      // Storage full or unavailable. The queue still works for this session.
    });
  }, 250);
}

function publish(next: OutboxItem[]): void {
  items = next;
  const grouped = new Map<string, OutboxItem[]>();
  for (const item of items) {
    const list = grouped.get(item.conversationId);
    if (list) list.push(item);
    else grouped.set(item.conversationId, [item]);
  }
  byConversation = grouped;
  save();
  for (const listener of listeners) listener();
}

/**
 * Loads the signed-in person's queue from the last session.
 *
 * Anything that was mid-send when the app closed is `waiting`: whether it got
 * there is unknown, and sending it again is safe.
 */
export async function loadOutbox(userId: string): Promise<void> {
  if (owner === userId) return;
  owner = userId;
  let stored: OutboxItem[] = [];
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (raw) stored = JSON.parse(raw) as OutboxItem[];
  } catch {
    stored = [];
  }
  // Someone else signed in while storage was being read.
  if (owner !== userId) return;
  const restored = stored
    .filter((i) => i && typeof i.clientId === 'string' && typeof i.body === 'string')
    .map((i) => (i.status === 'sending' ? { ...i, status: 'waiting' as const } : i));
  // Anything queued in the moments before the read finished is kept too.
  const known = new Set(restored.map((i) => i.clientId));
  publish([...restored, ...items.filter((i) => !known.has(i.clientId))]);
}

/** Signing out takes the queue with it: it is that account's words. */
export function resetOutbox(): void {
  const userId = owner;
  owner = null;
  clearTimeout(saveTimer);
  items = [];
  byConversation = new Map();
  for (const listener of listeners) listener();
  if (userId) AsyncStorage.removeItem(storageKey(userId)).catch(() => undefined);
}

export function addToOutbox(item: OutboxItem): void {
  publish([...items, item]);
}

export function updateOutbox(clientId: string, patch: Partial<OutboxItem>): void {
  if (!items.some((i) => i.clientId === clientId)) return;
  publish(items.map((i) => (i.clientId === clientId ? { ...i, ...patch } : i)));
}

export function removeFromOutbox(clientId: string): void {
  if (!items.some((i) => i.clientId === clientId)) return;
  publish(items.filter((i) => i.clientId !== clientId));
}

/**
 * Turns a conversation's refused messages back into ordinary failures, once
 * whatever froze it has thawed — they would go through now.
 */
export function thawOutbox(conversationId: string): void {
  if (!items.some((i) => i.conversationId === conversationId && i.status === 'refused')) return;
  publish(
    items.map((i) =>
      i.conversationId === conversationId && i.status === 'refused'
        ? { ...i, status: 'failed' }
        : i,
    ),
  );
}

export function outboxItems(): readonly OutboxItem[] {
  return items;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** One conversation's queue, oldest first. */
export function useOutbox(conversationId: string | undefined): readonly OutboxItem[] {
  return useSyncExternalStore(
    subscribe,
    () => (conversationId ? (byConversation.get(conversationId) ?? EMPTY) : EMPTY),
    () => EMPTY,
  );
}
