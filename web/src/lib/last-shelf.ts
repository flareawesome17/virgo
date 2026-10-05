/**
 * The shelf somebody last kept something on, so the next Keep is one tap.
 *
 * Per account, in this browser — the phone keeps the same thing, under the
 * same key, in its own storage. Read from localStorage on every tap rather
 * than once: unlike the phone's storage it answers synchronously, so there is
 * no beat of nothing to avoid, and reading it fresh means a shelf chosen in
 * another tab is the one this tab keeps to.
 *
 * Every access is wrapped. A private window, blocked site data or a full quota
 * all make localStorage throw, and failing to remember a shelf is never a
 * reason for Keep itself to fail. When storage will not answer, the value is
 * held in memory instead, so Keep is still one tap for as long as the page is
 * open.
 */
export interface LastShelf {
  id: string;
  name: string;
}

const key = (userId: string) => `virgo.lastShelf.v1:${userId}`;
const memory = new Map<string, LastShelf | null>();

function parse(raw: string | null): LastShelf | null {
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') return null;
  const { id, name } = value as Partial<LastShelf>;
  return typeof id === 'string' && typeof name === 'string' ? { id, name } : null;
}

export function getLastShelf(userId: string): LastShelf | null {
  try {
    return parse(window.localStorage.getItem(key(userId)));
  } catch {
    return memory.get(userId) ?? null;
  }
}

export function setLastShelf(userId: string, shelf: LastShelf): void {
  memory.set(userId, shelf);
  try {
    window.localStorage.setItem(key(userId), JSON.stringify({ id: shelf.id, name: shelf.name }));
  } catch {
    // Remembered in memory only; see above.
  }
}

/** The shelf went (deleted, or renamed elsewhere): the next Keep asks again. */
export function clearLastShelf(userId: string): void {
  memory.set(userId, null);
  try {
    window.localStorage.removeItem(key(userId));
  } catch {
    // Nothing stored to remove, or nothing that can be.
  }
}
