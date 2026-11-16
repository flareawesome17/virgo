import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  moneyApi,
  queryKeys,
  type MoneyEntry,
  type MoneyEntryInput,
  type MoneyEntryPatch,
  type MoneyListParams,
  type MoneyPackage,
  type MoneyPackageInput,
  type MoneyPackagePatch,
  type MoneyPayMethod,
  type MoneyPayMethodInput,
  type MoneyRecurring,
  type MoneyRecurringPatch,
  type MoneySaving,
  type MoneySavingInput,
  type MoneySavingMove,
  type MoneySavingMoveInput,
  type MoneySavingPatch,
  type MoneySuggestion,
  type MoneySummary,
} from '@/api';

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

/** A cached page of the ledger, as `moneyApi.list` returns it. */
type MoneyListData = { data: MoneyEntry[]; total: number };

function isMoneyList(data: unknown): data is MoneyListData {
  return !!data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data);
}

/** Whether a list asked for with `params` would hold this entry. */
function listHolds(params: unknown, entry: MoneyEntry): boolean {
  const p = (params ?? {}) as { from?: string; to?: string; kind?: string; unpaid?: boolean };
  if (p.kind && p.kind !== entry.kind) return false;
  if (p.unpaid) return entry.paidOn === null;
  // A month's list is read by the day money moved, or was due to.
  const day = entry.paidOn ?? entry.occurredOn;
  if (p.from && day < p.from) return false;
  if (p.to && day > p.to) return false;
  return true;
}

/**
 * Adds an entry, on screen at once.
 *
 * The entry's id is made on the device, so the row can be drawn before the
 * server has heard of it and is the same row afterwards. It goes into every
 * list it belongs in and onto the month's totals on the tap; all of it is put
 * back if the save fails, and read again from the server either way. Saving
 * used to hold the form open, then refetch the whole ledger, before the new
 * row appeared.
 */
export function useCreateMoneyEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MoneyEntryInput) => moneyApi.create(input),
    onMutate: async (input: MoneyEntryInput) => {
      // Without an id there is nothing to tell the drawn row from the saved one.
      if (!input.id) return undefined;
      await queryClient.cancelQueries({ queryKey: queryKeys.money.all });
      const before = queryClient.getQueriesData<unknown>({ queryKey: queryKeys.money.all });
      const now = new Date().toISOString();
      const entry = {
        id: input.id,
        kind: input.kind,
        amountMinor: input.amountMinor,
        withheldMinor: input.withheldMinor ?? 0,
        currency: 'PHP',
        category: input.category,
        occurredOn: input.occurredOn,
        paidOn: input.paidOn ?? null,
        method: input.method ?? null,
        reference: input.reference ?? null,
        counterparty: input.counterparty ?? null,
        note: input.note ?? null,
        receipt: null,
        booking: null,
        package: null,
        recurringId: null,
        createdAt: now,
        updatedAt: now,
      } as MoneyEntry;

      for (const [key, data] of before) {
        if (key[1] === 'list' && isMoneyList(data)) {
          if (!listHolds(key[2], entry) || data.data.some((e) => e.id === entry.id)) continue;
          queryClient.setQueryData<MoneyListData>(key, {
            ...data,
            data: [entry, ...data.data],
            total: data.total + 1,
          });
        } else if (key[1] === 'summary' && data && typeof data === 'object') {
          const from = String(key[2] ?? '');
          const to = String(key[3] ?? '');
          const summary = data as MoneySummary;
          const net = entry.amountMinor - entry.withheldMinor;
          if (entry.paidOn === null) {
            // Owed is counted whatever the month.
            queryClient.setQueryData<MoneySummary>(
              key,
              entry.kind === 'income'
                ? {
                    ...summary,
                    owedToYouMinor: summary.owedToYouMinor + net,
                    owedToYouCount: summary.owedToYouCount + 1,
                  }
                : {
                    ...summary,
                    youOweMinor: summary.youOweMinor + entry.amountMinor,
                    youOweCount: summary.youOweCount + 1,
                  },
            );
          } else if (entry.paidOn >= from && entry.paidOn <= to) {
            queryClient.setQueryData<MoneySummary>(
              key,
              entry.kind === 'income'
                ? {
                    ...summary,
                    incomeMinor: summary.incomeMinor + entry.amountMinor,
                    withheldMinor: summary.withheldMinor + entry.withheldMinor,
                    entries: summary.entries + 1,
                  }
                : {
                    ...summary,
                    expenseMinor: summary.expenseMinor + entry.amountMinor,
                    entries: summary.entries + 1,
                  },
            );
          }
        }
      }
      return { before };
    },
    onError: (_error, _input, context) => {
      for (const [key, data] of context?.before ?? []) queryClient.setQueryData(key, data);
    },
    onSettled: () => {
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
    onMutate: async ({ id, ...patch }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.money.all });
      const before = queryClient.getQueriesData<unknown>({ queryKey: queryKeys.money.all });
      // A receipt id is a reference, not a field of the entry; the receipt
      // itself shows once the save comes back.
      const shown = Object.fromEntries(
        Object.entries(patch).filter(([key]) => key !== 'receiptId'),
      ) as Partial<MoneyEntry>;
      const apply = (e: MoneyEntry): MoneyEntry => (e.id === id ? { ...e, ...shown } : e);
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

