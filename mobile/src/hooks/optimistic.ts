import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * The answer first, the server after.
 *
 * A tap that waits for the server before anything on screen changes feels
 * like a tap that missed. These are the two halves every such write needs:
 * change what is cached now, and keep what it was so a refusal can put it
 * back. The write itself, and reading the truth again once it settles, stay
 * with the mutation that uses them.
 */

/** What a row becomes: itself changed, or `null` for gone. */
export type RowChange<T> = (row: T) => T | null;

/**
 * Applies `change` to every row of a cached answer, whatever shape the answer
 * has: a bare list, `{ data: [...] }`, the pages of an infinite query, or one
 * record on its own. `isRow` says which values are rows, so a wrapper object
 * is never mistaken for one.
 */
export function mapCachedRows<T>(
  data: unknown,
  isRow: (value: unknown) => value is T,
  change: RowChange<T>,
): unknown {
  if (Array.isArray(data)) {
    const next: unknown[] = [];
    let changed = false;
    for (const item of data) {
      if (!isRow(item)) {
        next.push(item);
        continue;
      }
      const result = change(item);
      if (result !== item) changed = true;
      if (result !== null) next.push(result);
    }
    return changed ? next : data;
  }
  if (!data || typeof data !== 'object') return data;
  if (isRow(data)) {
    // One record cached on its own cannot be taken out of itself: a removal
    // leaves it as it is, for the refetch to settle.
    return change(data) ?? data;
  }
  const holder = data as { data?: unknown; pages?: unknown };
  if (Array.isArray(holder.pages)) {
    const pages = holder.pages.map((page) => mapCachedRows(page, isRow, change));
    return pages.some((page, at) => page !== (holder.pages as unknown[])[at]) ? { ...holder, pages } : data;
  }
  if (Array.isArray(holder.data)) {
    const rows = mapCachedRows(holder.data, isRow, change);
    if (rows === holder.data) return data;
    const total = (holder as { total?: unknown }).total;
    const removed = holder.data.length - (rows as unknown[]).length;
    return {
      ...holder,
      data: rows,
      ...(typeof total === 'number' && removed !== 0 ? { total: Math.max(0, total - removed) } : {}),
    };
  }
  return data;
}

/** Every cached answer under `prefix`, as it was, for `restoreCached`. */
export type CachedSnapshot = [QueryKey, unknown][];

/**
 * Changes the rows of everything cached under `prefix`, now, and gives back
 * what was there. In-flight reads of the same keys are stopped first, so an
 * answer that left before the tap cannot land on top of it.
 */
export async function patchCachedRows<T>(
  queryClient: QueryClient,
  prefix: QueryKey,
  isRow: (value: unknown) => value is T,
  change: RowChange<T>,
): Promise<CachedSnapshot> {
  await queryClient.cancelQueries({ queryKey: prefix });
  const before = queryClient.getQueriesData<unknown>({ queryKey: prefix });
  queryClient.setQueriesData<unknown>({ queryKey: prefix }, (data: unknown) =>
    mapCachedRows(data, isRow, change),
  );
  return before;
}

/** Puts back what `patchCachedRows` changed, when the server says no. */
export function restoreCached(queryClient: QueryClient, before: CachedSnapshot | undefined): void {
  for (const [key, data] of before ?? []) queryClient.setQueryData(key, data);
}

/** A record with an `id`, which is what most cached rows are. */
export function hasId(value: unknown): value is { id: string } {
  return !!value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string';
}
