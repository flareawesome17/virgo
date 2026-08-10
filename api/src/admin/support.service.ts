import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { NotifyService } from '../notifications/notify.service';

/**
 * Customer support, both sides of it.
 *
 * The customer's half runs through the app under their own session; the
 * console's half runs through AdminGuard. Both land in the same two tables so
 * the thread reads in order and neither side has a private copy of the truth.
 */
@Injectable()
export class SupportService {
  constructor(
    private readonly db: DatabaseService,
    private readonly notifier: NotifyService,
  ) {}

  // ----------------------------------------------------------- the customer

  /** Opens a ticket. The account is already authenticated, so no email needed. */
  async open(userId: string, subject: string, body: string) {
    const user = await this.db.queryOne<{ email: string; display_name: string | null }>(
      'select email, display_name from users where id = $1',
      [userId],
    );
    if (!user) throw new NotFoundException('No such account');

    return this.db.transaction(async (tx) => {
      const ticket = await tx.query<{ id: string }>(
        `insert into support_tickets (user_id, user_email, subject)
         values ($1, $2, $3) returning id`,
        [userId, user.email, subject.trim().slice(0, 200)],
      );
      const id = ticket.rows[0].id;
      await tx.query(
        `insert into support_messages (ticket_id, author_type, author_id, author_name, body)
         values ($1, 'user', $2, $3, $4)`,
        [id, userId, user.display_name?.trim() || user.email, body.trim()],
      );
      return { id, subject, status: 'open' };
    });
  }

  /** The caller's own tickets. Scoped by user_id — never by a supplied id. */
  async mine(userId: string) {
    return this.db.query(
      `select t.id, t.subject, t.status, t.priority, t.created_at, t.updated_at,
              (select count(*) from support_messages m
                where m.ticket_id = t.id and m.internal = false)::int as messages
         from support_tickets t
        where t.user_id = $1
        order by t.updated_at desc limit 50`,
      [userId],
    );
  }

  /**
   * One thread, as the customer sees it.
   *
   * Internal notes are filtered out in SQL rather than after fetching: a note
   * written for colleagues must not reach the customer's client at all, and
   * filtering in the presenter is one refactor away from leaking it.
   */
  async threadForUser(userId: string, ticketId: string) {
    const ticket = await this.db.queryOne(
      `select id, subject, status, priority, created_at, updated_at
         from support_tickets where id = $1 and user_id = $2`,
      [ticketId, userId],
    );
    if (!ticket) throw new NotFoundException('No such ticket');

    const messages = await this.db.query(
      `select id, author_type, author_name, body, created_at
         from support_messages
        where ticket_id = $1 and internal = false
        order by created_at`,
      [ticketId],
    );
    return { ticket, messages };
  }

  async replyAsUser(userId: string, ticketId: string, body: string) {
    const user = await this.db.queryOne<{ email: string; display_name: string | null }>(
      `select u.email, u.display_name from users u
         join support_tickets t on t.user_id = u.id
        where u.id = $1 and t.id = $2`,
      [userId, ticketId],
    );
    if (!user) throw new NotFoundException('No such ticket');

    await this.db.query(
      `insert into support_messages (ticket_id, author_type, author_id, author_name, body)
       values ($1, 'user', $2, $3, $4)`,
      [ticketId, userId, user.display_name?.trim() || user.email, body.trim()],
    );
    // Back to open: a customer replying to something marked resolved is
    // telling you it was not.
    await this.db.query(
      `update support_tickets
          set updated_at = now(),
              status = case when status in ('resolved','closed') then 'open' else status end
        where id = $1`,
      [ticketId],
    );
    return { ok: true };
  }

  // ------------------------------------------------------------- the console

