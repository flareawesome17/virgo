import { useSyncExternalStore } from 'react';

/**
 * Who is online, and who is typing.
 *
 * An external store rather than React Query or context. Both facts arrive on
 * the socket as a stream of deltas, neither is fetched, and both change often
 * enough that a context provider would re-render everything under it every
 * time somebody pressed a key. `useSyncExternalStore` means only the component
 * that actually reads a given user's presence re-renders when it changes.
 *
 * Module-level state is fine here because it is scoped to one signed-in
 * session: `reset()` is called on sign-out.
 */

interface Presence {
  online: boolean;
  lastSeenAt: string | null;
}

const presence = new Map<string, Presence>();

/** conversationId -> userId -> name of someone typing. */
const typing = new Map<string, Map<string, string>>();

/**
 * Timers that clear a typing flag if no "stopped" ever arrives.
 *
 * Load-bearing rather than defensive: a client that navigates away or loses
 * its connection mid-keystroke never sends the stop, and without this the
 * other side would show "Ana is typing" until the app was restarted.
 */
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const TYPING_TIMEOUT_MS = 6000;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ─── Writes, called from useRealtime ─────────────────────────────────────────

export function setPresence(
  userId: string,
  online: boolean,
  lastSeenAt: string | null,
): void {
  const current = presence.get(userId);
  // Keeps the last known timestamp when an "online" event carries none, so
  // going online and offline again does not lose it.
  const next: Presence = { online, lastSeenAt: lastSeenAt ?? current?.lastSeenAt ?? null };
  if (current?.online === next.online && current?.lastSeenAt === next.lastSeenAt) {
    return;
  }
  presence.set(userId, next);
  emit();
}

/** Seeds presence from a REST response, without clobbering fresher socket data. */
export function seedPresence(
  entries: { userId: string; online: boolean; lastSeenAt: string | null }[],
): void {
  let changed = false;
  for (const entry of entries) {
    const current = presence.get(entry.userId);
    if (current?.online === entry.online && current?.lastSeenAt === entry.lastSeenAt) {
      continue;
    }
    presence.set(entry.userId, {
      online: entry.online,
      lastSeenAt: entry.lastSeenAt ?? current?.lastSeenAt ?? null,
    });
    changed = true;
  }
  if (changed) emit();
}

export function setTyping(
  conversationId: string,
  userId: string,
  name: string,
  isTyping: boolean,
): void {
  const key = `${conversationId}:${userId}`;
  const existing = typingTimers.get(key);
  if (existing) {
    clearTimeout(existing);
    typingTimers.delete(key);
  }

  const inConversation = typing.get(conversationId) ?? new Map<string, string>();

  if (!isTyping) {
    if (!inConversation.has(userId)) return;
    inConversation.delete(userId);
    if (inConversation.size === 0) typing.delete(conversationId);
    else typing.set(conversationId, inConversation);
    emit();
    return;
  }

  inConversation.set(userId, name);
  typing.set(conversationId, inConversation);
  typingTimers.set(
    key,
    setTimeout(() => setTyping(conversationId, userId, name, false), TYPING_TIMEOUT_MS),
  );
  emit();
}

/** Clears everything. Called on sign-out so the next account starts clean. */
export function resetPresence(): void {
  presence.clear();
  typing.clear();
  for (const timer of typingTimers.values()) clearTimeout(timer);
  typingTimers.clear();
  emit();
}

// ─── Sending ─────────────────────────────────────────────────────────────────

type TypingSender = (conversationId: string, isTyping: boolean) => void;

let sender: TypingSender | null = null;

/** useRealtime registers the live socket here so composers can reach it. */
export function registerTypingSender(fn: TypingSender | null): void {
  sender = fn;
}

/**
 * Tells the server this user is typing.
 *
 * A no-op when no socket is connected, which is the honest outcome: typing is
 * ephemeral, and there is nothing to queue or retry.
 */
export function sendTyping(conversationId: string, isTyping: boolean): void {
  sender?.(conversationId, isTyping);
}

// ─── Reads ───────────────────────────────────────────────────────────────────

const OFFLINE: Presence = { online: false, lastSeenAt: null };

export function usePresence(userId: string | null | undefined): Presence {
  return useSyncExternalStore(
    subscribe,
    () => (userId ? (presence.get(userId) ?? OFFLINE) : OFFLINE),
    () => OFFLINE,
  );
}

const NOBODY: string[] = [];

/**
 * Names of everyone typing in a conversation, excluding the reader.
 *
 * The cached array keeps the identity stable between renders — returning a
 * fresh `[]` from getSnapshot would make useSyncExternalStore believe the
 * store changed on every render and loop.
 */
const typingCache = new Map<string, string[]>();

/**
 * Which of these accounts are online, as a stable key.
 *
 * `usePresence` is per person, which is what a web list wants because CSS
 * `order` can sort without anyone knowing the whole picture. React Native has
 * no `order`, so a native list has to sort in JavaScript and therefore has to
 * see everyone at once.
 *
 * Returns a joined string rather than a Set on purpose: `useSyncExternalStore`
 * compares snapshots by identity, and a fresh Set every call is a new
 * reference every render — an infinite loop. Callers turn it back into a Set
 * with `useMemo` keyed on this string.
 */
export function useOnlineKeyAmong(userIds: readonly string[]): string {
  const key = userIds.join('|');
  return useSyncExternalStore(
    subscribe,
    () =>
      key
        .split('|')
        .filter((id) => id && presence.get(id)?.online)
        .join('|'),
    () => '',
  );
}

export function useTypingIn(
  conversationId: string | null | undefined,
  exceptUserId?: string | null,
): string[] {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (!conversationId) return NOBODY;
      const inConversation = typing.get(conversationId);
      if (!inConversation || inConversation.size === 0) {
        typingCache.delete(conversationId);
        return NOBODY;
      }
      const names = [...inConversation.entries()]
        .filter(([id]) => id !== exceptUserId)
        .map(([, name]) => name);
      if (names.length === 0) return NOBODY;

      const cached = typingCache.get(conversationId);
      if (cached && cached.length === names.length && cached.every((n, i) => n === names[i])) {
        return cached;
      }
      typingCache.set(conversationId, names);
      return names;
    },
    () => NOBODY,
  );
}

/** "typing…", "Ana is typing…", "Ana and Ben are typing…" */
export function typingLabel(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names[0]} and ${names.length - 1} others are typing…`;
}

/** "last seen 20 minutes ago", "last seen yesterday". */
export function lastSeenLabel(iso: string | null): string {
  if (!iso) return 'Offline';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'Offline';

  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'Last seen just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Last seen ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Last seen ${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Last seen yesterday';
  if (days < 7) return `Last seen ${days}d ago`;
  return 'Offline';
}
