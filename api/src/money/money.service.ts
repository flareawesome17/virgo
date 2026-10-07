import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { ReceiptFilesService, type MoneyReceipt } from '../storage/receipt-files.service';
import {
  MoneyBookingsService,
  type MoneyBookingLink,
  type MoneySuggestion,
} from './money-bookings.service';
import {
  CATEGORY_LABELS,
  METHOD_LABELS,
  MONEY_CATEGORIES,
  type MoneyKind,
  type MoneyMethod,
} from './money.categories';

export interface MoneyEntry {
  id: string;
  kind: MoneyKind;
  /** Centavos. For income, the gross — before what the client withheld. */
  amountMinor: number;
  /** Creditable withholding tax the client kept back. Always 0 on an expense. */
  withheldMinor: number;
  currency: string;
  category: string;
  /** YYYY-MM-DD: the shoot, the purchase, or — unpaid — the day it's due. */
  occurredOn: string;
  /** YYYY-MM-DD the money moved. Null is still outstanding. */
  paidOn: string | null;
  method: MoneyMethod | null;
  reference: string | null;
  counterparty: string | null;
  note: string | null;
  receipt: MoneyReceipt | null;
  /** The booking it was recorded from, while that booking exists. */
  booking: MoneyBookingLink | null;
  /** The package it is a payment toward, while that package exists. */
  package: { id: string; title: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface MoneySummary {
  from: string;
  to: string;
  /** Income paid within the range, gross. */
  incomeMinor: number;
  /** Of that, what clients withheld — claimable with their 2307s. */
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
  /** Paid within the range, by kind and category, largest first. */
  byCategory: { kind: MoneyKind; category: string; totalMinor: number; count: number }[];
}

/** What a client sends to make an entry; see CreateMoneyEntryDto. */
export interface MoneyEntryInput {
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
  /** The booking it records, which must be one the caller is on. */
  bookingId?: string | null;
  /** The package it is a payment toward — an income entry, and the caller's package. */
  packageId?: string | null;
}

export type MoneyEntryPatch = Partial<Omit<MoneyEntryInput, 'id'>>;

interface MoneyEntryRow {
  id: string;
  user_id: string;
  kind: MoneyKind;
  amount_minor: number;
  withheld_minor: number;
  currency: string;
  category: string;
  occurred_on: string;
  paid_on: string | null;
  method: MoneyMethod | null;
  reference: string | null;
  counterparty: string | null;
  note: string | null;
  booking_id: string | null;
  package_id: string | null;
  filed_on: string;
  created_at: Date;
  updated_at: Date;
}

/** Every column the apps write, in the order the insert lists them. */
interface EntryFields {
  kind: MoneyKind;
  amountMinor: number;
  withheldMinor: number;
  category: string;
  occurredOn: string;
  paidOn: string | null;
  method: MoneyMethod | null;
  reference: string | null;
  counterparty: string | null;
  note: string | null;
  bookingId: string | null;
  packageId: string | null;
}

/** How long an export link works. Long enough to open; short enough to leak harmlessly. */
const EXPORT_LINK_SECONDS = 5 * 60;
/** Rows in one export: years of a busy creative's entries. */
const MAX_EXPORT_ROWS = 20_000;

/** Typed text, trimmed; nothing left is no value at all. */
function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function yearOf(day: string): number {
  return Number(day.slice(0, 4));
}

/** Tomorrow in UTC: the furthest "today" can be anywhere in the Philippines. */
function latestToday(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
    .toISOString()
    .slice(0, 10);
}

/** A cell a spreadsheet reads as text, never as a formula. */
function csvCell(value: string | number | null): string {
  if (value === null) return '';
  let cell = String(value);
  // =, +, - and @ start a formula in Excel and Sheets; a note that begins
  // with one would run when the accountant opens the file.
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/** ₱1,500.50 as "1500.50": a number every spreadsheet reads in any locale. */
function pesos(minor: number): string {
  return (minor / 100).toFixed(2);
}

/** The days of one whole calendar month, or null when the range is not one. */
function wholeMonth(from: string, to: string): string | null {
  if (!from.endsWith('-01') || from.slice(0, 7) !== to.slice(0, 7)) return null;
  const [y, m] = from.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return to === `${from.slice(0, 7)}-${String(last).padStart(2, '0')}` ? from.slice(0, 7) : null;
}

/**
 * Money: each person's own ledger of what came in and what went out.
 *
 * Strictly personal. Every statement here carries `user_id = $n` for the
 * caller, the way OwnedRepository's do, and nothing widens it — not a
 * workspace, not a booking. An entry id alone is never enough to read one.
 */
@Injectable()
export class MoneyService {
  constructor(
    private readonly db: DatabaseService,
    private readonly receipts: ReceiptFilesService,
    private readonly config: ConfigService,
    private readonly bookings: MoneyBookingsService,
  ) {}

  /** The titles of the caller's packages these entries are payments toward. */
  private async packageTitles(
    userId: string,
    packageIds: readonly string[],
  ): Promise<Map<string, { id: string; title: string }>> {
    const unique = [...new Set(packageIds)];
    if (unique.length === 0) return new Map();
    const rows = await this.db.query<{ id: string; title: string }>(
      'select id, title from money_packages where id = any($1::uuid[]) and user_id = $2',
      [unique, userId],
    );
    return new Map(rows.map((r) => [r.id, { id: r.id, title: r.title }]));
  }

  /**
   * A package the caller owns, for an income entry: a package is what a
   * client pays, so an expense is never a payment toward one.
   */
  private async assertPackage(userId: string, packageId: string, kind: MoneyKind): Promise<void> {
    if (kind !== 'income') {
      throw new BadRequestException('Only income can be a payment toward a package.');
    }
    const row = await this.db.queryOne<{ one: number }>(
      'select 1 as one from money_packages where id = $1 and user_id = $2',
      [packageId, userId],
    );
    if (!row) throw new BadRequestException("That package isn't one of yours.");
  }

  private async present(rows: MoneyEntryRow[]): Promise<MoneyEntry[]> {
    if (rows.length === 0) return [];
    const userId = rows[0].user_id;
    const [receipts, bookings, packages] = await Promise.all([
      this.receipts.forEntries(rows.map((r) => r.id)),
      this.bookings.linksFor(
        userId,
        rows.flatMap((r) => (r.booking_id ? [r.booking_id] : [])),
      ),
      this.packageTitles(
        userId,
        rows.flatMap((r) => (r.package_id ? [r.package_id] : [])),
      ),
    ]);
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      amountMinor: r.amount_minor,
      withheldMinor: r.withheld_minor,
      currency: r.currency,
      category: r.category,
      occurredOn: r.occurred_on,
      paidOn: r.paid_on,
      method: r.method,
      reference: r.reference,
      counterparty: r.counterparty,
      note: r.note,
      receipt: receipts.get(r.id) ?? null,
      booking: (r.booking_id && bookings.get(r.booking_id)) || null,
      package: (r.package_id && packages.get(r.package_id)) || null,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    }));
  }

