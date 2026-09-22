import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { DatabaseService } from '../database/database.service';
import type { FriendsService } from '../friends/friends.service';
import type { MailConfig } from '../mail/mail.config';
import type { MessagesService } from '../messages/messages.service';
import type { NotifyService } from '../notifications/notify.service';
import type { BlocksService } from '../safety/blocks.service';
import { HireService } from './hire.service';

/**
 * Hire enquiries across a block.
 *
 * The database is faked: statements are answered by matching their SQL, and
 * these tests read which ran, where and in what order. They pin the lock-first
 * accept, the per-path 404s and the reads that hide what a block closed; the
 * SQL itself is checked on a real Postgres.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const THEM = '22222222-2222-4222-8222-222222222222';
const ENQUIRY = '55555555-5555-4555-8555-555555555555';

type Row = Record<string, unknown>;
type Answer = (sql: string, params: unknown[]) => Row[] | undefined;

const enquiryRow = (status: string) => ({
  id: ENQUIRY,
  from_user_id: THEM,
  to_user_id: ME,
  role_wanted: null,
  event_date: null,
  budget: null,
  message: 'Are you free on the 14th?',
  status,
  created_at: new Date('2026-09-01T00:00:00Z'),
  responded_at: null,
  person_name: 'Ana Cruz',
  person_email: 'ana@example.com',
  person_avatar_url: null,
  person_handle: null,
});

function harness(
  options: {
    pool?: Answer;
    client?: Answer;
    unavailable?: boolean;
    between?: { id: string; byMe: boolean } | null;
    openDirect?: () => Promise<{ id: string }>;
  } = {},
) {
  const calls: { on: 'pool' | 'client'; sql: string; params: unknown[] }[] = [];

  const poolAnswer = (sql: string, params: unknown[]): Row[] => {
    calls.push({ on: 'pool', sql, params });
    const custom = options.pool?.(sql, params);
    if (custom) return custom;
    if (/select from_user_id, status from hire_enquiries/.test(sql)) {
      return [{ from_user_id: THEM, status: 'new' }];
    }
    if (/select \* from hire_enquiries where id = \$1 and to_user_id = \$2/.test(sql)) {
      return [enquiryRow('new')];
    }
    if (/from hire_enquiries e/.test(sql)) return [enquiryRow('accepted')];
    if (/update hire_enquiries/.test(sql)) return [{ id: ENQUIRY }];
    if (/select email, display_name from users/.test(sql)) {
      return [{ email: 'mika@example.com', display_name: 'Mika' }];
    }
    return [];
  };

  const query = jest.fn(async (sql: string, params: unknown[] = []) => poolAnswer(sql, params));
  const queryOne = jest.fn(
    async (sql: string, params: unknown[] = []) => poolAnswer(sql, params)[0] ?? null,
  );
  const client = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ on: 'client', sql, params });
      const custom = options.client?.(sql, params);
      if (custom) return { rows: custom };
      if (/update hire_enquiries/.test(sql)) return { rows: [{ id: ENQUIRY }] };
      return { rows: [] };
    }),
  };
  const transaction = jest.fn(async (fn: (c: typeof client) => Promise<unknown>) => fn(client));
  const db = { query, queryOne, transaction } as unknown as DatabaseService;

  const friends = { connect: jest.fn(async () => undefined) };
  const messages = {
    openDirect: jest.fn(options.openDirect ?? (async () => ({ id: 'convo-1' }))),
  };
  const notifier = { notify: jest.fn(async () => undefined) };
  const blocks = {
    unavailable: jest.fn(async () => options.unavailable ?? false),
    between: jest.fn(async () => options.between ?? null),
  };

  const service = new HireService(
    db,
    friends as unknown as FriendsService,
    messages as unknown as MessagesService,
    notifier as unknown as NotifyService,
    { appUrl: 'https://web.example' } as unknown as MailConfig,
    blocks as unknown as BlocksService,
  );

  const clientSql = () => calls.filter((c) => c.on === 'client');
  const ran = (pattern: RegExp) => calls.filter((c) => pattern.test(c.sql));
  return { service, calls, clientSql, ran, client, friends, messages, notifier, blocks, transaction };
}

describe('HireService.send', () => {
  it('finds no profile across a block or behind a suspension', async () => {
    const h = harness();

    await expect(
      h.service.send(ME, { handle: 'ana', message: 'Are you free?' }),
    ).rejects.toThrow(new NotFoundException('Profile not found'));

    const [target] = h.ran(/select u\.id, u\.roles from users u/);
    expect(target.params).toEqual(['ana', ME]);
    expect(target.sql).toMatch(/u\.suspended_at is null/);
    expect(target.sql).toMatch(/user_blocks/);
    expect(target.sql).toMatch(/ub\.blocker_id = \$2 and ub\.blocked_id = u\.id/);
    expect(h.ran(/insert into hire_enquiries/)).toHaveLength(0);
  });
});

describe('HireService.accept', () => {
  it('takes the pair lock before anything else, then checks the pair on that client', async () => {
    const h = harness();

    await h.service.accept(ME, ENQUIRY);

    const [first] = h.clientSql();
    expect(first.sql).toMatch(/pg_advisory_xact_lock/);
    expect(first.params).toEqual([ME, THEM]);
    expect(h.blocks.unavailable).toHaveBeenCalledWith(ME, THEM, h.client);
    expect(h.friends.connect).toHaveBeenCalledWith(ME, THEM, h.client);
  });

  it('rejects inside the transaction, after the lock, with no update', async () => {
    const h = harness({ unavailable: true });

    await expect(h.service.accept(ME, ENQUIRY)).rejects.toThrow(
      new NotFoundException('Enquiry not found'),
    );

    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.clientSql()[0].sql).toMatch(/pg_advisory_xact_lock/);
    expect(h.ran(/update hire_enquiries/)).toHaveLength(0);
    expect(h.friends.connect).not.toHaveBeenCalled();
    expect(h.notifier.notify).not.toHaveBeenCalled();
  });

  it('only moves an enquiry still at new, and says what it is otherwise', async () => {
    const h = harness({
      client: (sql) => {
        if (/update hire_enquiries/.test(sql)) return [];
        if (/select status from hire_enquiries/.test(sql)) return [{ status: 'declined' }];
        return undefined;
      },
    });

    await expect(h.service.accept(ME, ENQUIRY)).rejects.toThrow(
      new BadRequestException('That enquiry is already declined'),
    );

    const [update] = h.ran(/update hire_enquiries/);
    expect(update.sql).toMatch(/status = 'new'/);
    expect(update.sql).toMatch(/returning id/);
    expect(h.friends.connect).not.toHaveBeenCalled();
  });

  it('answers not-found for an enquiry that is not theirs, before any transaction', async () => {
    const h = harness({
      pool: (sql) => (/select from_user_id, status from hire_enquiries/.test(sql) ? [] : undefined),
    });

    await expect(h.service.accept(ME, ENQUIRY)).rejects.toThrow(
      new NotFoundException('Enquiry not found'),
    );
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it('keeps the acceptance but tells nobody when a block lands after the commit', async () => {
    const h = harness({
      openDirect: async () => {
        throw new ForbiddenException('You can only chat with people you are connected with');
      },
    });

    const result = await h.service.accept(ME, ENQUIRY);

    expect(result.conversationId).toBeNull();
    expect(h.notifier.notify).not.toHaveBeenCalled();
  });

  it('notifies with the conversation when nothing got in the way', async () => {
    const h = harness();

    const result = await h.service.accept(ME, ENQUIRY);

    expect(result.conversationId).toBe('convo-1');
    expect(h.notifier.notify).toHaveBeenCalledTimes(1);
  });
});

describe('HireService.decline', () => {
  it('finds no enquiry across a block, and writes nothing', async () => {
    const h = harness({ between: { id: 'block-1', byMe: false } });

    await expect(h.service.decline(ME, ENQUIRY)).rejects.toThrow(
      new NotFoundException('Enquiry not found'),
    );
    expect(h.blocks.between).toHaveBeenCalledWith(ME, THEM);
    expect(h.ran(/update hire_enquiries/)).toHaveLength(0);
  });

  it('only declines an enquiry still at new', async () => {
    const h = harness({
      pool: (sql) => {
        if (/update hire_enquiries/.test(sql)) return [];
        if (/select status from hire_enquiries/.test(sql)) return [{ status: 'accepted' }];
        return undefined;
      },
    });

    await expect(h.service.decline(ME, ENQUIRY)).rejects.toThrow(
      new BadRequestException('That enquiry is already accepted'),
    );
    const [update] = h.ran(/update hire_enquiries/);
    expect(update.sql).toMatch(/where id = \$1 and status = 'new'/);
  });
});

describe('HireService reads', () => {
  it('hides open and declined enquiries across a block or from a suspended account', async () => {
    const h = harness({ pool: (sql) => (/from hire_enquiries e/.test(sql) ? [] : undefined) });

    await h.service.list(ME);

    const [list] = h.ran(/from hire_enquiries e/);
    expect(list.sql).toMatch(/e\.status = 'accepted'/);
    expect(list.sql).toMatch(/user_blocks/);
    expect(list.sql).toMatch(/ub\.blocker_id = e\.from_user_id and ub\.blocked_id = e\.to_user_id/);
    expect(list.sql).toMatch(/other\.suspended_at is null/);
  });

  it('only ever hands out a published handle', async () => {
    const h = harness();

    await h.service.list(ME);
    await h.service.decline(ME, ENQUIRY);

    const selects = h.ran(/as person_handle/);
    expect(selects.length).toBeGreaterThanOrEqual(2);
    for (const select of selects) {
      expect(select.sql).toMatch(
        /case when other\.public_profile then other\.handle end as person_handle/,
      );
    }
  });
});
