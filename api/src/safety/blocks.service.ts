import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service';
import { normalizeHandle } from '../profiles/handles';
import { PAIR_LOCK_SQL, UUID_SHAPE } from './block-sql';

/**
 * How a block or report names the person it is about. Exactly one key.
 *
 * Resolved on the server because most of the places a stranger reaches you
 * carry no user id: the public profile withholds it on purpose, and applicant,
 * enquiry and job payloads never had one. Each reference is scoped to what the
 * caller can already see, so none of them hands out an id.
 */
export interface PersonRef {
  handle?: string;
  userId?: string;
  applicationId?: string;
  enquiryId?: string;
  jobPostId?: string;
}

/** A row of the caller's own blocked list. Never their user id or email. */
export interface BlockedPerson {
  /** user_blocks.id — what DELETE /blocks/:id takes. */
  id: string;
  /** 'Virgo member', with no photo or handle, when they had already blocked the caller. */
  name: string;
  avatarUrl: string | null;
  /** Only when the profile was published and active at the time of the block. */
  handle: string | null;
  blockedAt: string;
}

interface BlockRow {
  id: string;
  blocked_name: string;
  blocked_handle: string | null;
  blocked_avatar_url: string | null;
  created_at: Date;
}

const REF_KEYS = [
  'handle',
  'userId',
  'applicationId',
  'enquiryId',
  'jobPostId',
] as const;

/** The blocker's own snapshot of each person, newest first. No users join. */
const BLOCK_SELECT = `select id, blocked_name, blocked_handle, blocked_avatar_url, created_at
   from user_blocks`;

/**
 * One person keeping another away from them.
 *
 * Depends only on the database, which is global, so every module that has to
 * honour a block can inject this without an import cycle.
 */
