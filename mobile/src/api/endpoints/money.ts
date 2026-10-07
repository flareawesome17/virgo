import { api } from '../client';
import { API_BASE_URL } from '../config';

/**
 * Money — each person's own ledger of what came in and what went out.
 *
 * Strictly personal: every route is scoped to the signed-in account on the
 * server, and nothing here is shared through a workspace or a booking.
 */

export type MoneyKind = 'income' | 'expense';
export type MoneyMethod = 'gcash' | 'maya' | 'bank' | 'cash' | 'card' | 'other';

/** A receipt on an entry. */
export interface MoneyReceipt {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  /** Signed for an hour: draws a photo, opens a PDF. Null when storage is off. */
  url: string | null;
}

export interface MoneyEntry {
  id: string;
  kind: MoneyKind;
  /** Centavos. For income, the gross — before what the client withheld. */
  amountMinor: number;
  /** Tax the client kept back (their 2307). Always 0 on an expense. */
  withheldMinor: number;
  currency: string;
  category: string;
  /** YYYY-MM-DD: the shoot, the purchase — or, unpaid, the day it's due. */
  occurredOn: string;
  /** YYYY-MM-DD the money moved. Null is still outstanding. */
  paidOn: string | null;
  method: MoneyMethod | null;
  reference: string | null;
  counterparty: string | null;
  note: string | null;
  receipt: MoneyReceipt | null;
  /**
   * The booking it was recorded from, while that booking exists. Optional
   * because entries saved on a phone before bookings were linked have none:
   * read it with `?? null`.
   */
  booking?: MoneyBookingLink | null;
  createdAt: string;
  updatedAt: string;
}

/** The booking an entry was recorded from, as much as the ledger needs. */
export interface MoneyBookingLink {
  id: string;
  postTitle: string;
  role: string | null;
  eventDate: string | null;
  /** Cancelled since the entry was recorded. */
  cancelled: boolean;
}

/**
 * An entry Money offers to record for an agreed booking, filled in from it.
 * Nothing is saved until the person records it.
 */
export interface MoneySuggestion {
  bookingId: string;
  /** Income for the creative who was hired, an expense for whoever hired. */
  kind: MoneyKind;
  category: string;
  /** The agreed rate in centavos, or null when none was set. */
  amountMinor: number | null;
  /** The shoot day, or today for a booking with no date. */
  occurredOn: string;
  /** Whether the form starts as paid: the shoot day has come. */
  paid: boolean;
  /** The other person on the booking. */
  counterparty: string;
  note: string;
  postTitle: string;
  role: string | null;
  eventDate: string | null;
}

/** "Reyes wedding · Second shooter": a booking, the way a ledger row names it. */
export function bookingLabel(b: { postTitle: string; role: string | null }): string {
  return b.role ? `${b.postTitle} · ${b.role}` : b.postTitle;
}

export interface MoneySummary {
  from: string;
  to: string;
  /** Income paid within the range, gross. */
  incomeMinor: number;
  /** Of that, what clients withheld. */
  withheldMinor: number;
  /** Expenses paid within the range. */
  expenseMinor: number;
  /** Entries filed within the range, paid or not. */
  entries: number;
  /** Everything clients still owe, whenever it was due: the net expected. */
  owedToYouMinor: number;
  owedToYouCount: number;
  /** Everything not paid yet on the other side. */
  youOweMinor: number;
  youOweCount: number;
  byCategory: { kind: MoneyKind; category: string; totalMinor: number; count: number }[];
}

export interface MoneyEntryInput {
  /** Made on the device, so a retried save finds the entry it already wrote. */
  id?: string;
  kind: MoneyKind;
  amountMinor: number;
  withheldMinor?: number;
  category: string;
  occurredOn: string;
  paidOn?: string | null;
  method?: MoneyMethod | null;
  reference?: string | null;
  counterparty?: string | null;
  note?: string | null;
  receiptId?: string | null;
  /** The booking it records — one you are on. */
  bookingId?: string | null;
}

/** Undefined leaves a field alone; null clears it. */
export type MoneyEntryPatch = Partial<Omit<MoneyEntryInput, 'id'>>;

export interface MoneyListParams {
  /** Filed on or after this day. */
  from?: string;
  /** Filed on or before this day. */
  to?: string;
  kind?: MoneyKind;
  /** Only what is still outstanding. */
  unpaid?: boolean;
  limit?: number;
  offset?: number;
}

