import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  moneyApi,
  queryKeys,
  type MoneyEntry,
  type MoneyEntryInput,
  type MoneyEntryPatch,
  type MoneyListParams,
} from '@/src/api';

/**
 * The ledger: one person's income and expenses.
 *
 * Every write invalidates the whole `money` key — a new expense moves the
 * month's list, its totals and the dashboard card at once, and refetching
 * three small queries is cheaper than keeping three caches right by hand.
 */

export function useMoneyEntries(params: MoneyListParams = {}, options: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: queryKeys.money.list(params),
    queryFn: () => moneyApi.list(params),
    enabled: options.enabled ?? true,
  });
  return {
    ...query,
    entries: query.data?.data ?? ([] as MoneyEntry[]),
    total: query.data?.total ?? 0,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
  };
}

export function useMoneyEntry(id: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.money.detail(id ?? ''),
    queryFn: () => moneyApi.get(id as string),
    enabled: !!id,
  });
  return {
    ...query,
    entry: query.data,
    loadFailed: query.isError || query.isPaused,
  };
}

/** Paid totals for a span of days, and everything still outstanding. */
export function useMoneySummary(from: string, to: string, options: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: queryKeys.money.summary(from, to),
    queryFn: () => moneyApi.summary(from, to),
    enabled: options.enabled ?? true,
  });
  return {
    ...query,
    summary: query.data,
    loadFailed: query.isError || query.isPaused,
  };
}

export function useCreateMoneyEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MoneyEntryInput) => moneyApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.money.all });
    },
  });
}

/**
 * Changes an entry, on screen at once.
 *
 * "Mark as paid" is a tap in a list, and waiting for the server to see the
 * row move made it feel like the tap had missed. The row changes on the tap
 * and goes back if the server refuses; the caller says so.
 */
export function useUpdateMoneyEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: MoneyEntryPatch & { id: string }) => moneyApi.update(id, patch),
    onMutate: async ({ id, receiptId: _receipt, ...patch }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.money.all });
      const before = queryClient.getQueriesData<unknown>({ queryKey: queryKeys.money.all });
      const apply = (e: MoneyEntry): MoneyEntry =>
        e.id === id ? { ...e, ...(patch as Partial<MoneyEntry>) } : e;
      queryClient.setQueriesData<unknown>({ queryKey: queryKeys.money.all }, (data: unknown) => {
        if (!data || typeof data !== 'object') return data;
        if ('data' in data && Array.isArray((data as { data: unknown }).data)) {
          const list = data as { data: MoneyEntry[]; total: number };
          return { ...list, data: list.data.map(apply) };
        }
        if ('id' in data && (data as MoneyEntry).id === id) return apply(data as MoneyEntry);
        return data;
      });
      return { before };
    },
    onError: (_error, _input, context) => {
      for (const [key, data] of context?.before ?? []) queryClient.setQueryData(key, data);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.money.detail(updated.id), updated);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.money.all });
    },
  });
}

export function useDeleteMoneyEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => moneyApi.remove(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.money.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.money.all });
    },
  });
}

/** A five-minute link to a range as a CSV, for the browser to save. */
export function useMoneyExport() {
  return useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) => moneyApi.exportUrl(from, to),
  });
}