/** Deletes an entry: off every list on the tap, back if the server refuses. */
export function useDeleteMoneyEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => moneyApi.remove(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.money.all });
      const before = queryClient.getQueriesData<unknown>({ queryKey: queryKeys.money.all });
      for (const [key, data] of before) {
        if (key[1] !== 'list' || !isMoneyList(data)) continue;
        if (!data.data.some((e) => e.id === id)) continue;
        queryClient.setQueryData<MoneyListData>(key, {
          ...data,
          data: data.data.filter((e) => e.id !== id),
          total: Math.max(0, data.total - 1),
        });
      }
      return { before };
    },
    onError: (_error, _id, context) => {
      for (const [key, data] of context?.before ?? []) queryClient.setQueryData(key, data);
    },
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.money.detail(id) });
    },
    // The totals are the server's to work out, so they are read again.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.money.all });
    },
  });
}

/**
 * Agreed bookings you have not recorded yet: the entries Money offers to
 * fill in. Recording one, or saying "not this", takes it off — both are
 * writes under the `money` key, so the list refetches with everything else.
 */
export function useMoneySuggestions(options: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: queryKeys.money.suggestions,
    queryFn: () => moneyApi.suggestions(),
    enabled: options.enabled ?? true,
  });
  return {
    ...query,
    suggestions: query.data ?? [],
    loadFailed: query.isError || query.isPaused,
  };
}

/** One booking from your side, for its own screen. */
export function useMoneyForBooking(bookingId: string | undefined, options: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: queryKeys.money.booking(bookingId ?? ''),
    queryFn: () => moneyApi.forBooking(bookingId as string),
    enabled: !!bookingId && (options.enabled ?? true),
  });
  return {
    ...query,
    suggestion: query.data?.suggestion ?? null,
    entries: query.data?.entries ?? ([] as MoneyEntry[]),
    loadFailed: query.isError || query.isPaused,
  };
}

/** "Not this": the booking leaves the offers at once, and for good. */
export function useDismissMoneySuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) => moneyApi.dismissSuggestion(bookingId),
    onMutate: async (bookingId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.money.suggestions });
      const before = queryClient.getQueryData<MoneySuggestion[]>(queryKeys.money.suggestions);
      queryClient.setQueryData<MoneySuggestion[]>(queryKeys.money.suggestions, (list) =>
        list?.filter((s) => s.bookingId !== bookingId),
      );
      return { before };
    },
    onError: (_error, _bookingId, context) => {
      if (context?.before) queryClient.setQueryData(queryKeys.money.suggestions, context.before);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.money.all });
    },
  });
}

/** Your packages: `open` for the ones still owed on. */
export function useMoneyPackages(status: 'open' | 'all' = 'all', options: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: queryKeys.money.packages(status),
    queryFn: () => moneyApi.packages(status),
    enabled: options.enabled ?? true,
  });
  return {
    ...query,
    packages: query.data ?? ([] as MoneyPackage[]),
    loadFailed: query.isError || query.isPaused,
  };
}

/** One package and its payments. */
export function useMoneyPackage(id: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.money.package(id ?? ''),
    queryFn: () => moneyApi.getPackage(id as string),
    enabled: !!id,
  });
  return {
    ...query,
    pkg: query.data?.package,
    entries: query.data?.entries ?? ([] as MoneyEntry[]),
    loadFailed: query.isError || query.isPaused,
  };
}

/**
 * Package writes. Each moves the ledger as well — a plan writes payments,
 * deleting takes the ones still due — so all of `money` is refetched.
 */
function useMoneyWrite<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.money.all });
    },
  });
}

export function useCreateMoneyPackage() {
  return useMoneyWrite((input: MoneyPackageInput) => moneyApi.createPackage(input));
}

export function useUpdateMoneyPackage() {
  return useMoneyWrite(({ id, ...patch }: MoneyPackagePatch & { id: string }) =>
    moneyApi.updatePackage(id, patch),
  );
}

export function useDeleteMoneyPackage() {
  return useMoneyWrite((id: string) => moneyApi.deletePackage(id));
}

/** Turns the statement link on and gives it back, to share. */
export function useShareMoneyPackage() {
  return useMoneyWrite((id: string) => moneyApi.sharePackage(id));
}

