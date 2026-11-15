import { useSyncExternalStore } from 'react';

/**
 * An income just recorded, waiting to be asked about: "set some of it aside?"
 *
 * The form that records it closes itself and knows nothing of savings; the
 * Money screen underneath is where the question is asked. So the form leaves
 * the payment here, and Money picks it up when it is next in front.
 */
export interface SetAsideOffer {
  amountMinor: number;
  /** What it was for, in the person's words: the client, or the category. */
  from: string | null;
}

let offer: SetAsideOffer | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export const setAsidePrompt = {
  offer(next: SetAsideOffer): void {
    offer = next;
    emit();
  },
  clear(): void {
    if (offer === null) return;
    offer = null;
    emit();
  },
};

export function useSetAsideOffer(): SetAsideOffer | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => offer,
    () => null,
  );
}