  private async presentOne(row: MoneyEntryRow): Promise<MoneyEntry> {
    const [entry] = await this.present([row]);
    return entry;
  }

  private async findRow(userId: string, id: string): Promise<MoneyEntryRow> {
    const row = await this.db.queryOne<MoneyEntryRow>(
      'select * from money_entries where id = $1 and user_id = $2',
      [id, userId],
    );
    // Not found and not yours read the same, so an id can't be probed.
    if (!row) throw new NotFoundException('Entry not found');
    return row;
  }

  /**
   * The rules that need more than one field, run on the entry as it will be
   * saved — on an edit, the patch over what is already there.
   */
  private check(entry: EntryFields): void {
    if (!MONEY_CATEGORIES[entry.kind].includes(entry.category)) {
      throw new BadRequestException(
        entry.kind === 'income'
          ? 'Pick an income category for this entry.'
          : 'Pick an expense category for this entry.',
      );
    }
    if (entry.kind === 'expense' && entry.withheldMinor > 0) {
      throw new BadRequestException('Only income can have tax withheld.');
    }
    if (entry.withheldMinor > entry.amountMinor) {
      throw new BadRequestException("Tax withheld can't be more than the amount.");
    }
    for (const day of [entry.occurredOn, entry.paidOn]) {
      if (day && (yearOf(day) < 2000 || yearOf(day) > 2100)) {
        throw new BadRequestException('Use a date between 2000 and 2100.');
      }
    }
    // Paid means it happened. Money that will move later is an unpaid entry
    // due that day, so a future payment date is a typo.
    if (entry.paidOn && entry.paidOn > latestToday()) {
      throw new BadRequestException(
        "A payment can't be dated in the future. Leave it unpaid until it happens.",
      );
    }
  }