export function useUnshareMoneyPackage() {
  return useMoneyWrite((id: string) => moneyApi.unsharePackage(id));
}

/** How clients pay you. */
export function useMoneyPayMethods(options: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: queryKeys.money.payMethods,
    queryFn: () => moneyApi.payMethods(),
    enabled: options.enabled ?? true,
  });
  return {
    ...query,
    payMethods: query.data ?? ([] as MoneyPayMethod[]),
    loadFailed: query.isError || query.isPaused,
  };
}

export function useCreateMoneyPayMethod() {
  return useMoneyWrite((input: MoneyPayMethodInput) => moneyApi.createPayMethod(input));
}

export function useUpdateMoneyPayMethod() {
  return useMoneyWrite(({ id, ...patch }: Partial<MoneyPayMethodInput> & { id: string }) =>
    moneyApi.updatePayMethod(id, patch),
  );
}

export function useDeleteMoneyPayMethod() {
  return useMoneyWrite((id: string) => moneyApi.deletePayMethod(id));
}

/** A year at a glance. */
export function useMoneyInsights(year: number, options: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: queryKeys.money.insights(year),
    queryFn: () => moneyApi.insights(year),
    enabled: options.enabled ?? true,
  });
  return {
    ...query,
    insights: query.data,
    loadFailed: query.isError || query.isPaused,
  };
}

/** Tax help for a year. */
export function useMoneyTax(year: number, options: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: queryKeys.money.tax(year),
    queryFn: () => moneyApi.tax(year),
    enabled: options.enabled ?? true,
  });
  return {
    ...query,
    tax: query.data,
    loadFailed: query.isError || query.isPaused,
  };
}

/** Ticks a 2307 as in hand, or not. */
export function useMark2307() {
  return useMoneyWrite(({ entryIds, received }: { entryIds: string[]; received: boolean }) =>
    moneyApi.mark2307(entryIds, received),
  );
}

/** The entries that repeat every month. */
export function useMoneyRecurring(options: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: queryKeys.money.recurring,
    queryFn: () => moneyApi.recurring(),
    enabled: options.enabled ?? true,
  });
  return {
    ...query,
    recurring: query.data ?? ([] as MoneyRecurring[]),
    loadFailed: query.isError || query.isPaused,
  };
}

/** Repeat a saved entry every month. It may add past months at once, so all of `money` moves. */
export function useRepeatMoneyEntry() {
  return useMoneyWrite((entryId: string) => moneyApi.repeatEntry(entryId));
}

export function useUpdateMoneyRecurring() {
  return useMoneyWrite(({ id, ...patch }: MoneyRecurringPatch & { id: string }) =>
    moneyApi.updateRecurring(id, patch),
  );
}

export function useStopMoneyRecurring() {
  return useMoneyWrite((id: string) => moneyApi.stopRecurring(id));
}

/** A five-minute link to a range as a CSV, for the browser to save. */
export function useMoneyExport() {
  return useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) => moneyApi.exportUrl(from, to),
  });
}

/** Every saving, with the total set aside and what moved in `month` (YYYY-MM). */
export function useMoneySavings(month?: string, options: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: queryKeys.money.savings(month ?? ''),
    queryFn: () => moneyApi.savings(month),
    enabled: options.enabled ?? true,
  });
  return {
    ...query,
    savings: query.data?.data ?? ([] as MoneySaving[]),
    totalMinor: query.data?.totalMinor ?? 0,
    monthMinor: query.data?.monthMinor ?? 0,
    loadFailed: query.isError || query.isPaused,
  };
}

/** One saving and its history. */
export function useMoneySaving(id: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.money.saving(id ?? ''),
    queryFn: () => moneyApi.getSaving(id as string),
    enabled: !!id,
  });
  return {
    ...query,
    saving: query.data,
    moves: query.data?.moves ?? ([] as MoneySavingMove[]),
    loadFailed: query.isError || query.isPaused,
  };
}

export function useCreateMoneySaving() {
  return useMoneyWrite((input: MoneySavingInput) => moneyApi.createSaving(input));
}

export function useUpdateMoneySaving() {
  return useMoneyWrite(({ id, ...patch }: MoneySavingPatch & { id: string }) => moneyApi.updateSaving(id, patch));
}

export function useDeleteMoneySaving() {
  return useMoneyWrite((id: string) => moneyApi.deleteSaving(id));
}

/** Puts money into a saving, or takes it out. */
export function useMoveMoneySaving() {
  return useMoneyWrite(({ id, ...input }: MoneySavingMoveInput & { id: string }) => moneyApi.moveSaving(id, input));
}

export function useDeleteMoneySavingMove() {
  return useMoneyWrite(({ id, moveId }: { id: string; moveId: string }) => moneyApi.deleteSavingMove(id, moveId));
}
