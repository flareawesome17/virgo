/**
 * Which card's film may play: the one on screen, while the list it is in is
 * the screen being looked at.
 *
 * A store each card subscribes to for its own answer, rather than state the
 * list passes down. As state, every change of card re-rendered every mounted
 * card — likes, images, films and all — in the middle of the scroll that
 * caused it. Now only the card that stops and the card that starts hear about
 * it.
 */
export interface FilmTurn {
  set: (next: { id?: string | null; focused?: boolean }) => void;
  subscribe: (listener: () => void) => () => void;
  isActive: (id: string) => boolean;
}

export function createFilmTurn(): FilmTurn {
  let visibleId: string | null = null;
  let focused = true;
  const listeners = new Set<() => void>();
  return {
    set: (next) => {
      const id = next.id !== undefined ? next.id : visibleId;
      const f = next.focused ?? focused;
      if (id === visibleId && f === focused) return;
      visibleId = id;
      focused = f;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    isActive: (id) => focused && visibleId === id,
  };
}