  async list(
    userId: string,
    query: {
      from?: string;
      to?: string;
      kind?: MoneyKind;
      unpaid?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ data: MoneyEntry[]; total: number }> {
    const where = `user_id = $1
       and ($2::date is null or filed_on >= $2::date)
       and ($3::date is null or filed_on <= $3::date)
       and ($4::text is null or kind = $4::text)
       and (not $5::boolean or paid_on is null)`;
    const params = [
      userId,
      query.from ?? null,
      query.to ?? null,
      query.kind ?? null,
      query.unpaid === true,
    ];
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);

    const [rows, count] = await Promise.all([
      this.db.query<MoneyEntryRow>(
        `select * from money_entries
          where ${where}
          order by filed_on desc, created_at desc
          limit $6 offset $7`,
        [...params, limit, offset],
      ),
      this.db.queryOne<{ total: number }>(
        `select count(*)::int as total from money_entries where ${where}`,
        params,
      ),
    ]);
    return { data: await this.present(rows), total: count?.total ?? 0 };
  }

  async get(userId: string, id: string): Promise<MoneyEntry> {
    return this.presentOne(await this.findRow(userId, id));
  }

  /**
   * Saves a new entry, once.
   *
   * The id is the phone's when it sent one. The same id from the same person
   * again — a retry after a response that never arrived, the offline queue
   * sending what it already sent — gets the entry that is already there
   * rather than a second one.
   */
  async create(userId: string, input: MoneyEntryInput): Promise<MoneyEntry> {
    const id = input.id ?? randomUUID();
    const entry: EntryFields = {
      kind: input.kind,
      amountMinor: input.amountMinor,
      withheldMinor: input.withheldMinor ?? 0,
      category: input.category,
      occurredOn: input.occurredOn,
      paidOn: input.paidOn ?? null,
      method: input.method ?? null,
      reference: text(input.reference),
      counterparty: text(input.counterparty),
      note: text(input.note),
      bookingId: input.bookingId ?? null,
      packageId: input.packageId ?? null,
    };
    this.check(entry);
    if (entry.bookingId) await this.bookings.assertParty(userId, entry.bookingId);
    if (entry.packageId) await this.assertPackage(userId, entry.packageId, entry.kind);
    const receiptId = input.receiptId ?? null;
    if (receiptId) await this.receipts.verify(userId, receiptId, { entryId: id });

    const row = await this.db.transaction(async (tx) => {
      const inserted = await tx.query<MoneyEntryRow>(
        `insert into money_entries
           (id, user_id, kind, amount_minor, withheld_minor, category,
            occurred_on, paid_on, method, reference, counterparty, note, booking_id, package_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         on conflict (id) do nothing
         returning *`,
        [
          id,
          userId,
          entry.kind,
          entry.amountMinor,
          entry.withheldMinor,
          entry.category,
          entry.occurredOn,
          entry.paidOn,
          entry.method,
          entry.reference,
          entry.counterparty,
          entry.note,
          entry.bookingId,
          entry.packageId,
        ],
      );
      if (inserted.rows[0]) {
        if (receiptId) await this.receipts.attach(tx, userId, { entryId: id }, receiptId);
        return inserted.rows[0];
      }
      const existing = await tx.query<MoneyEntryRow>(
        'select * from money_entries where id = $1 and user_id = $2',
        [id, userId],
      );
      if (!existing.rows[0]) throw new ConflictException('That entry id is already in use.');
      return existing.rows[0];
    });
    return this.presentOne(row);
  }