@Injectable()
export class BlocksService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * The block between these two, in either direction, or null.
   *
   * When both have blocked each other the caller's own block comes first, so
   * `byMe` answers "can I undo this" rather than "who did it first".
   *
   * Runs on `client` when one is given, so a check inside a transaction sees
   * what that transaction sees — and waits behind the pair lock it holds.
   */
  async between(
    a: string,
    b: string,
    client?: PoolClient,
  ): Promise<{ id: string; byMe: boolean } | null> {
    const rows = await this.run<{ id: string; by_me: boolean }>(
      `select id, (blocker_id = $1) as by_me
         from user_blocks
        where (blocker_id = $1 and blocked_id = $2)
           or (blocker_id = $2 and blocked_id = $1)
        order by (blocker_id = $1) desc
        limit 1`,
      [a, b],
      client,
    );
    return rows[0] ? { id: rows[0].id, byMe: rows[0].by_me } : null;
  }

  /**
   * Whether a new tie between these two must be refused: a block in either
   * direction, or either account suspended.
   *
   * The check every accept and request path makes under the pair lock. It is
   * one question on purpose — "is this pair closed" — so each path answers
   * with its own 404 and none can be used to learn which of the reasons it was.
   */
  async unavailable(
    a: string,
    b: string,
    client?: PoolClient,
  ): Promise<boolean> {
    const rows = await this.run<{ closed: boolean }>(
      `select exists (select 1 from user_blocks ub
                       where (ub.blocker_id = $1 and ub.blocked_id = $2)
                          or (ub.blocker_id = $2 and ub.blocked_id = $1))
           or exists (select 1 from users s
                       where s.id in ($1, $2) and s.suspended_at is not null)
           as closed`,
      [a, b],
      client,
    );
    return !!rows[0]?.closed;
  }

  /**
   * Turns a reference into the user id it points at, for the caller.
   *
   * - handle: a published, active profile — the rule the public profile page
   *   applies — except that a block the caller placed does not hide it, so
   *   blocking twice is idempotent and someone already blocked can still be
   *   reported. Being blocked by them does hide it.
   * - userId: any existing account. Ids only reach clients next to that
   *   person's name (search, Nearby, chat, notifications), and a paused
   *   harasser still has to be blockable from a chat.
   * - applicationId: only the post's owner or the applicant, and it resolves to
   *   the other one.
   * - enquiryId: only a party to the enquiry, resolving to the other.
   * - jobPostId: the poster, whom the post already names.
   *
   * Every miss is the same 404, including "not yours".
   */
  async resolvePerson(
    callerId: string,
    ref: PersonRef,
    verb: 'block' | 'report',
  ): Promise<string> {
    const present = REF_KEYS.filter((key) => {
      const value = ref[key];
      return typeof value === 'string' && value.trim().length > 0;
    });
    if (present.length !== 1) {
      throw new BadRequestException('Choose one person');
    }

    const targetId = await this.lookup(callerId, ref, present[0]);
    if (!targetId) throw new NotFoundException('Person not found');

    if (targetId === callerId) {
      throw new BadRequestException(
        verb === 'block' ? 'You cannot block yourself' : 'You cannot report yourself',
      );
    }
    return targetId;
  }

  private async lookup(
    callerId: string,
    ref: PersonRef,
    key: (typeof REF_KEYS)[number],
  ): Promise<string | null> {
    if (key === 'handle') {
      const row = await this.db.queryOne<{ id: string }>(
        `select u.id
           from users u
          where lower(u.handle) = $1
            and u.public_profile = true
            and (u.disabled_until is null or u.disabled_until <= now())
            and u.suspended_at is null
            and not exists (select 1 from user_blocks ub
                             where ub.blocker_id = u.id and ub.blocked_id = $2)`,
        [normalizeHandle(ref.handle ?? ''), callerId],
      );
      return row?.id ?? null;
    }

    // The DTO already insists on a uuid; this keeps a direct caller from
    // turning a typo into a 500.
    const id = (ref[key] ?? '').trim();
    if (!UUID_SHAPE.test(id)) return null;

    switch (key) {
      case 'userId': {
        const row = await this.db.queryOne<{ id: string }>(
          'select id from users where id = $1',
          [id],
        );
        return row?.id ?? null;
      }
      case 'applicationId': {
        const row = await this.db.queryOne<{
          applicant_id: string;
          owner_id: string;
        }>(
          `select a.user_id as applicant_id, p.user_id as owner_id
             from hiring_applications a
             join hiring_posts p on p.id = a.post_id
            where a.id = $1`,
          [id],
        );
        if (!row) return null;
        if (row.owner_id === callerId) return row.applicant_id;
        if (row.applicant_id === callerId) return row.owner_id;
        return null;
      }
      case 'enquiryId': {
        const row = await this.db.queryOne<{ other_id: string }>(
          `select case when from_user_id = $2 then to_user_id else from_user_id end as other_id
             from hire_enquiries
            where id = $1 and (from_user_id = $2 or to_user_id = $2)`,
          [id, callerId],
        );
        return row?.other_id ?? null;
      }
      case 'jobPostId': {
        const row = await this.db.queryOne<{ user_id: string }>(
          'select user_id from hiring_posts where id = $1',
          [id],
        );
        return row?.user_id ?? null;
      }
    }
    return null;
  }

  /**
   * Blocks someone, and closes everything between the two that was still
   * waiting for an answer.
   *
   * One transaction, pair lock first (see PAIR_LOCK_SQL), then a fixed order:
   * the block itself, the friendship, enquiries, applications, workspace and
   * event invitations, and last the blocker's notifications about any of it —
   * last so its subqueries see the declines above. Accepted work, bookings and
   * chat history are left alone.
   *
   * Nobody is told: no notification, no socket frame. Blocking twice is
   * idempotent and returns the first block, snapshot included. Unblocking
   * restores none of this.
   */
  async block(blockerId: string, ref: PersonRef): Promise<BlockedPerson> {
    const blockedId = await this.resolvePerson(blockerId, ref, 'block');
    const pair = [blockerId, blockedId];

    const row = await this.db.transaction(async (c) => {
      await c.query(PAIR_LOCK_SQL, pair);

      // The snapshot is what the blocker could see of them, and no more. A
      // handle only when the handle path above would find it: published, not
      // paused, not suspended. Someone who has already blocked the caller is
      // stored as a neutral name with no photo and no handle — their profile
      // and the handle path both 404 across that block, and a copy of the live
      // account would make blocking, unblocking and blocking again a way to
      // follow them after they changed their name, photo or handle to get
      // away. Resolving is not narrowed the same way, so a mutual block still
      // works. Read under the pair lock, so a block from their side cannot
      // land between this check and the insert.
      //
      // $1 is cast because a bare parameter in an INSERT ... SELECT list is
      // typed from the select, as text, before it meets the uuid column.
      await c.query(
        `insert into user_blocks
           (blocker_id, blocked_id, blocked_name, blocked_handle, blocked_avatar_url)
         select $1::uuid, u.id,
                case when t.blocked_me then 'Virgo member'
                     else coalesce(nullif(btrim(u.display_name), ''), split_part(u.email, '@', 1))
                end,
                case when not t.blocked_me
                      and u.public_profile
                      and (u.disabled_until is null or u.disabled_until <= now())
                      and u.suspended_at is null
                     then u.handle
                end,
                case when not t.blocked_me then u.avatar_url end
           from users u
          cross join lateral (
                select exists (select 1 from user_blocks x
                                where x.blocker_id = u.id
                                  and x.blocked_id = $1::uuid) as blocked_me
               ) t
          where u.id = $2
         on conflict (blocker_id, blocked_id) do nothing`,
        pair,
      );

      // The friendship goes, which closes every path gated on it: direct
      // messages, groups, workspace and event invites. A decline record is
      // kept, so blocking and unblocking cannot be used to skip the cooldown.
      await c.query(
        `delete from friends
          where ((user_id = $1 and friend_user_id = $2)
              or (user_id = $2 and friend_user_id = $1))
            and not (status = 'declined' and requested_by = 'them')`,
        pair,
      );

      await c.query(
        `update hire_enquiries
            set status = 'declined', responded_at = now()
          where status = 'new'
            and ((from_user_id = $1 and to_user_id = $2)
              or (from_user_id = $2 and to_user_id = $1))`,
        pair,
      );

      // Locked in id order, the same order HiringService.setStatus uses when it
      // closes a post, so the two can never wait on each other in a cycle.
      await c.query(
        `with doomed as (
           select a.id
             from hiring_applications a
             join hiring_posts p on p.id = a.post_id
            where a.status in ('new', 'shortlisted')
              and ((p.user_id = $1 and a.user_id = $2)
                or (p.user_id = $2 and a.user_id = $1))
            order by a.id
              for update of a
         )
         update hiring_applications a
            set status = 'declined', responded_at = now()
           from doomed d
          where a.id = d.id`,
        pair,
      );

      await c.query(
        `update collaborators
            set status = 'declined', responded_at = now()
          where status = 'pending'
            and ((user_id = $1 and collaborator_user_id = $2)
              or (user_id = $2 and collaborator_user_id = $1))`,
        pair,
      );

      // Upcoming events only. A pending invitation to a past event is never
      // shown, and leaving those alone keeps this off the rows
      // EventCleanupService is purging.
      await c.query(
        `update event_attendees a
            set status = 'declined', responded_at = now()
           from schedule_events e
          where e.id = a.event_id
            and a.status = 'pending'
            and e.event_date >= current_date
            and ((e.user_id = $1 and a.user_id = $2)
              or (e.user_id = $2 and a.user_id = $1))`,
        pair,
      );

      // The blocker's own notifications about the person or about anything
      // just closed. Only friend and hire payloads carry fromUserId; the rest
      // are matched through what they point at. $3 is the blocked id again,
      // compared only as text, so $1 and $2 keep inferring uuid. The blocked
      // person's notifications are theirs and are not touched.
      await c.query(
        `delete from notifications n
          where n.user_id = $1
            and (n.data->>'fromUserId' = $3
              or n.data->>'applicationId' in (
                   select a.id::text
                     from hiring_applications a
                     join hiring_posts p on p.id = a.post_id
                    where a.status <> 'accepted'
                      and ((p.user_id = $1 and a.user_id = $2)
                        or (p.user_id = $2 and a.user_id = $1)))
              or n.data->>'collaboratorId' in (
                   select c.id
                     from collaborators c
                    where c.status <> 'accepted'
                      and ((c.user_id = $1 and c.collaborator_user_id = $2)
                        or (c.user_id = $2 and c.collaborator_user_id = $1)))
              or (n.data->>'type' = 'event_invite'
                  and n.data->>'eventId' in (
                        select a.event_id
                          from event_attendees a
                          join schedule_events e on e.id = a.event_id
                         where a.user_id = $1
                           and e.user_id = $2
                           and a.status <> 'accepted')))`,
        [blockerId, blockedId, blockedId],
      );

      const { rows } = await c.query<BlockRow>(
        `${BLOCK_SELECT} where blocker_id = $1 and blocked_id = $2`,
        pair,
      );
      return rows[0] ?? null;
    });

    // Only when the account went between resolving it and the insert.
    if (!row) throw new NotFoundException('Person not found');
    return this.present(row);
  }

  /** The caller's blocked list, newest first. */
  async list(blockerId: string): Promise<BlockedPerson[]> {
    const rows = await this.db.query<BlockRow>(
      `${BLOCK_SELECT} where blocker_id = $1 order by created_at desc limit 200`,
      [blockerId],
    );
    return rows.map((row) => this.present(row));
  }

  /**
   * Lifts one of the caller's own blocks. Nothing the block closed comes back:
   * not the friendship, not the declined enquiries or applications.
   */
  async unblock(blockerId: string, id: string): Promise<void> {
    if (!UUID_SHAPE.test(id)) throw new NotFoundException('Block not found');
    const rows = await this.db.query<{ id: string }>(
      'delete from user_blocks where id = $1 and blocker_id = $2 returning id',
      [id, blockerId],
    );
    if (rows.length === 0) throw new NotFoundException('Block not found');
  }

  /** Exactly five keys. The blocked person's id and email never leave here. */
  private present(row: BlockRow): BlockedPerson {
    return {
      id: row.id,
      name: row.blocked_name,
      avatarUrl: row.blocked_avatar_url,
      handle: row.blocked_handle,
      blockedAt: new Date(row.created_at).toISOString(),
    };
  }

  private async run<T extends QueryResultRow>(
    sql: string,
    params: unknown[],
    client?: PoolClient,
  ): Promise<T[]> {
    if (client) return (await client.query<T>(sql, params)).rows;
    return this.db.query<T>(sql, params);
  }
}
