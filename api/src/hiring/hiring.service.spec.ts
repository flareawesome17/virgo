import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { BookingsService } from '../bookings/bookings.service';
import type { DatabaseService } from '../database/database.service';
import type { FriendsService } from '../friends/friends.service';
import type { MailConfig } from '../mail/mail.config';
import type { MailService } from '../mail/mail.service';
import type { MessagesService } from '../messages/messages.service';
import type { NotifyService } from '../notifications/notify.service';
import type { RealtimeGateway } from '../realtime/realtime.gateway';
import type { BlocksService } from '../safety/blocks.service';
import { HiringService } from './hiring.service';

/**
 * The job board and applications across a block.
 *
 * The database is faked: statements are answered by matching their SQL, and
 * these tests read which ran, where and in what order. They pin the rules —
 * the board and its total filtered alike, the lock-first answer, the ordered
 * locking that keeps a post's closing from deadlocking a block — and leave
 * the SQL itself to the checks on a real Postgres.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const THEM = '22222222-2222-4222-8222-222222222222';
const APPLICATION = '66666666-6666-4666-8666-666666666666';
const POST = '77777777-7777-4777-8777-777777777777';

type Row = Record<string, unknown>;
type Answer = (sql: string, params: unknown[]) => Row[] | undefined;
type Status = 'shortlisted' | 'declined' | 'accepted';

const applicationRow = {
  id: APPLICATION,
  post_id: POST,
  user_id: THEM,
  role: 'Photographer',
  message: null,
  status: 'new',
  created_at: new Date('2026-09-01T00:00:00Z'),
  responded_at: null,
  post_title: 'Wedding in Cebu',
  post_slug: 'wedding-in-cebu',
  post_owner_id: ME,
  person_name: 'Ana Cruz',
  person_email: 'ana@example.com',
  person_avatar_url: null,
  person_handle: null,
  post_status: 'open',
  conversation_id: null,
  person_roles: ['Photographer'],
};

const postRow = {
  id: POST,
  user_id: ME,
  slug: 'wedding-in-cebu',
  title: 'Wedding in Cebu',
  description: 'A day of it.',
  roles_wanted: ['Photographer'],
  role_budgets: {},
  filled_roles: [],
  event_date: null,
  location: null,
  budget_min: null,
  budget_max: null,
  status: 'open',
  created_at: new Date('2026-09-01T00:00:00Z'),
  expires_at: new Date(Date.now() + 86_400_000),
  poster_name: 'Mika',
  poster_email: 'mika@example.com',
  poster_avatar_url: null,
  poster_handle: null,
  applicant_count: '1',
  new_applicant_count: '1',
  my_applications: [],
};

function harness(
  options: {
    pool?: Answer;
    client?: Answer;
    unavailable?: boolean;
    openDirect?: () => Promise<{ id: string }>;
  } = {},
) {
  const calls: { on: 'pool' | 'client'; sql: string; params: unknown[] }[] = [];

  const poolAnswer = (sql: string, params: unknown[]): Row[] => {
    calls.push({ on: 'pool', sql, params });
    const custom = options.pool?.(sql, params);
    if (custom) return custom;
    if (/from hiring_applications a\s+join hiring_posts p on p\.id = a\.post_id\s+join users u on u\.id = a\.user_id\s+where a\.id = \$1/.test(sql)) {
      return [applicationRow];
    }
    if (/select email, display_name from users/.test(sql)) {
      return [{ email: 'mika@example.com', display_name: 'Mika' }];
    }
    if (/as open,/.test(sql)) return [{ open: '0', waiting: '0' }];
    if (/select expires_at, title, status, roles_wanted, role_budgets/.test(sql)) {
      return [
        {
          expires_at: new Date(Date.now() + 86_400_000),
          title: 'Wedding in Cebu',
          status: 'open',
          roles_wanted: ['Photographer'],
          role_budgets: {},
        },
      ];
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
      if (/update hiring_applications/.test(sql)) return { rows: [{ id: APPLICATION }] };
      if (/update hiring_posts set status/.test(sql)) return { rows: [{ slug: 'wedding-in-cebu' }] };
      if (/from hiring_posts where id = \$1/.test(sql)) {
        return {
          rows: [
            {
              roles_wanted: ['Photographer'],
              role_budgets: {},
              event_date: null,
              location: null,
              budget_max: null,
            },
          ],
        };
      }
      return { rows: [] };
    }),
  };
  const transaction = jest.fn(async (fn: (c: typeof client) => Promise<unknown>) => fn(client));
  const db = { query, queryOne, transaction } as unknown as DatabaseService;

  const friends = { connect: jest.fn(async () => undefined) };
  const messages = {
    openDirect: jest.fn(options.openDirect ?? (async () => ({ id: 'convo-1' }))),
    system: jest.fn(async () => ({})),
  };
  const notifier = { notify: jest.fn(async () => undefined) };
  const bookings = { createForAcceptance: jest.fn(async () => 'booking-1') };
  const blocks = { unavailable: jest.fn(async () => options.unavailable ?? false) };

  const service = new HiringService(
    db,
    friends as unknown as FriendsService,
    messages as unknown as MessagesService,
    notifier as unknown as NotifyService,
    {} as unknown as MailService,
    { appUrl: 'https://web.example', siteUrl: 'https://virgo.example' } as unknown as MailConfig,
    { broadcast: jest.fn() } as unknown as RealtimeGateway,
    bookings as unknown as BookingsService,
    blocks as unknown as BlocksService,
  );

  const clientSql = () => calls.filter((c) => c.on === 'client');
  const ran = (pattern: RegExp) => calls.filter((c) => pattern.test(c.sql));
  return {
    service,
    calls,
    clientSql,
    ran,
    client,
    friends,
    messages,
    notifier,
    bookings,
    blocks,
    transaction,
  };
}

describe('HiringService board', () => {
  it('filters the page and its total alike, each with the viewer at its own position', async () => {
    const h = harness({
      pool: (sql) => {
        if (/case when shares_location/.test(sql)) return [{ lat: null, lon: null }];
        if (/count\(\*\)::text as total/.test(sql)) return [{ total: '0' }];
        return undefined;
      },
    });

    await h.service.list(ME, {});

    const [page] = h.ran(/as distance_km/);
    const [total] = h.ran(/count\(\*\)::text as total/);
    expect(page.sql).toMatch(/ub\.blocker_id = \$5::uuid and ub\.blocked_id = p\.user_id/);
    expect(page.sql).toMatch(/u\.suspended_at is null/);
    expect(page.params[4]).toBe(ME);
    expect(total.sql).toMatch(/ub\.blocker_id = \$3::uuid and ub\.blocked_id = p\.user_id/);
    expect(total.sql).toMatch(/u\.suspended_at is null/);
    expect(total.params).toHaveLength(3);
    expect(total.params[2]).toBe(ME);
  });

  it('shows a post across a block only to its owner and to someone accepted on it', async () => {
    const h = harness();

    await expect(h.service.bySlug(ME, 'wedding-in-cebu')).rejects.toThrow(
      new NotFoundException('That job post is no longer available'),
    );

    const [select] = h.ran(/where p\.slug = \$1/);
    expect(select.params).toEqual(['wedding-in-cebu', ME]);
    expect(select.sql).toMatch(/u\.suspended_at is null and not exists \(select 1 from user_blocks/);
    expect(select.sql).toMatch(
      /exists \(select 1 from hiring_applications ha\s+where ha\.post_id = p\.id\s+and ha\.user_id = \$2\s+and ha\.status = 'accepted'\)/,
    );
  });

  it('leaves blocked and suspended posters and applicants out of the badge', async () => {
    const h = harness({
      pool: (sql) =>
        /as applications/.test(sql) ? [{ count: '0', applications: '0' }] : undefined,
    });

    await h.service.unseenCount(ME);

    const [badge] = h.ran(/as applications/);
    const [posts, applications] = badge.sql.split('::text as count');
    expect(posts).toMatch(/ub\.blocked_id = p\.user_id/);
    expect(posts).toMatch(/pu\.suspended_at is null/);
    expect(applications).toMatch(/ub\.blocked_id = a\.user_id/);
    expect(applications).toMatch(/su\.id = a\.user_id and su\.suspended_at is not null/);
  });

  it('refuses to take an application across a block, with the missing-post answer', async () => {
    const h = harness();

    await expect(h.service.apply(ME, 'wedding-in-cebu')).rejects.toThrow(
      new NotFoundException('That job post is no longer available'),
    );

    const [lookup] = h.ran(/from hiring_posts\s+where slug = \$1/);
    expect(lookup.params).toEqual(['wedding-in-cebu', ME]);
    expect(lookup.sql).toMatch(/user_blocks/);
    expect(lookup.sql).toMatch(/pu\.suspended_at is null/);
  });
});

describe('HiringService applicant counts', () => {
  const countOf = (sql: string, column: string) => {
    const end = sql.indexOf(`as ${column}`);
    return sql.slice(sql.lastIndexOf('(select count(*)::text from hiring_applications a', end), end);
  };

  it('counts what the poster’s list shows: the hired, and otherwise nobody blocked or suspended', async () => {
    const h = harness({ pool: (sql) => (/where p\.user_id = \$1/.test(sql) ? [postRow] : undefined) });

    await h.service.mine(ME);

    const [select] = h.ran(/as applicant_count/);
    const count = countOf(select.sql, 'applicant_count');
    expect(count).toMatch(/a\.status = 'accepted'\s+or \(not exists \(select 1 from user_blocks ub/);
    // From the poster's side, whoever is looking at the post.
    expect(count).toMatch(/ub\.blocker_id = p\.user_id and ub\.blocked_id = a\.user_id/);
    expect(count).toMatch(/ub\.blocker_id = a\.user_id and ub\.blocked_id = p\.user_id/);
    expect(count).toMatch(/su\.id = a\.user_id and su\.suspended_at is not null/);
  });

  it('keeps the new-applicant badge to the same people', async () => {
    const h = harness({ pool: (sql) => (/where p\.user_id = \$1/.test(sql) ? [postRow] : undefined) });

    await h.service.mine(ME);

    const [select] = h.ran(/as new_applicant_count/);
    const count = countOf(select.sql, 'new_applicant_count');
    expect(count).toMatch(/a\.status = 'new'/);
    expect(count).toMatch(/ub\.blocker_id = p\.user_id and ub\.blocked_id = a\.user_id/);
    expect(count).toMatch(/su\.id = a\.user_id and su\.suspended_at is not null/);
  });
});

describe('HiringService applicant lists', () => {
  it('hides waiting applicants across a block or behind a suspension, never the hired', async () => {
    const h = harness();

    await h.service.applicationsFor(ME, POST);

    const [list] = h.ran(/where a\.post_id = \$1/);
    expect(list.params).toEqual([POST, ME]);
    expect(list.sql).toMatch(
      /\(a\.status = 'accepted'\s+or \(not exists \(select 1 from user_blocks ub where \(ub\.blocker_id = \$2 and ub\.blocked_id = a\.user_id\)/,
    );
    expect(list.sql).toMatch(/and u\.suspended_at is null\)\)/);
  });

  it('does the same from the applicant side, against the poster', async () => {
    const h = harness();

    await h.service.myApplications(ME);

    const [list] = h.ran(/where a\.user_id = \$1/);
    expect(list.sql).toMatch(/a\.status = 'accepted'/);
    expect(list.sql).toMatch(/ub\.blocker_id = \$1 and ub\.blocked_id = p\.user_id/);
    expect(list.sql).toMatch(/su\.id = p\.user_id and su\.suspended_at is not null/);
  });
});

describe('HiringService.respond', () => {
  const statuses: Status[] = ['shortlisted', 'declined', 'accepted'];

  it.each(statuses)('takes the pair lock first when answering %s', async (status) => {
    const h = harness();

    await h.service.respond(ME, APPLICATION, status);

    const [first] = h.clientSql();
    expect(first.sql).toMatch(/pg_advisory_xact_lock/);
    expect(first.params).toEqual([ME, THEM]);
    expect(h.blocks.unavailable).toHaveBeenCalledWith(ME, THEM, h.client);
    const [update] = h.ran(/update hiring_applications set status = \$2/);
    expect(update.on).toBe('client');
    expect(update.sql).toMatch(/status <> 'accepted'/);
  });

  it.each(statuses)(
    'answers %s across a block as if the application were not there, writing nothing',
    async (status) => {
      const h = harness({ unavailable: true });

      await expect(h.service.respond(ME, APPLICATION, status)).rejects.toThrow(
        new NotFoundException('Application not found'),
      );

      expect(h.ran(/update hiring_applications/)).toHaveLength(0);
      expect(h.friends.connect).not.toHaveBeenCalled();
      expect(h.notifier.notify).not.toHaveBeenCalled();
    },
  );

  it('refuses when somebody accepted it since it was read', async () => {
    const h = harness({
      client: (sql) => (/update hiring_applications/.test(sql) ? [] : undefined),
    });

    await expect(h.service.respond(ME, APPLICATION, 'accepted')).rejects.toThrow(
      new BadRequestException('You have already accepted this application'),
    );
    expect(h.friends.connect).not.toHaveBeenCalled();
    expect(h.bookings.createForAcceptance).not.toHaveBeenCalled();
  });

  it('connects them and books on the locked client when accepting', async () => {
    const h = harness();

    const result = await h.service.respond(ME, APPLICATION, 'accepted');

    expect(h.friends.connect).toHaveBeenCalledWith(ME, THEM, h.client);
    expect(h.bookings.createForAcceptance).toHaveBeenCalledWith(h.client, expect.anything());
    expect(h.messages.system).toHaveBeenCalledTimes(1);
    expect(result.conversationId).toBe('convo-1');
  });

  it('keeps the booking but writes no card and tells no applicant when a block lands after', async () => {
    const h = harness({
      openDirect: async () => {
        throw new ForbiddenException('You can only chat with people you are friends with');
      },
    });

    const result = await h.service.respond(ME, APPLICATION, 'accepted');

    expect(result.conversationId).toBeNull();
    expect(h.messages.system).not.toHaveBeenCalled();
    // Only the poster's own "every role is filled" prompt goes out.
    const told = h.notifier.notify.mock.calls.map((call: unknown[]) => call[0]);
    expect(told).toEqual([[ME]]);
  });
});

describe('HiringService.setStatus', () => {
  it('locks the waiting applications in id order before declining them', async () => {
    const h = harness({
      pool: (sql) => (/where p\.slug = \$1/.test(sql) ? [postRow] : undefined),
    });

    await h.service.setStatus(ME, POST, 'filled');

    const [decline] = h.ran(/update hiring_applications/);
    expect(decline.sql).toMatch(
      /where id in \(select id from hiring_applications\s+where post_id = \$1 and status in \('new', 'shortlisted'\)\s+order by id\s+for update\)/,
    );
  });
});
