import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { describeDevice } from '../auth/device-label';
import { ReauthService, type DeleteProof } from '../auth/reauth.service';
import { manilaTime } from '../auth/sessions.service';
import { DatabaseService } from '../database/database.service';
import { MailConfig } from '../mail/mail.config';
import { MailService } from '../mail/mail.service';
import { payDetailsChanged } from '../mail/mail.templates';
import { NotifyService } from '../notifications/notify.service';
import { ReceiptFilesService, type MoneyReceipt } from '../storage/receipt-files.service';

export const PAY_METHOD_KINDS = ['gcash', 'maya', 'bank', 'other'] as const;
export type PayMethodKind = (typeof PAY_METHOD_KINDS)[number];

/** How a client can pay this person: shown on the statements they share. */
export interface MoneyPayMethod {
  id: string;
  kind: PayMethodKind;
  /** The bank's name, or what "other" is. */
  label: string | null;
  accountName: string | null;
  accountNumber: string | null;
  /** A QR code — GCash's or Maya's "receive money", or a bank's QR Ph. */
  qr: MoneyReceipt | null;
  /**
   * When what a client pays to last changed: kind, bank, name, number or QR.
   * Making a method the main one does not count. The statement shows it,
   * and warns for a day after.
   */
  detailsChangedAt: string;
}

export interface MoneyPayMethodInput {
  kind: PayMethodKind;
  label?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  /** From POST /money/receipts, once its bytes are in the bucket; null removes it. */
  qrReceiptId?: string | null;
}

/**
 * A way to pay as somebody else is shown it — a client reading a chat card,
 * a poster on a booking. The details and a link to the QR, and nothing about
 * the uploaded file itself: not its name, which is the owner's own.
 */
export interface PayCardMethod {
  id: string;
  kind: PayMethodKind;
  label: string | null;
  accountName: string | null;
  accountNumber: string | null;
  qrUrl: string | null;
  detailsChangedAt: string;
}