  async list(params: { status?: string; q?: string; limit?: number; offset?: number }) {
    const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
    const offset = Math.max(params.offset ?? 0, 0);
    const status = params.status?.trim() || null;
    const q = params.q?.trim() ? `%${params.q.trim()}%` : null;

    const rows = await this.db.query(
      `select t.id, t.subject, t.status, t.priority, t.user_email, t.user_id,
              t.created_at, t.updated_at, t.first_replied_at, t.resolved_at,
              a.name as assigned_name,
              (select count(*) from support_messages m where m.ticket_id = t.id)::int as messages,
              (select m.created_at from support_messages m
                where m.ticket_id = t.id order by m.created_at desc limit 1) as last_message_at
         from support_tickets t
         left join admin_users a on a.id = t.assigned_to
        where ($3::text is null or t.status = $3)
          and ($4::text is null or t.subject ilike $4 or t.user_email ilike $4)
        order by
          -- Urgent first, then oldest-updated, so nothing rots at the bottom.
          case t.priority when 'urgent' then 0 when 'high' then 1
                          when 'normal' then 2 else 3 end,
          t.updated_at desc
        limit $1 offset $2`,
      [limit, offset, status, q],
    );

    const total = await this.db.queryOne<{ count: string }>(
      `select count(*)::text as count from support_tickets t
        where ($1::text is null or t.status = $1)
          and ($2::text is null or t.subject ilike $2 or t.user_email ilike $2)`,
      [status, q],
    );

    const counts = await this.db.query(
      `select status, count(*)::int as count from support_tickets group by 1`,
    );

    return { data: rows, total: Number(total?.count ?? 0), counts };
  }

  /** The full thread, internal notes included. Console only. */
  async thread(ticketId: string) {
    const ticket = await this.db.queryOne(
      `select t.*, a.name as assigned_name, u.display_name as user_name, u.plan as user_plan
         from support_tickets t
         left join admin_users a on a.id = t.assigned_to
         left join users u on u.id = t.user_id
        where t.id = $1`,
      [ticketId],
    );
    if (!ticket) throw new NotFoundException('No such ticket');

    const messages = await this.db.query(
      `select id, author_type, author_name, body, internal, created_at
         from support_messages where ticket_id = $1 order by created_at`,
      [ticketId],
    );
    return { ticket, messages };
  }

  async reply(
    ticketId: string,
    admin: { id: string; name: string },
    body: string,
    internal: boolean,
  ) {
    const ticket = await this.db.queryOne<{ user_id: string | null; subject: string }>(
      'select user_id, subject from support_tickets where id = $1',
      [ticketId],
    );
    if (!ticket) throw new NotFoundException('No such ticket');

    await this.db.query(
      `insert into support_messages
         (ticket_id, author_type, author_id, author_name, body, internal)
       values ($1, 'admin', $2, $3, $4, $5)`,
      [ticketId, admin.id, admin.name, body.trim(), internal],
    );

    await this.db.query(
      `update support_tickets
          set updated_at = now(),
              -- Only a real reply counts as a first response; an internal
              -- note is a conversation with yourself.
              first_replied_at = case
                when $2 then first_replied_at
                else coalesce(first_replied_at, now()) end,
              status = case when $2 then status
                            when status = 'open' then 'pending' else status end
        where id = $1`,
      [ticketId, internal],
    );

    // The customer hears about a reply, never about an internal note.
    if (!internal && ticket.user_id) {
      await this.notifier.notify([ticket.user_id], {
        topic: 'support',
        title: 'Support replied',
        body: ticket.subject,
        data: { type: 'support_reply', ticketId },
      });
    }

    return { ok: true };
  }

  async update(
    ticketId: string,
    patch: { status?: string; priority?: string; assignedTo?: string | null },
  ) {
    const row = await this.db.queryOne(
      `update support_tickets
          set status      = coalesce($2, status),
              priority    = coalesce($3, priority),
              assigned_to = case when $5 then $4::uuid else assigned_to end,
              resolved_at = case when $2 in ('resolved','closed') then coalesce(resolved_at, now())
                                 when $2 is not null then null
                                 else resolved_at end,
              updated_at  = now()
        where id = $1
        returning id, status, priority, assigned_to`,
      [
        ticketId,
        patch.status ?? null,
        patch.priority ?? null,
        patch.assignedTo ?? null,
        patch.assignedTo !== undefined,
      ],
    );
    if (!row) throw new NotFoundException('No such ticket');
    return row;
  }
}