/** A signed upload for one receipt. `id` is what the entry sends. */
export interface ReceiptUploadTicket {
  id: string;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  expiresAt: string;
}

export interface MoneyCategory {
  slug: string;
  label: string;
}

/**
 * The categories, in the order the chips show them. Mirrors
 * api/src/money/money.categories.ts — change both together. Slugs are stored,
 * so one is never renamed.
 */
export const MONEY_CATEGORIES: Record<MoneyKind, readonly MoneyCategory[]> = {
  income: [
    { slug: 'job', label: 'Job fee' },
    { slug: 'crew', label: 'Crew work' },
    { slug: 'editing', label: 'Editing' },
    { slug: 'products', label: 'Prints & products' },
    { slug: 'other', label: 'Other' },
  ],
  expense: [
    { slug: 'transport', label: 'Transport' },
    { slug: 'meals', label: 'Meals' },
    { slug: 'accommodation', label: 'Accommodation' },
    { slug: 'crew', label: 'Crew & assistants' },
    { slug: 'gear', label: 'Gear & repairs' },
    { slug: 'rental', label: 'Gear rental' },
    { slug: 'supplies', label: 'Makeup & supplies' },
    { slug: 'software', label: 'Apps & subscriptions' },
    { slug: 'data', label: 'Load & internet' },
    { slug: 'studio', label: 'Studio & venue' },
    { slug: 'printing', label: 'Prints & albums' },
    { slug: 'marketing', label: 'Ads & marketing' },
    { slug: 'fees', label: 'Fees & charges' },
    { slug: 'other', label: 'Other' },
  ],
};

export const MONEY_METHODS: readonly { slug: MoneyMethod; label: string }[] = [
  { slug: 'gcash', label: 'GCash' },
  { slug: 'maya', label: 'Maya' },
  { slug: 'bank', label: 'Bank' },
  { slug: 'cash', label: 'Cash' },
  { slug: 'card', label: 'Card' },
  { slug: 'other', label: 'Other' },
];

/** What an entry's category is called, or the slug for one this app predates. */
export function categoryLabel(kind: MoneyKind, slug: string): string {
  return MONEY_CATEGORIES[kind].find((c) => c.slug === slug)?.label ?? slug;
}

export function methodLabel(method: MoneyMethod | null): string | null {
  return method ? (MONEY_METHODS.find((m) => m.slug === method)?.label ?? null) : null;
}

/** The most an entry can be: ₱10,000,000. Only there to catch a typo. */
export const MAX_AMOUNT_MINOR = 1_000_000_000;

/**
 * Typed pesos as centavos: "1,500" is 150000, "350.5" is 35050. Null for
 * anything that is not a positive amount with at most two decimals.
 *
 * Whole pesos and centavos are read apart rather than by multiplying a float,
 * which turns 0.29 into 28.999… and a peso into a centavo short.
 */
export function pesosToMinor(text: string): number | null {
  const cleaned = text.replace(/[₱,\s]/g, '');
  const match = /^(\d{1,8})(?:\.(\d{0,2}))?$/.exec(cleaned) ?? /^\.(\d{1,2})$/.exec(cleaned);
  if (!match) return null;
  const [whole, cents] = match.length === 3 ? [match[1], match[2] ?? ''] : ['0', match[1]];
  const minor = Number(whole) * 100 + Number(cents.padEnd(2, '0'));
  return minor > 0 && minor <= MAX_AMOUNT_MINOR ? minor : null;
}

/** Centavos back into what the amount field holds: "1500", "350.50". */
export function minorToPesos(minor: number): string {
  const whole = Math.floor(minor / 100);
  const cents = minor % 100;
  return cents ? `${whole}.${String(cents).padStart(2, '0')}` : String(whole);
}

/** Today on this device, YYYY-MM-DD — the day the person is living in. */
export function todayIso(now: Date = new Date()): string {
  return isoDay(now);
}

