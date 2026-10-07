import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
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
}

export interface MoneyPayMethodInput {
  kind: PayMethodKind;
  label?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  /** From POST /money/receipts, once its bytes are in the bucket; null removes it. */
  qrReceiptId?: string | null;
}

interface PayMethodRow {
  id: string;
  user_id: string;
  kind: PayMethodKind;
  label: string | null;
  account_name: string | null;
  account_number: string | null;
}

/** As many as a statement has room for. */
export const MAX_PAY_METHODS = 4;

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * How clients pay you: GCash, Maya, a bank account, each with its number and
 * QR code if you like. Virgo only shows them — on a statement you chose to
 * share — and never takes or holds a payment.
 */
@Injectable()
export class MoneyPayMethodsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly receipts: ReceiptFilesService,
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
    }));
  }

  async list(userId: string): Promise<MoneyPayMethod[]> {
    const rows = await this.db.query<PayMethodRow>(
      `select id, user_id, kind, label, account_name, account_number
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

  async create(userId: string, input: MoneyPayMethodInput): Promise<MoneyPayMethod> {
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

    const row = await this.db.transaction(async (tx) => {
      const inserted = await tx.query<PayMethodRow>(
        `insert into money_pay_methods (user_id, kind, label, account_name, account_number, position)
         values ($1, $2, $3, $4, $5, $6)
         returning id, user_id, kind, label, account_name, account_number`,
        [userId, input.kind, fields.label, fields.accountName, fields.accountNumber, count?.n ?? 0],
      );
      const method = inserted.rows[0];
      if (qrReceiptId) {
        await this.receipts.verify(userId, qrReceiptId, { payMethodId: method.id });
        await this.receipts.attach(tx, userId, { payMethodId: method.id }, qrReceiptId);
      }
      return method;
    });
    const [method] = await this.present([row]);
    return method;
  }

  async update(userId: string, id: string, patch: Partial<MoneyPayMethodInput>): Promise<MoneyPayMethod> {
    const current = await this.db.queryOne<PayMethodRow>(
      `select id, user_id, kind, label, account_name, account_number
         from money_pay_methods where id = $1 and user_id = $2`,
      [id, userId],
    );
    if (!current) throw new NotFoundException('Payment method not found');
    const fields = {
      kind: patch.kind ?? current.kind,
      label: patch.label !== undefined ? text(patch.label) : current.label,
      accountName: patch.accountName !== undefined ? text(patch.accountName) : current.account_name,
      accountNumber: patch.accountNumber !== undefined ? text(patch.accountNumber) : current.account_number,
    };
    const hasQr =
      patch.qrReceiptId !== undefined
        ? !!patch.qrReceiptId
        : (await this.receipts.forPayMethods([id])).has(id);
    this.check(fields, hasQr);
    if (patch.qrReceiptId) await this.receipts.verify(userId, patch.qrReceiptId, { payMethodId: id });

    const row = await this.db.transaction(async (tx) => {
      const updated = await tx.query<PayMethodRow>(
        `update money_pay_methods
            set kind = $3, label = $4, account_name = $5, account_number = $6
          where id = $1 and user_id = $2
          returning id, user_id, kind, label, account_name, account_number`,
        [id, userId, fields.kind, fields.label, fields.accountName, fields.accountNumber],
      );
      if (patch.qrReceiptId !== undefined) {
        await this.receipts.attach(tx, userId, { payMethodId: id }, patch.qrReceiptId);
      }
      return updated.rows[0];
    });
    const [method] = await this.present([row]);
    return method;
  }

  /** Its QR code is let go with it, and swept. */
  async remove(userId: string, id: string): Promise<void> {
    const rows = await this.db.query<{ id: string }>(
      'delete from money_pay_methods where id = $1 and user_id = $2 returning id',
      [id, userId],
    );
    if (rows.length === 0) throw new NotFoundException('Payment method not found');
  }
}