  async update(userId: string, id: string, patch: MoneyEntryPatch): Promise<MoneyEntry> {
    const current = await this.findRow(userId, id);
    const kind = patch.kind ?? current.kind;
    const entry: EntryFields = {
      kind,
      amountMinor: patch.amountMinor ?? current.amount_minor,
      // Turning income into an expense drops the withholding with it, rather
      // than refusing the change over a field the form no longer shows.
      withheldMinor:
        patch.withheldMinor ?? (kind === 'expense' ? 0 : current.withheld_minor),
      category: patch.category ?? current.category,
      occurredOn: patch.occurredOn ?? current.occurred_on,
      paidOn: patch.paidOn !== undefined ? patch.paidOn : current.paid_on,
      method: patch.method !== undefined ? patch.method : current.method,
      reference: patch.reference !== undefined ? text(patch.reference) : current.reference,
      counterparty:
        patch.counterparty !== undefined ? text(patch.counterparty) : current.counterparty,
      note: patch.note !== undefined ? text(patch.note) : current.note,
      bookingId: patch.bookingId !== undefined ? patch.bookingId : current.booking_id,
      packageId: patch.packageId !== undefined ? patch.packageId : current.package_id,
    };
    this.check(entry);
    if (entry.packageId && (entry.packageId !== current.package_id || entry.kind !== current.kind)) {
      await this.assertPackage(userId, entry.packageId, entry.kind);
    }
    if (entry.bookingId && entry.bookingId !== current.booking_id) {
      await this.bookings.assertParty(userId, entry.bookingId);
    }
    if (patch.receiptId) await this.receipts.verify(userId, patch.receiptId, { entryId: id });

    const row = await this.db.transaction(async (tx) => {
      const updated = await tx.query<MoneyEntryRow>(
        `update money_entries
            set kind = $3, amount_minor = $4, withheld_minor = $5, category = $6,
                occurred_on = $7, paid_on = $8, method = $9, reference = $10,
                counterparty = $11, note = $12, booking_id = $13, package_id = $14
          where id = $1 and user_id = $2
          returning *`,
        [
          id,
          userId,
          entry.kind,
          entry.amountMinor,
          entry.withheldMinor,
          entry.category,
          entry.occurredOn,
          entry.paidOn,
          entry.method,
          entry.reference,
          entry.counterparty,
          entry.note,
          entry.bookingId,
          entry.packageId,
        ],
      );
      if (!updated.rows[0]) throw new NotFoundException('Entry not found');
      if (patch.receiptId !== undefined) {
        await this.receipts.attach(tx, userId, { entryId: id }, patch.receiptId);
      }
      return updated.rows[0];
    });
    return this.presentOne(row);
  }

  /** The payments toward one of the caller's packages, in the order they fall. */
  async forPackage(userId: string, packageId: string): Promise<MoneyEntry[]> {
    const rows = await this.db.query<MoneyEntryRow>(
      `select * from money_entries
        where user_id = $1 and package_id = $2 and kind = 'income'
        order by occurred_on, created_at`,
      [userId, packageId],
    );
    return this.present(rows);
  }

