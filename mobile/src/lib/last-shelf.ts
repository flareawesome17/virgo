import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The shelf somebody last kept something on, so the next Keep is one tap.
 *
 * Per account, on this device. Read once and held in memory: Keep reads it
 * on every tap, and a storage round trip there is a beat of nothing between
 * the tap and the button changing.
 */
export interface LastShelf {
  id: string;
  name: string;
}

const key = (userId: string) => `virgo.lastShelf.v1:${userId}`;
const memory = new Map<string, LastShelf | null>();

export async function getLastShelf(userId: string): Promise<LastShelf | null> {
  if (memory.has(userId)) return memory.get(userId) ?? null;
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    const parsed = raw ? (JSON.parse(raw) as LastShelf) : null;
    const value = parsed && typeof parsed.id === 'string' && typeof parsed.name === 'string' ? parsed : null;
    memory.set(userId, value);
    return value;
  } catch {
    return null;
  }
}

export function setLastShelf(userId: string, shelf: LastShelf): void {
  memory.set(userId, shelf);
  AsyncStorage.setItem(key(userId), JSON.stringify(shelf)).catch(() => undefined);
}

/** The shelf went (deleted, or renamed elsewhere): the next Keep asks again. */
export function clearLastShelf(userId: string): void {
  memory.set(userId, null);
  AsyncStorage.removeItem(key(userId)).catch(() => undefined);
}