/** A local date as YYYY-MM-DD, without passing through UTC. */
export function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** YYYY-MM-DD as a local date at midnight, for a date picker. */
export function dateOfIso(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "2026-10" for the month a day is in. */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** The first and last day of a month written "2026-10". */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/** The month `delta` months from this one. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const moved = new Date(y, m - 1 + delta, 1);
  return `${moved.getFullYear()}-${String(moved.getMonth() + 1).padStart(2, '0')}`;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * "October 2026", or "October" within the current year. Spelled out by hand,
 * like formatMoney: Intl's month names are not something Hermes can be
 * relied on for.
 */
export function monthLabel(month: string, today: string = todayIso()): string {
  const [y, m] = month.split('-').map(Number);
  const name = MONTHS[m - 1] ?? month;
  return String(y) === today.slice(0, 4) ? name : `${name} ${y}`;
}

/** "Today", "Yesterday", "Sat, Oct 3", or "Oct 3, 2025" for another year. */
export function dayLabel(day: string, today: string = todayIso()): string {
  if (day === today) return 'Today';
  const date = dateOfIso(day);
  const yesterday = dateOfIso(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === isoDay(yesterday)) return 'Yesterday';
  const short = `${MONTHS[date.getMonth()].slice(0, 3)} ${date.getDate()}`;
  return day.slice(0, 4) === today.slice(0, 4)
    ? `${DAYS[date.getDay()]}, ${short}`
    : `${short}, ${date.getFullYear()}`;
}

/** Whether an unpaid entry's day has gone by. */
export function isOverdue(entry: Pick<MoneyEntry, 'paidOn' | 'occurredOn'>, today: string = todayIso()): boolean {
  return entry.paidOn === null && entry.occurredOn < today;
}

/**
 * What can be attached. Mirrors RECEIPT_FILE_TYPES in
 * api/src/storage/receipt-files.service.ts — change both together.
 */
export const RECEIPT_FILE_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

/** Why a file cannot be a receipt, or null when it can. */
export function receiptFileProblem(file: { type: string; size: number }): string | null {
  if (!RECEIPT_FILE_TYPES.includes(file.type)) {
    return 'Attach a photo (JPEG, PNG or WebP) or a PDF.';
  }
  if (file.size > MAX_RECEIPT_BYTES) return 'A receipt has to be under 10 MB.';
  if (file.size <= 0) return 'That file appears to be empty.';
  return null;
}

export const moneyApi = {
  list(params: MoneyListParams = {}): Promise<{ data: MoneyEntry[]; total: number }> {
    return api.get('/money/entries', { query: params });
  },

  get(id: string): Promise<MoneyEntry> {
    return api.get(`/money/entries/${id}`);
  },

  /** Saves once per `id`: the same id again returns the entry already saved. */
  create(input: MoneyEntryInput): Promise<MoneyEntry> {
    return api.post('/money/entries', { body: input });
  },

  update(id: string, patch: MoneyEntryPatch): Promise<MoneyEntry> {
    return api.patch(`/money/entries/${id}`, { body: patch });
  },

  remove(id: string): Promise<void> {
    return api.delete(`/money/entries/${id}`);
  },

  /** Paid totals for a span of days, and what is outstanding overall. */
  summary(from: string, to: string): Promise<MoneySummary> {
    return api.get('/money/summary', { query: { from, to } });
  },

  /** Agreed bookings not recorded yet, soonest shoot first. */
  suggestions(): Promise<MoneySuggestion[]> {
    return api.get('/money/suggestions');
  },

  /** "Not this": the booking is not offered again. */
  dismissSuggestion(bookingId: string): Promise<void> {
    return api.post(`/money/suggestions/${bookingId}/dismiss`);
  },

  /** One booking from your side: what Money offers for it, and what was recorded from it. */
  forBooking(bookingId: string): Promise<{ suggestion: MoneySuggestion | null; entries: MoneyEntry[] }> {
    return api.get(`/money/bookings/${bookingId}`);
  },

  /**
   * Signs one receipt's upload. Put the bytes to `uploadUrl` with
   * `requiredHeaders`, then save the entry with `receiptId: id`. Unsaved, it
   * is gone a day later.
   */
  signReceipt(input: {
    contentType: string;
    contentLength: number;
    name?: string;
  }): Promise<ReceiptUploadTicket> {
    return api.post('/money/receipts', { body: input });
  },

  /**
   * A link to the range as a CSV, good for five minutes. It needs no
   * session, so a phone can hand it to the browser to save the file.
   */
  async exportUrl(from: string, to: string): Promise<string> {
    const { token } = await api.post<{ token: string; expiresAt: string }>('/money/export', {
      body: { from, to },
    });
    return `${API_BASE_URL}/money/export/${token}`;
  },
};