export function toCard(m: MoneyPayMethod): PayCardMethod {
  return {
    id: m.id,
    kind: m.kind,
    label: m.label,
    accountName: m.accountName,
    accountNumber: m.accountNumber,
    qrUrl: m.qr?.url ?? null,
    detailsChangedAt: m.detailsChangedAt,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Who is asking: the proof that it is the account holder, and the device, for the email. */
export interface PayMethodChangeContext {
  proof: DeleteProof;
  userAgent?: string | null;
}

interface PayMethodRow {
  id: string;
  user_id: string;
  kind: PayMethodKind;
  label: string | null;
  account_name: string | null;
  account_number: string | null;
  details_changed_at: Date;
}

const COLUMNS = 'id, user_id, kind, label, account_name, account_number, details_changed_at';

/** As many as a statement has room for. */
export const MAX_PAY_METHODS = 4;

const KIND_NAMES: Record<PayMethodKind, string> = {
  gcash: 'GCash',
  maya: 'Maya',
  bank: 'Bank',
  other: 'Other',
};

/** What a method is called in an email: the bank's name, or the wallet's. */
function nameOf(m: { kind: PayMethodKind; label: string | null }): string {
  return (m.kind === 'bank' || m.kind === 'other') && m.label ? m.label : KIND_NAMES[m.kind];
}

/** The last four digits of a number, for an email that must not carry all of it. */
function ending(accountNumber: string | null): string | null {
  const digits = (accountNumber ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * How clients pay you: GCash, Maya, a bank account, each with its number and
 * QR code if you like. Virgo only shows them — on your own phone to scan, and
 * on a statement you chose to share — and never takes or holds a payment.
 *
 * Adding, changing or removing one asks for the password, or with two-factor
 * on the emailed code (ReauthService), and each such change is emailed and
 * notified. These details decide where a client's money goes; someone in the
 * account swapping in their own QR code is the harm this guards against.
 */
@Injectable()
export class MoneyPayMethodsService {
  private readonly logger = new Logger(MoneyPayMethodsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly receipts: ReceiptFilesService,
    private readonly reauth: ReauthService,
    private readonly mail: MailService,
    private readonly mailConfig: MailConfig,
    private readonly notifier: NotifyService,
  ) {}

  private async present(rows: PayMethodRow[]): Promise<MoneyPayMethod[]> {
    const qrs = await this.receipts.forPayMethods(rows.map((r) => r.id));
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      label: r.label,
      accountName: r.account_name,
      accountNumber: r.account_number,
      qr: qrs.get(r.id) ?? null,
      detailsChangedAt: new Date(r.details_changed_at).toISOString(),
    }));
  }

  /** The main way to pay first, then the rest as they were added. */
  async list(userId: string): Promise<MoneyPayMethod[]> {
    const rows = await this.db.query<PayMethodRow>(
      `select ${COLUMNS}
         from money_pay_methods where user_id = $1
        order by position, created_at`,
      [userId],
    );
    return this.present(rows);
  }

  /** Something a client can pay to: a number, or a code to scan. */
  private check(fields: { accountNumber: string | null }, hasQr: boolean): void {
    if (!fields.accountNumber && !hasQr) {
      throw new BadRequestException('Add the number, or a QR code, so clients can pay you.');
    }
  }

  async create(
    userId: string,
    input: MoneyPayMethodInput,
    context: PayMethodChangeContext,
  ): Promise<MoneyPayMethod> {
    const count = await this.db.queryOne<{ n: number }>(
      'select count(*)::int as n from money_pay_methods where user_id = $1',
      [userId],
    );
    if ((count?.n ?? 0) >= MAX_PAY_METHODS) {
      throw new BadRequestException(`You can add up to ${MAX_PAY_METHODS} ways to pay.`);
    }
    const fields = {
      label: text(input.label),
      accountName: text(input.accountName),
      accountNumber: text(input.accountNumber),
    };
    const qrReceiptId = input.qrReceiptId ?? null;
    this.check(fields, !!qrReceiptId);
    await this.reauth.confirm(userId, context.proof, 'pay_details');

    const row = await this.db.transaction(async (tx) => {
      const inserted = await tx.query<PayMethodRow>(
        `insert into money_pay_methods (user_id, kind, label, account_name, account_number, position)
         values ($1, $2, $3, $4, $5, $6)
         returning ${COLUMNS}`,
        [userId, input.kind, fields.label, fields.accountName, fields.accountNumber, count?.n ?? 0],
      );
      const method = inserted.rows[0];
      if (qrReceiptId) {
        await this.receipts.verify(userId, qrReceiptId, { payMethodId: method.id });
        await this.receipts.attach(tx, userId, { payMethodId: method.id }, qrReceiptId);
      }
      return method;
    });
    void this.alert(userId, {
      change: 'added',
      method: nameOf(row),
      numberEnding: ending(row.account_number),
      qr: qrReceiptId ? 'added' : null,
      userAgent: context.userAgent,
    });
    const [method] = await this.present([row]);
    return method;
  }

  async update(
    userId: string,
    id: string,
    patch: Partial<MoneyPayMethodInput>,
    context: PayMethodChangeContext,
  ): Promise<MoneyPayMethod> {
    const current = await this.db.queryOne<PayMethodRow>(
      `select ${COLUMNS} from money_pay_methods where id = $1 and user_id = $2`,
      [id, userId],
    );
    if (!current) throw new NotFoundException('Payment method not found');
    const fields = {
      kind: patch.kind ?? current.kind,
      label: patch.label !== undefined ? text(patch.label) : current.label,
      accountName: patch.accountName !== undefined ? text(patch.accountName) : current.account_name,
      accountNumber: patch.accountNumber !== undefined ? text(patch.accountNumber) : current.account_number,
    };
    const currentQr = (await this.receipts.forPayMethods([id])).get(id) ?? null;
    const hasQr = patch.qrReceiptId !== undefined ? !!patch.qrReceiptId : !!currentQr;
    this.check(fields, hasQr);
    await this.reauth.confirm(userId, context.proof, 'pay_details');
    if (patch.qrReceiptId) await this.receipts.verify(userId, patch.qrReceiptId, { payMethodId: id });

    const qr: 'added' | 'replaced' | 'removed' | null =
      patch.qrReceiptId === undefined || patch.qrReceiptId === (currentQr?.id ?? null)
        ? null
        : !patch.qrReceiptId
          ? 'removed'
          : currentQr
            ? 'replaced'
            : 'added';
    const changed =
      qr !== null ||
      fields.kind !== current.kind ||
      fields.label !== current.label ||
      fields.accountName !== current.account_name ||
      fields.accountNumber !== current.account_number;

    const row = await this.db.transaction(async (tx) => {
      const updated = await tx.query<PayMethodRow>(
        `update money_pay_methods
            set kind = $3, label = $4, account_name = $5, account_number = $6,
                details_changed_at = case when $7::boolean then now() else details_changed_at end
          where id = $1 and user_id = $2
          returning ${COLUMNS}`,
        [id, userId, fields.kind, fields.label, fields.accountName, fields.accountNumber, changed],
      );
      if (patch.qrReceiptId !== undefined) {
        await this.receipts.attach(tx, userId, { payMethodId: id }, patch.qrReceiptId);
      }
      return updated.rows[0];
    });
    if (changed) {
      void this.alert(userId, {
        change: 'changed',
        method: nameOf(row),
        numberEnding:
          fields.accountNumber !== current.account_number ? ending(row.account_number) : null,
        qr,
        userAgent: context.userAgent,
      });
    }
    const [method] = await this.present([row]);
    return method;
  }

  /** Its QR code is let go with it, and swept. */
  async remove(userId: string, id: string, context: PayMethodChangeContext): Promise<void> {
    const current = await this.db.queryOne<PayMethodRow>(
      `select ${COLUMNS} from money_pay_methods where id = $1 and user_id = $2`,
      [id, userId],
    );
    if (!current) throw new NotFoundException('Payment method not found');
    await this.reauth.confirm(userId, context.proof, 'pay_details');
    const rows = await this.db.query<{ id: string }>(
      'delete from money_pay_methods where id = $1 and user_id = $2 returning id',
      [id, userId],
    );
    if (rows.length === 0) throw new NotFoundException('Payment method not found');
    void this.alert(userId, {
      change: 'removed',
      method: nameOf(current),
      numberEnding: null,
      qr: null,
      userAgent: context.userAgent,
    });
  }

  /**
   * Makes one the main way to pay: first in the list, and first and largest
   * on a statement. Asks for no password — every method here was already
   * let in with one, and the order changes nothing a client pays to.
   */
  async makeMain(userId: string, id: string): Promise<MoneyPayMethod[]> {
    const owned = await this.db.queryOne<{ id: string }>(
      'select id from money_pay_methods where id = $1 and user_id = $2',
      [id, userId],
    );
    if (!owned) throw new NotFoundException('Payment method not found');
    await this.db.query(
      `with ordered as (
         select id, (row_number() over (order by (id = $2) desc, position, created_at) - 1)::smallint as pos
           from money_pay_methods
          where user_id = $1
       )
       update money_pay_methods m
          set position = o.pos
         from ordered o
        where m.id = o.id and m.user_id = $1 and m.position is distinct from o.pos`,
      [userId, id],
    );
    return this.list(userId);
  }

  /**
   * Ways to pay as somebody else sees them: on a chat card. By id, each with
   * its owner, for the caller to check the owner is who sent the card. The
   * QR's link is minted for this read, and expires like every other.
   */
  async cardsByIds(ids: readonly string[]): Promise<Map<string, PayCardMethod & { ownerId: string }>> {
    const unique = [...new Set(ids)].filter((id) => UUID.test(id));
    const cards = new Map<string, PayCardMethod & { ownerId: string }>();
    if (unique.length === 0) return cards;
    const rows = await this.db.query<PayMethodRow>(
      `select ${COLUMNS} from money_pay_methods where id = any($1::uuid[])`,
      [unique],
    );
    const presented = await this.present(rows);
    rows.forEach((row, i) => cards.set(row.id, { ...toCard(presented[i]), ownerId: row.user_id }));
    return cards;
  }

  /** Someone's main way to pay, as the person who owes them sees it; null when they have none. */
  async mainCardOf(ownerId: string): Promise<PayCardMethod | null> {
    const rows = await this.db.query<PayMethodRow>(
      `select ${COLUMNS}
         from money_pay_methods where user_id = $1
        order by position, created_at
        limit 1`,
      [ownerId],
    );
    if (rows.length === 0) return null;
    const [main] = await this.present(rows);
    return toCard(main);
  }

  /**
   * Tells the account holder, by email and in Notifications, that a way to
   * pay changed. Never throws, and nobody waits on it: the change is made.
   */
  async alert(
    userId: string,
    change: {
      change: 'added' | 'changed' | 'removed';
      method: string;
      numberEnding: string | null;
      qr: 'added' | 'replaced' | 'removed' | null;
      userAgent?: string | null;
    },
  ): Promise<void> {
    try {
      const user = await this.db.queryOne<{ email: string }>('select email from users where id = $1', [
        userId,
      ]);
      if (!user) return;
      const label = change.userAgent ? describeDevice(change.userAgent, null) : null;
      const device = label && label.device !== 'Unknown device' ? `${label.app} · ${label.device}` : null;
      const devicesUrl = `${this.mailConfig.appUrl}/settings/devices`;

      await this.mail.send(
        user.email,
        payDetailsChanged({
          method: change.method,
          change: change.change,
          numberEnding: change.numberEnding,
          qr: change.qr,
          when: manilaTime(new Date()),
          device,
          devicesUrl,
        }),
      );

      const what =
        change.change === 'added'
          ? `${change.method} was added to how clients pay you`
          : change.change === 'removed'
            ? `${change.method} was removed from how clients pay you`
            : `Your ${change.method} pay details changed`;
      const detail = change.numberEnding
        ? `The number now ends in ${change.numberEnding}. `
        : change.qr === 'replaced' || change.qr === 'added'
          ? 'A new QR code is on it. '
          : '';
      await this.notifier.notify([userId], {
        topic: 'money',
        title: what,
        body: `${detail}Not you? Change your password, then check Devices in Settings.`,
        data: { type: 'money', payMethods: true },
      });
    } catch (err) {
      this.logger.warn(
        `Could not send a pay-details alert: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
