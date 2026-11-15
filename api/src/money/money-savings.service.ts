import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MEDIA_LOCAL_ZONE } from '../storage/capture-time';

/** The pictures a saving can have. Words here; the clients draw them. */
export const SAVING_ICONS = ['gear', 'tax', 'safety', 'slow', 'trip', 'home', 'family', 'other'] as const;
export type SavingIcon = (typeof SAVING_ICONS)[number];

/** A billion pesos, in centavos: past anything this is for, well inside a bigint. */
export const MAX_SAVING_MINOR = 100_000_000_000;

/**
 * "As many as we want", with a ceiling far above what anyone keeps, so one
 * account cannot be made to hold a million rows.
 */
export const MAX_SAVINGS = 200;

/** How much of a saving's history one read returns. */
const MOVES_SHOWN = 200;

export interface MoneySaving {
  id: string;
  name: string;
  icon: SavingIcon;
  goalMinor: number | null;
  targetDate: string | null;
  keptIn: string | null;
  /** What it holds: every move added up. Never stored. */
  balanceMinor: number;
  /** Put in, less taken out, in the month asked about. */
  monthMinor: number;
  createdAt: string;
}

export interface MoneySavingMove {
  id: string;
  /** Positive is put in, negative is taken out. */
  amountMinor: number;
  note: string | null;
  movedOn: string;
  createdAt: string;
}

export interface MoneySavingsList {
  data: MoneySaving[];
  /** Everything set aside, across all of them. */
  totalMinor: number;
  /** Net of what went in and came out in the month asked about. */
  monthMinor: number;
  month: string;
}

export interface MoneySavingInput {
  name: string;
  icon?: SavingIcon;
  goalMinor?: number | null;
  targetDate?: string | null;
  keptIn?: string | null;
  startingMinor?: number;
}

interface SavingRow {
  id: string;
  name: string;
  icon: string;
  goal_minor: string | null;
  target_date: string | null;
  kept_in: string | null;
  created_at: Date;
  balance: string;
  month: string;
}

interface MoveRow {
  id: string;
  amount_minor: string;
  note: string | null;
  moved_on: string;
  created_at: Date;
}

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function present(row: SavingRow): MoneySaving {
  return {
    id: row.id,
    name: row.name,
    icon: (SAVING_ICONS as readonly string[]).includes(row.icon) ? (row.icon as SavingIcon) : 'other',
    // bigint comes back as text; these are far inside what a number holds.
    goalMinor: row.goal_minor === null ? null : Number(row.goal_minor),
    targetDate: row.target_date,
    keptIn: row.kept_in,
    balanceMinor: Number(row.balance),
    monthMinor: Number(row.month),
    createdAt: row.created_at.toISOString(),
  };
}

function presentMove(row: MoveRow): MoneySavingMove {
  return {
    id: row.id,
    amountMinor: Number(row.amount_minor),
    note: row.note,
    movedOn: row.moved_on,
    createdAt: row.created_at.toISOString(),
  };
}

/** One saving with what it holds, and what moved in the month given ($2, YYYY-MM). */
const SAVING_COLUMNS = `
  s.id, s.name, s.icon, s.goal_minor::text, s.target_date::text, s.kept_in, s.created_at,
  coalesce((select sum(m.amount_minor) from money_saving_moves m where m.saving_id = s.id), 0)::text as balance,
  coalesce((
    select sum(m.amount_minor) from money_saving_moves m
     where m.saving_id = s.id and to_char(m.moved_on, 'YYYY-MM') = $2
  ), 0)::text as month`;

/**
 * Savings: what a person is putting aside, and toward what.
 *
 * Virgo holds none of it and moves none of it. These are their own notes of
 * money kept wherever they keep it, and a move is not an expense: the ledger
 * (money_entries) is untouched by anything here, so what was earned and what
 * the tax estimate reads stay what they were.
 */
@Injectable()
export class MoneySavingsService {
  constructor(private readonly db: DatabaseService) {}

  /** This month in Manila, as YYYY-MM, and today as YYYY-MM-DD. */
  private async now(): Promise<{ month: string; today: string }> {
    const row = await this.db.queryOne<{ month: string; today: string }>(
      `select to_char(now() at time zone '${MEDIA_LOCAL_ZONE}', 'YYYY-MM') as month,
              (now() at time zone '${MEDIA_LOCAL_ZONE}')::date::text as today`,
    );
    return row ?? { month: '1970-01', today: '1970-01-01' };
  }

  async list(userId: string, month?: string): Promise<MoneySavingsList> {
    const asked = month ?? (await this.now()).month;
    const rows = await this.db.query<SavingRow>(
      `select ${SAVING_COLUMNS}
         from money_savings s
        where s.user_id = $1
        order by s.created_at, s.id`,
      [userId, asked],
    );
    const data = rows.map(present);
    return {
      data,
      totalMinor: data.reduce((sum, saving) => sum + saving.balanceMinor, 0),
      monthMinor: data.reduce((sum, saving) => sum + saving.monthMinor, 0),
      month: asked,
    };
  }

  private async one(userId: string, id: string): Promise<MoneySaving> {
    const { month } = await this.now();
    const row = await this.db.queryOne<SavingRow>(
      `select ${SAVING_COLUMNS}
         from money_savings s
        where s.user_id = $1 and s.id = $3`,
      [userId, month, id],
    );
    if (!row) throw new NotFoundException('Saving not found');
    return present(row);
  }