  /**
   * One booking, from the caller's side, for the booking's own screen: what
   * Money offers to record for it, and what has been recorded from it.
   */
  async forBooking(
    userId: string,
    bookingId: string,
  ): Promise<{ suggestion: MoneySuggestion | null; entries: MoneyEntry[] }> {
    const [suggestions, rows] = await Promise.all([
      this.bookings.suggestions(userId, bookingId),
      this.db.query<MoneyEntryRow>(
        `select * from money_entries
          where user_id = $1 and booking_id = $2
          order by filed_on, created_at`,
        [userId, bookingId],
      ),
    ]);
    return { suggestion: suggestions[0] ?? null, entries: await this.present(rows) };
  }

  /** Its receipt is let go with it, and swept. */
  async remove(userId: string, id: string): Promise<void> {
    const rows = await this.db.query<{ id: string }>(
      'delete from money_entries where id = $1 and user_id = $2 returning id',
      [id, userId],
    );
    if (rows.length === 0) throw new NotFoundException('Entry not found');
  }

  /**
   * The totals for a span of days, and what is outstanding overall.
   *
   * Income and expenses count when they were paid — the cash that actually
   * moved in the range, which is also what a quarterly return asks for.
   * Outstanding is not cut by the range: a client who owes from August still
   * owes in October.
   */
  async summary(userId: string, from: string, to: string): Promise<MoneySummary> {
    if (from > to) throw new BadRequestException('The range ends before it starts.');
    const [totals, categories] = await Promise.all([
      this.db.queryOne<{
        income: string;
        withheld: string;
        expense: string;
        entries: number;
        owed_to_you: string;
        owed_to_you_count: number;
        you_owe: string;
        you_owe_count: number;
      }>(
        `select
           coalesce(sum(amount_minor) filter (
             where kind = 'income' and paid_on between $2::date and $3::date), 0)::text as income,
           coalesce(sum(withheld_minor) filter (
             where kind = 'income' and paid_on between $2::date and $3::date), 0)::text as withheld,
           coalesce(sum(amount_minor) filter (
             where kind = 'expense' and paid_on between $2::date and $3::date), 0)::text as expense,
           count(*) filter (where filed_on between $2::date and $3::date)::int as entries,
           coalesce(sum(amount_minor - withheld_minor) filter (
             where kind = 'income' and paid_on is null), 0)::text as owed_to_you,
           count(*) filter (where kind = 'income' and paid_on is null)::int as owed_to_you_count,
           coalesce(sum(amount_minor) filter (
             where kind = 'expense' and paid_on is null), 0)::text as you_owe,
           count(*) filter (where kind = 'expense' and paid_on is null)::int as you_owe_count
         from money_entries
         where user_id = $1`,
        [userId, from, to],
      ),
      this.db.query<{ kind: MoneyKind; category: string; total: string; count: number }>(
        `select kind, category, sum(amount_minor)::text as total, count(*)::int as count
           from money_entries
          where user_id = $1 and paid_on between $2::date and $3::date
          group by kind, category
          order by sum(amount_minor) desc, category`,
        [userId, from, to],
      ),
    ]);
    return {
      from,
      to,
      incomeMinor: Number(totals?.income ?? 0),
      withheldMinor: Number(totals?.withheld ?? 0),
      expenseMinor: Number(totals?.expense ?? 0),
      entries: totals?.entries ?? 0,
      owedToYouMinor: Number(totals?.owed_to_you ?? 0),
      owedToYouCount: totals?.owed_to_you_count ?? 0,
      youOweMinor: Number(totals?.you_owe ?? 0),
      youOweCount: totals?.you_owe_count ?? 0,
      byCategory: categories.map((c) => ({
        kind: c.kind,
        category: c.category,
        totalMinor: Number(c.total),
        count: c.count,
      })),
    };
  }

