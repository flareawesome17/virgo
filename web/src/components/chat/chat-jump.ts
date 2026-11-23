'use client';

import { useSyncExternalStore } from 'react';

/**
 * Opening a chat somewhere other than its newest message: at a search match
 * from the list's search, or at its search box or its pins from group info.
 *
 * A hand-off rather than the address: the list and the info sheet are not
 * inside the thread, a search term has no business in the address bar or the
 * history, and the desktop build's static pages cannot read a query string
 * without a Suspense boundary around every chat page.
 *
 * Each request is a new object, so asking twice for the same thing — the
 * same search row clicked again — is still two requests.
 */
export type ChatJump =
  | {
      conversationId: string;
      kind: 'search';
      /** What to search for; empty opens the box with nothing in it. */
      q: string;
      /** The match to open at, when the list found one. */
      matchId: string | null;
    }
  | { conversationId: string; kind: 'pins' };

let pending: ChatJump | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Asks the thread for this chat to open this way, now or once it mounts. */
export function requestChatJump(jump: ChatJump): void {
  pending = jump;
  notify();
}

/** Clears a request once the thread has acted on it. */
export function takeChatJump(jump: ChatJump): void {
  if (pending !== jump) return;
  pending = null;
  notify();
}

/** The request waiting for this chat, if any. */
export function useChatJump(conversationId: string): ChatJump | null {
  return useSyncExternalStore(
    subscribe,
    () => (pending?.conversationId === conversationId ? pending : null),
    () => null,
  );
}
