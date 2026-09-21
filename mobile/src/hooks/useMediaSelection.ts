import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, storageApi } from '@/src/api';
import { usageQueryKey } from './useUsage';

/**
 * Which files are chosen, for acting on several at once.
 *
 * Held as keys rather than positions: a list that pages in more files, or
 * loses one to a delete, would otherwise quietly move the selection onto
 * different photographs — the worst possible thing for a Delete button to be
 * pointed at.
 */
export function useSelection() {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  // Where the last plain toggle landed, so a shift-click can extend from it.
  const [anchor, setAnchor] = useState<string | null>(null);

  const toggle = useCallback((key: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setAnchor(key);
  }, []);

  /**
   * Selects everything between the anchor and `key`, inclusive, in the order
   * `ordered` gives. Without an anchor it is a plain toggle.
   */
  const extendTo = useCallback(
    (key: string, ordered: readonly string[]) => {
      const from = anchor ? ordered.indexOf(anchor) : -1;
      const to = ordered.indexOf(key);
      if (from === -1 || to === -1) {
        toggle(key);
        return;
      }
      const [start, end] = from < to ? [from, to] : [to, from];
      setSelected((current) => new Set([...current, ...ordered.slice(start, end + 1)]));
      setAnchor(key);
    },
    [anchor, toggle],
  );

  /** Adds or removes a whole set at once — a day, or everything loaded. */
  const setMany = useCallback((keys: readonly string[], on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      for (const key of keys) {
        if (on) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSelected(new Set());
    setAnchor(null);
  }, []);

  /** Drops keys that are no longer on screen, after a delete or a filter. */
  const keepOnly = useCallback((present: readonly string[]) => {
    const keep = new Set(present);
    setSelected((current) => {
      const next = new Set([...current].filter((key) => keep.has(key)));
      return next.size === current.size ? current : next;
    });
  }, []);

  return useMemo(
    () => ({
      selected,
      count: selected.size,
      active: selected.size > 0,
      has: (key: string) => selected.has(key),
      keys: () => [...selected],
      toggle,
      extendTo,
      setMany,
      clear,
      keepOnly,
    }),
    [selected, toggle, extendTo, setMany, clear, keepOnly],
  );
}

/**
 * Deletes a selection in one request.
 *
 * Refreshes the counts that depend on it as well as the grid: the album's
 * sections and totals, the album list's item counts, and storage used — a
 * delete that frees space the storage screen still reports is how people end
 * up deleting twice.
 */
export function useDeleteFiles(albumId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (keys: string[]) => storageApi.removeMany(keys),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['storage', 'files', albumId ?? 'all'] }),
        albumId
          ? queryClient.invalidateQueries({ queryKey: queryKeys.albums.sections(albumId) })
          : Promise.resolve(),
        queryClient.invalidateQueries({ queryKey: queryKeys.albums.all }),
        queryClient.invalidateQueries({ queryKey: usageQueryKey }),
      ]),
  });
}
