import { useSyncExternalStore } from 'react';

/**
 * Messages on their way out, kept until the server has them.
 *
 * This lived in the thread's component state, so going to another chat or
 * reloading the tab threw away every message that had not gone yet, and
 * nothing ever sent one that failed while offline. Here the queue outlives the
 * route and the tab, and the sender in useChat works through it whenever the
 * connection comes back.
 *
 * Each message gets its id before the first attempt and keeps it across every
 * retry. The server stores one message per id, so a retry after a response
 * that never arrived cannot send the words twice.
 *
 * The mobile app has the same queue over AsyncStorage; this one is
 * localStorage, which is synchronous, so loading needs no await.
 */

/**
 * - sending: on its way, or about to be.
 * - waiting: the network failed it; sent again when the connection is back.
 * - failed: the server turned it down for a reason a retry might not fix.
 *   Retried only by a click.
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

/** A random v4 uuid. A key that keeps one sender's retries together, not a secret. */
export function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // crypto.randomUUID needs a secure context; a LAN address over plain http
  // is not one.
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
    try {
      if (items.length > 0) localStorage.setItem(storageKey(userId), JSON.stringify(items));
      else localStorage.removeItem(storageKey(userId));
    } catch {
      // Storage full, blocked, or a private window. The queue still works
      // for this tab.
    }
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
 * Loads the signed-in person's queue from the last visit.
 *
 * Anything that was mid-send when the tab closed is `waiting`: whether it got
 * there is unknown, and sending it again is safe.
 */
export function loadOutbox(userId: string): void {
  if (owner === userId) return;
  owner = userId;
  let stored: OutboxItem[] = [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw) stored = JSON.parse(raw) as OutboxItem[];
  } catch {
    stored = [];
  }
  const restored = (Array.isArray(stored) ? stored : [])
    .filter((i) => i && typeof i.clientId === 'string' && typeof i.body === 'string')
    .map((i) => (i.status === 'sending' ? { ...i, status: 'waiting' as const } : i));
  // Anything queued before the sender mounted is kept too.
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
  if (userId) {
    try {
      localStorage.removeItem(storageKey(userId));
    } catch {
      // Nothing to clear if storage is unavailable.
    }
  }
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