  /**
   * The range as a spreadsheet, for the person or their bookkeeper: one row
   * per entry, oldest first, in pesos with two decimals.
   *
   * A summary of what they recorded — not a BIR book of accounts, which is
   * why the file says nothing about being one.
   */
  async csv(userId: string, from: string, to: string): Promise<{ filename: string; body: string }> {
    if (from > to) throw new BadRequestException('The range ends before it starts.');
    const rows = await this.db.query<MoneyEntryRow & { receipt_name: string | null }>(
      `select e.*, r.name as receipt_name
         from money_entries e
         left join money_receipts r on r.entry_id = e.id
        where e.user_id = $1 and e.filed_on between $2::date and $3::date
        order by e.filed_on, e.created_at
        limit ${MAX_EXPORT_ROWS}`,
      [userId, from, to],
    );

    const header = [
      'Date',
      'Paid on',
      'Type',
      'Category',
      'Amount (PHP)',
      'Tax withheld (PHP)',
      'Net (PHP)',
      'Method',
      'Reference',
      'Client or supplier',
      'Note',
      'Receipt',
    ];
    const lines = rows.map((r) =>
      [
        r.occurred_on,
        r.paid_on ?? 'Unpaid',
        r.kind === 'income' ? 'Income' : 'Expense',
        CATEGORY_LABELS[r.kind]?.[r.category] ?? r.category,
        pesos(r.amount_minor),
        pesos(r.withheld_minor),
        pesos(r.amount_minor - r.withheld_minor),
        r.method ? METHOD_LABELS[r.method] : null,
        r.reference,
        r.counterparty,
        r.note,
        r.receipt_name,
      ]
        .map(csvCell)
        .join(','),
    );
    const month = wholeMonth(from, to);
    return {
      filename: month ? `virgo-money-${month}.csv` : `virgo-money-${from}-to-${to}.csv`,
      // A BOM, so Excel reads the file as UTF-8 and a ñ survives; CRLF,
      // which is what the format asks for and what Excel writes.
      body: `﻿${[header.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`,
    };
  }

  /**
   * Its own key, derived from the access-token secret, so an export link can
   * never pass for a session and a session can never pass for one.
   */
  private exportKey(): Buffer {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_ACCESS_SECRET'))
      .update('virgo.money-export.v1')
      .digest();
  }

  /**
   * A link that downloads the export without the app's Authorization header —
   * which a phone's browser, handed the file to save, does not have. Signed,
   * for one person and one range, for five minutes.
   */
  exportLink(userId: string, from: string, to: string): { token: string; expiresAt: string } {
    if (from > to) throw new BadRequestException('The range ends before it starts.');
    const expires = Math.floor(Date.now() / 1000) + EXPORT_LINK_SECONDS;
    const body = Buffer.from(JSON.stringify({ u: userId, f: from, t: to, e: expires })).toString(
      'base64url',
    );
    const signature = createHmac('sha256', this.exportKey()).update(body).digest('base64url');
    return { token: `${body}.${signature}`, expiresAt: new Date(expires * 1000).toISOString() };
  }

  /** Who and what an export link is for; refuses one that is forged or old. */
  readExportLink(token: string): { userId: string; from: string; to: string } {
    const invalid = () => new NotFoundException('This export link is not valid.');
    const [body, signature, ...rest] = token.split('.');
    if (!body || !signature || rest.length > 0) throw invalid();

    const expected = createHmac('sha256', this.exportKey()).update(body).digest();
    const given = Buffer.from(signature, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw invalid();

    let claims: { u?: unknown; f?: unknown; t?: unknown; e?: unknown };
    try {
      claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      throw invalid();
    }
    const { u, f, t, e } = claims;
    if (typeof u !== 'string' || typeof f !== 'string' || typeof t !== 'string' || typeof e !== 'number') {
      throw invalid();
    }
    if (e * 1000 < Date.now()) {
      throw new GoneException('This export link has expired. Export again from Virgo.');
    }
    return { userId: u, from: f, to: t };
  }
}
