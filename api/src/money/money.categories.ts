/**
 * The words the ledger is kept in.
 *
 * Mirrored in the apps' `src/api/endpoints/money.ts`, which also holds the
 * labels — change both together. The slugs are stored, so a slug is never
 * renamed: a new one is added and the old one left to read as before.
 */

export const MONEY_KINDS = ['income', 'expense'] as const;
export type MoneyKind = (typeof MONEY_KINDS)[number];

/**
 * What came in. A creative's income is mostly one thing — the fee for a job —
 * so the rest are the few that are worth telling apart at tax time.
 */
export const INCOME_CATEGORIES = ['job', 'crew', 'editing', 'products', 'other'] as const;

/**
 * What went out, in the order a creative spends it on a shoot day: getting
 * there, eating, staying, the people and the kit, then the running costs.
 */
export const EXPENSE_CATEGORIES = [
  'transport',
  'meals',
  'accommodation',
  'crew',
  'gear',
  'rental',
  'supplies',
  'software',
  'data',
  'studio',
  'printing',
  'marketing',
  'fees',
  'other',
] as const;

export const MONEY_CATEGORIES: Record<MoneyKind, readonly string[]> = {
  income: INCOME_CATEGORIES,
  expense: EXPENSE_CATEGORIES,
};

/** Every slug of either kind, for the DTO's first check. */
export const ALL_MONEY_CATEGORIES: readonly string[] = [
  ...new Set<string>([...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]),
];

/** How it was paid. The check constraint in 092 lists the same. */
export const MONEY_METHODS = ['gcash', 'maya', 'bank', 'cash', 'card', 'other'] as const;
export type MoneyMethod = (typeof MONEY_METHODS)[number];

/** ₱10,000,000 in centavos — 092's check. Only there to catch a typo. */
export const MAX_AMOUNT_MINOR = 1_000_000_000;

/** CSV headers and the category words in an export, read by an accountant. */
export const CATEGORY_LABELS: Record<MoneyKind, Record<string, string>> = {
  income: {
    job: 'Job fee',
    crew: 'Crew work',
    editing: 'Editing',
    products: 'Prints & products',
    other: 'Other income',
  },
  expense: {
    transport: 'Transport',
    meals: 'Meals',
    accommodation: 'Accommodation',
    crew: 'Crew & assistants',
    gear: 'Gear & repairs',
    rental: 'Gear rental',
    supplies: 'Makeup & supplies',
    software: 'Apps & subscriptions',
    data: 'Load & internet',
    studio: 'Studio & venue',
    printing: 'Prints & albums',
    marketing: 'Ads & marketing',
    fees: 'Fees & charges',
    other: 'Other expense',
  },
};

export const METHOD_LABELS: Record<MoneyMethod, string> = {
  gcash: 'GCash',
  maya: 'Maya',
  bank: 'Bank transfer',
  cash: 'Cash',
  card: 'Card',
  other: 'Other',
};