  /** The saving, and what went in and out of it, newest first. */
  async get(userId: string, id: string): Promise<MoneySaving & { moves: MoneySavingMove[] }> {
    const saving = await this.one(userId, id);
    const moves = await this.db.query<MoveRow>(
      `select id, amount_minor::text, note, moved_on::text, created_at
         from money_saving_moves
        where saving_id = $1 and user_id = $2
        order by moved_on desc, created_at desc
        limit ${MOVES_SHOWN}`,
      [id, userId],
    );
    return { ...saving, moves: moves.map(presentMove) };
  }

  async create(userId: string, input: MoneySavingInput): Promise<MoneySaving> {
    const name = text(input.name);
    if (!name) throw new BadRequestException('Give it a name.');
    const count = await this.db.queryOne<{ n: number }>(
      'select count(*)::int as n from money_savings where user_id = $1',
      [userId],
    );
    if ((count?.n ?? 0) >= MAX_SAVINGS) {
      throw new BadRequestException(`You can keep up to ${MAX_SAVINGS} savings. Delete one you have finished with.`);
    }
    const starting = input.startingMinor ?? 0;
    const { today } = await this.now();

    const id = await this.db.transaction(async (tx) => {
      const inserted = await tx.query<{ id: string }>(
        `insert into money_savings (user_id, name, icon, goal_minor, target_date, kept_in)
         values ($1, $2, $3, $4, $5, $6)
         returning id`,
        [userId, name, input.icon ?? 'other', input.goalMinor ?? null, input.targetDate ?? null, text(input.keptIn)],
      );
      const savingId = inserted.rows[0].id;
      if (starting > 0) {
        await tx.query(
          `insert into money_saving_moves (saving_id, user_id, amount_minor, note, moved_on)
           values ($1, $2, $3, $4, $5)`,
          [savingId, userId, starting, 'Already put aside', today],
        );
      }
      return savingId;
    });
    return this.one(userId, id);
  }

  async update(userId: string, id: string, patch: Partial<MoneySavingInput>): Promise<MoneySaving> {
    const current = await this.one(userId, id);
    const name = patch.name !== undefined ? text(patch.name) : current.name;
    if (!name) throw new BadRequestException('Give it a name.');
    await this.db.query(
      `update money_savings
          set name = $3, icon = $4, goal_minor = $5, target_date = $6, kept_in = $7
        where id = $1 and user_id = $2`,
      [
        id,
        userId,
        name,
        patch.icon ?? current.icon,
        patch.goalMinor !== undefined ? patch.goalMinor : current.goalMinor,
        patch.targetDate !== undefined ? patch.targetDate : current.targetDate,
        patch.keptIn !== undefined ? text(patch.keptIn) : current.keptIn,
      ],
    );
    return this.one(userId, id);
  }

  /** The saving and its history. The money itself was never here. */
  async remove(userId: string, id: string): Promise<void> {
    const rows = await this.db.query<{ id: string }>(
      'delete from money_savings where id = $1 and user_id = $2 returning id',
      [id, userId],
    );
    if (rows.length === 0) throw new NotFoundException('Saving not found');
  }

  /**
   * Puts money in, or takes it out.
   *
   * More cannot be taken out than is there: a saving that says minus four
   * thousand is a mistake in the typing, not a state of anybody's money. The
   * saving's row is locked while it is checked, so two taps at once cannot
   * both be allowed against the same balance.
   */
  async move(
    userId: string,
    id: string,
    input: { amountMinor: number; note?: string | null; movedOn?: string },
  ): Promise<MoneySaving> {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor === 0) {
      throw new BadRequestException('Say how much.');
    }
    const movedOn = input.movedOn ?? (await this.now()).today;
    await this.db.transaction(async (tx) => {
      const owned = await tx.query<{ id: string }>(
        'select id from money_savings where id = $1 and user_id = $2 for update',
        [id, userId],
      );
      if (owned.rows.length === 0) throw new NotFoundException('Saving not found');
      if (input.amountMinor < 0) {
        const held = await tx.query<{ balance: string }>(
          'select coalesce(sum(amount_minor), 0)::text as balance from money_saving_moves where saving_id = $1',
          [id],
        );
        if (Number(held.rows[0].balance) + input.amountMinor < 0) {
          throw new BadRequestException('That is more than this saving holds.');
        }
      }
      await tx.query(
        `insert into money_saving_moves (saving_id, user_id, amount_minor, note, moved_on)
         values ($1, $2, $3, $4, $5)`,
        [id, userId, input.amountMinor, text(input.note), movedOn],
      );
    });
    return this.one(userId, id);
  }

  /** Takes one line out of the history: a move recorded by mistake. */
  async removeMove(userId: string, id: string, moveId: string): Promise<MoneySaving> {
    await this.db.transaction(async (tx) => {
      const owned = await tx.query<{ id: string }>(
        'select id from money_savings where id = $1 and user_id = $2 for update',
        [id, userId],
      );
      if (owned.rows.length === 0) throw new NotFoundException('Saving not found');
      const move = await tx.query<{ amount_minor: string }>(
        'select amount_minor::text from money_saving_moves where id = $1 and saving_id = $2',
        [moveId, id],
      );
      if (move.rows.length === 0) throw new NotFoundException('That move is not in this saving.');
      // Undoing money put in must not leave less than nothing either.
      const held = await tx.query<{ balance: string }>(
        'select coalesce(sum(amount_minor), 0)::text as balance from money_saving_moves where saving_id = $1',
        [id],
      );
      if (Number(held.rows[0].balance) - Number(move.rows[0].amount_minor) < 0) {
        throw new BadRequestException('Money taken out since then depends on it. Remove that first.');
      }
      await tx.query('delete from money_saving_moves where id = $1 and saving_id = $2', [moveId, id]);
    });
    return this.one(userId, id);
  }
}
