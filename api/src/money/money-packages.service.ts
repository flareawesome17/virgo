import { randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { MEDIA_LOCAL_ZONE } from '../storage/capture-time';
import { MAX_AMOUNT_MINOR } from './money.categories';
import { MoneyService, type MoneyEntry } from './money.service';
import { MoneyPayMethodsService } from './money-pay-methods.service';
import type { StatementView } from './statement.template';

/**
 * What a client agreed to pay for a job, and where that stands: worked out
 * from the income entries linked to it, never stored.
 */
export interface MoneyPackage {
  id: string;
  title: string;
  clientName: string | null;
  /** Centavos: what the client agreed to pay in all. */
  totalMinor: number;
  eventDate: string | null;
  note: string | null;
  /** Paid so far — gross, since tax a client withheld is paid on your behalf. */
  receivedMinor: number;
  /** Payments due but not made yet. */
  scheduledMinor: number;
  /** What is left: total less received, never below zero. */
  balanceMinor: number;
  /** The part of the balance no payment is due for yet. */
  unscheduledMinor: number;
  /** The soonest a scheduled payment is due. */
  nextDueOn: string | null;
  /** A scheduled payment's day has gone by. */
  overdue: boolean;
  paidInFull: boolean;
  payments: number;
  /** The statement link while the package is shared; null when it isn't. */
  shareUrl: string | null;
  sharedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MoneyPackageInput {
  id?: string;
  title: string;
  clientName?: string | null;
  totalMinor: number;
  eventDate?: string | null;
  note?: string | null;
  /** The down payment or reservation fee: paid already, or due on a day. */
  deposit?: { amountMinor: number; paidOn?: string | null; dueOn?: string | null } | null;
  /** When what is left after the deposit is due. Left out, it is not scheduled yet. */
  balanceDueOn?: string | null;
}

export type MoneyPackagePatch = Partial<
  Pick<MoneyPackageInput, 'title' | 'clientName' | 'totalMinor' | 'eventDate' | 'note'>
>;

interface PackageRow {
  id: string;
  user_id: string;
  title: string;
  client_name: string | null;
  total_minor: number;
  event_date: string | null;
  note: string | null;
  share_token: string | null;
  shared_at: Date | null;
  created_at: Date;
  updated_at: Date;
  received: string;
  scheduled: string;
  next_due: string | null;
  payments: number;
  today: string;
}

/** Typed text, trimmed; nothing left is no value at all. */
function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

const MAX_PACKAGES = 2000;

/**
 * Packages: who owes you, and how much is left.
 *
 * Every statement carries the caller's `user_id`, as the ledger's do. The
 * statement link is the one way anybody else sees a package, and only while
 * its owner keeps it shared.
 */
@Injectable()
export class MoneyPackagesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly money: MoneyService,
    private readonly config: ConfigService,
    private readonly payMethods: MoneyPayMethodsService,
  ) {}

  /**
   * Where a statement link is served: the client delivery host, as album
   * share links are, since the client has no Virgo account.
   */
  private statementBase(): string {
    return (
      this.config.get<string>('CLIENT_DELIVERY_URL') ??
      this.config.get<string>('PUBLIC_APP_URL') ??
      this.config.get<string>('PUBLIC_API_URL') ??
      'https://client.virgo.ph'
    ).replace(/\/+$/, '');
  }

  statementUrl(token: string): string {
    return `${this.statementBase()}/s/statement/${token}`;
  }

  /** One select for one package or a list, with its sums from the entries. */
  private select(where: string): string {
    return `
      select p.*,
             coalesce(sum(e.amount_minor) filter (where e.paid_on is not null), 0)::text as received,
             coalesce(sum(e.amount_minor) filter (where e.paid_on is null), 0)::text as scheduled,
             min(e.occurred_on) filter (where e.paid_on is null) as next_due,
             count(e.id)::int as payments,
             (now() at time zone '${MEDIA_LOCAL_ZONE}')::date::text as today
        from money_packages p
        left join money_entries e
          on e.package_id = p.id and e.user_id = p.user_id and e.kind = 'income'
       where ${where}
       group by p.id`;
  }

  private present(row: PackageRow): MoneyPackage {
    const received = Number(row.received);
    const scheduled = Number(row.scheduled);
    const balance = Math.max(0, row.total_minor - received);
    return {
      id: row.id,
      title: row.title,
      clientName: row.client_name,
      totalMinor: row.total_minor,
      eventDate: row.event_date,
      note: row.note,
      receivedMinor: received,
      scheduledMinor: scheduled,
      balanceMinor: balance,
      unscheduledMinor: Math.max(0, balance - scheduled),
      nextDueOn: row.next_due,
      overdue: row.next_due !== null && row.next_due < row.today,
      paidInFull: received >= row.total_minor,
      payments: row.payments,
      shareUrl: row.share_token ? this.statementUrl(row.share_token) : null,
      sharedAt: row.shared_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private async findRow(userId: string, id: string): Promise<PackageRow> {
    const row = await this.db.queryOne<PackageRow>(
      this.select('p.id = $1 and p.user_id = $2'),
      [id, userId],
    );
    if (!row) throw new NotFoundException('Package not found');
    return row;
  }

  /**
   * Open packages first — something still owed, soonest due first — then the
   * ones paid in full, newest first. `open` keeps only the first kind.
   */
  async list(userId: string, status: 'open' | 'all' = 'all'): Promise<MoneyPackage[]> {
    const rows = await this.db.query<PackageRow>(
      `${this.select('p.user_id = $1')}
       ${status === 'open' ? 'having coalesce(sum(e.amount_minor) filter (where e.paid_on is not null), 0) < p.total_minor' : ''}
       order by (coalesce(sum(e.amount_minor) filter (where e.paid_on is not null), 0) >= p.total_minor),
                min(e.occurred_on) filter (where e.paid_on is null) nulls last,
                p.created_at desc
       limit 200`,
      [userId],
    );
    return rows.map((r) => this.present(r));
  }

  /** One package, with every payment toward it. */
  async get(userId: string, id: string): Promise<{ package: MoneyPackage; entries: MoneyEntry[] }> {
    const row = await this.findRow(userId, id);
    return { package: this.present(row), entries: await this.money.forPackage(userId, id) };
  }

  /**
   * A package, and the payments its plan implies: the deposit — paid, or due
   * on a day — and the balance, due when the creative says. Written together,
   * so a package is never half made. Once per id, like an entry.
   */
  async create(userId: string, input: MoneyPackageInput): Promise<{ package: MoneyPackage; entries: MoneyEntry[] }> {
    const id = input.id ?? randomUUID();
    const title = text(input.title);
    if (!title) throw new BadRequestException('Give the package a name.');
    const clientName = text(input.clientName);
    const deposit = input.deposit && input.deposit.amountMinor > 0 ? input.deposit : null;
    if (deposit && deposit.amountMinor > input.totalMinor) {
      throw new BadRequestException("The down payment can't be more than the total.");
    }
    const rest = input.totalMinor - (deposit?.amountMinor ?? 0);

    const existing = await this.db.queryOne<{ user_id: string }>(
      'select user_id from money_packages where id = $1',
      [id],
    );
    if (existing) {
      if (existing.user_id !== userId) throw new ConflictException('That package id is already in use.');
      return this.get(userId, id);
    }
    const count = await this.db.queryOne<{ n: number }>(
      'select count(*)::int as n from money_packages where user_id = $1',
      [userId],
    );
    if ((count?.n ?? 0) >= MAX_PACKAGES) {
      throw new BadRequestException(`You can keep up to ${MAX_PACKAGES.toLocaleString('en-US')} packages.`);
    }

    // The payments are entries like any other, so they go through the
    // ledger's own rules — a deposit paid in the future is refused there.
    const today = (await this.db.queryOne<{ d: string }>(
      `select (now() at time zone '${MEDIA_LOCAL_ZONE}')::date::text as d`,
    ))!.d;
    await this.db.query(
      `insert into money_packages (id, user_id, title, client_name, total_minor, event_date, note)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [id, userId, title, clientName, input.totalMinor, input.eventDate ?? null, text(input.note)],
    );
    try {
      if (deposit) {
        await this.money.create(userId, {
          kind: 'income',
          amountMinor: deposit.amountMinor,
          category: 'job',
          occurredOn: deposit.paidOn ?? deposit.dueOn ?? today,
          paidOn: deposit.paidOn ?? null,
          counterparty: clientName,
          note: `${title} · Down payment`,
          packageId: id,
        });
      }
      if (rest > 0 && input.balanceDueOn) {
        await this.money.create(userId, {
          kind: 'income',
          amountMinor: rest,
          category: 'job',
          occurredOn: input.balanceDueOn,
          paidOn: null,
          counterparty: clientName,
          note: `${title} · Balance`,
          packageId: id,
        });
      }
    } catch (err) {
      // A plan the ledger refused leaves no package behind.
      await this.db.query('delete from money_entries where package_id = $1 and user_id = $2', [id, userId]);
      await this.db.query('delete from money_packages where id = $1 and user_id = $2', [id, userId]);
      throw err;
    }
    return this.get(userId, id);
  }

  async update(userId: string, id: string, patch: MoneyPackagePatch): Promise<MoneyPackage> {
    const current = await this.findRow(userId, id);
    const title = patch.title !== undefined ? text(patch.title) : current.title;
    if (!title) throw new BadRequestException('Give the package a name.');
    const total = patch.totalMinor ?? current.total_minor;
    if (total <= 0 || total > MAX_AMOUNT_MINOR) throw new BadRequestException('Check the total.');
    await this.db.query(
      `update money_packages
          set title = $3, client_name = $4, total_minor = $5, event_date = $6, note = $7
        where id = $1 and user_id = $2`,
      [
        id,
        userId,
        title,
        patch.clientName !== undefined ? text(patch.clientName) : current.client_name,
        total,
        patch.eventDate !== undefined ? patch.eventDate : current.event_date,
        patch.note !== undefined ? text(patch.note) : current.note,
      ],
    );
    return this.present(await this.findRow(userId, id));
  }

  /**
   * The package, and the payments still due under it — they only ever stood
   * for its plan. Payments already made stay in the ledger: they are money
   * that moved.
   */
  async remove(userId: string, id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const owned = await tx.query('select 1 from money_packages where id = $1 and user_id = $2', [id, userId]);
      if (owned.rowCount === 0) throw new NotFoundException('Package not found');
      await tx.query(
        'delete from money_entries where package_id = $1 and user_id = $2 and paid_on is null',
        [id, userId],
      );
      await tx.query('delete from money_packages where id = $1 and user_id = $2', [id, userId]);
    });
  }

  /** Turns the statement link on; the same link while it stays on. */
  async share(userId: string, id: string): Promise<{ url: string }> {
    await this.findRow(userId, id);
    const row = await this.db.queryOne<{ share_token: string }>(
      `update money_packages
          set share_token = coalesce(share_token, $3), shared_at = coalesce(shared_at, now())
        where id = $1 and user_id = $2
        returning share_token`,
      [id, userId, randomBytes(24).toString('base64url')],
    );
    return { url: this.statementUrl(row!.share_token) };
  }

  /**
   * What a shared statement shows, found by its link alone — the link is the
   * credential. Null for a link that was never issued or has been turned off.
   * Only what the page needs leaves here: no ids, no notes, no references.
   */
  async statement(token: string): Promise<StatementView | null> {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
    const pkg = await this.db.queryOne<PackageRow & { owner_name: string }>(
      `select q.*, coalesce(nullif(trim(u.display_name), ''), split_part(u.email, '@', 1)) as owner_name
         from (${this.select('p.share_token = $1')}) q
         join users u on u.id = q.user_id`,
      [token],
    );
    if (!pkg) return null;
    const [entries, payMethods] = await Promise.all([
      this.db.query<{
        occurred_on: string;
        paid_on: string | null;
        amount_minor: number;
        withheld_minor: number;
        method: string | null;
      }>(
        `select occurred_on, paid_on, amount_minor, withheld_minor, method
           from money_entries
          where package_id = $1 and user_id = $2 and kind = 'income'
          order by coalesce(paid_on, occurred_on), created_at`,
        [pkg.id, pkg.user_id],
      ),
      this.payMethods.list(pkg.user_id),
    ]);
    const view = this.present(pkg);
    return {
      creativeName: pkg.owner_name,
      title: view.title,
      clientName: view.clientName,
      eventDate: view.eventDate,
      totalMinor: view.totalMinor,
      receivedMinor: view.receivedMinor,
      balanceMinor: view.balanceMinor,
      unscheduledMinor: view.unscheduledMinor,
      payments: entries
        .filter((e) => e.paid_on !== null)
        .map((e) => ({
          date: e.paid_on as string,
          amountMinor: e.amount_minor,
          withheldMinor: e.withheld_minor,
          method: e.method,
        })),
      // What the client still sends: the fee less any tax they will withhold.
      due: entries
        .filter((e) => e.paid_on === null)
        .map((e) => ({
          date: e.occurred_on,
          amountMinor: e.amount_minor - e.withheld_minor,
          overdue: e.occurred_on < pkg.today,
        })),
      payMethods,
    };
  }

  /** Turns it off. Turned on again, it is a new link: the old one stays dead. */
  async unshare(userId: string, id: string): Promise<void> {
    await this.findRow(userId, id);
    await this.db.query(
      'update money_packages set share_token = null, shared_at = null where id = $1 and user_id = $2',
      [id, userId],
    );
  }
}
