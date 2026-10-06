import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MailConfig } from '../mail/mail.config';
import { supportReply } from '../mail/mail.templates';
import { NotifyService } from '../notifications/notify.service';
import { permissionsFor } from './rbac';

/**
 * How soon a first reply is owed, by priority. Wall-clock hours: the team
 * answers on weekends too, and a target that pauses would hide the very
 * tickets that waited longest.
 */
export const SUPPORT_TARGET_HOURS: Record<string, number> = {
  urgent: 1,
  high: 4,
  normal: 24,
  low: 72,
};

export const SUPPORT_CATEGORIES = [
  'account',
  'billing',
  'uploads',
  'sharing',
  'bookings',
  'bug',
  'feedback',
  'other',
] as const;

/** `due_at` for a ticket opened at `from` with this priority, as SQL. */
function dueSql(priority: string, from: string): string {
  const arms = Object.entries(SUPPORT_TARGET_HOURS)
    .map(([p, h]) => `when '${p}' then interval '${h} hours'`)
    .join(' ');
  return `${from} + (case ${priority} ${arms} else interval '24 hours' end)`;
}

export interface TicketQuery {
  /** mine, unassigned, overdue, or all (the default). */
  queue?: string;
  status?: string;
  q?: string;
  category?: string;
  limit?: number;
  offset?: number;
}

/**
 * Customer support, both sides of it.
 *
 * The customer's half runs through the app under their own session; the
 * console's half runs through AdminGuard. Both land in the same two tables so
 * the thread reads in order and neither side has a private copy of the truth.
 *
 * The desk around it: every ticket owes a first reply by a time set from its
 * priority; a new ticket can be handed to whoever has the fewest open; and
 * staff hear about new tickets, tickets handed to them and customers writing
 * back through the console's bell.
 */
@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly notifier: NotifyService,
    private readonly mailConfig: MailConfig,
  ) {}

  // ----------------------------------------------------------- the customer

  /** Opens a ticket. The account is already authenticated, so no email needed. */
  async open(userId: string, subject: string, body: string) {
    const user = await this.db.queryOne<{ email: string; display_name: string | null }>(
      'select email, display_name from users where id = $1',
      [userId],
    );
    if (!user) throw new NotFoundException('No such account');
    const assignee = (await this.autoAssignOn()) ? await this.lightestAgent() : null;

    const id = await this.db.transaction(async (tx) => {
      const ticket = await tx.query<{ id: string }>(
        `insert into support_tickets (user_id, user_email, subject, assigned_to, due_at)
         values ($1, $2, $3, $4, ${dueSql("'normal'", 'now()')}) returning id`,
        [userId, user.email, subject.trim().slice(0, 200), assignee?.id ?? null],
      );
      const ticketId = ticket.rows[0].id;
      await tx.query(
        `insert into support_messages (ticket_id, author_type, author_id, author_name, body)
         values ($1, 'user', $2, $3, $4)`,
        [ticketId, userId, user.display_name?.trim() || user.email, body.trim()],
      );
      return ticketId;
    });

    const who = user.display_name?.trim() || user.email;
    if (assignee) {
      await this.bell([assignee.id], 'ticket.assigned', id, `New ticket for you: ${subject}`, who);
    } else {
      const agents = await this.agents();
      await this.bell(agents.map((a) => a.id), 'ticket.new', id, `New ticket: ${subject}`, who);
    }
    return { id, subject, status: 'open' };
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
    const row = await this.db.queryOne<{
      email: string;
      display_name: string | null;
      subject: string;
      assigned_to: string | null;
    }>(
      `select u.email, u.display_name, t.subject, t.assigned_to from users u
         join support_tickets t on t.user_id = u.id
        where u.id = $1 and t.id = $2`,
      [userId, ticketId],
    );
    if (!row) throw new NotFoundException('No such ticket');

    await this.db.query(
      `insert into support_messages (ticket_id, author_type, author_id, author_name, body)
       values ($1, 'user', $2, $3, $4)`,
      [ticketId, userId, row.display_name?.trim() || row.email, body.trim()],
    );
    // Back to open: a customer replying to something marked resolved is
    // telling you it was not. And to something pending — waiting on them,
    // which is what an admin reply sets — it means the ball is back with us;
    // left pending, the app went on telling them it was waiting on them.
    await this.db.query(
      `update support_tickets
          set updated_at = now(),
              status = case when status in ('resolved','closed','pending') then 'open' else status end
        where id = $1`,
      [ticketId],
    );

    // Whoever holds the ticket hears that the customer wrote back.
    if (row.assigned_to) {
      await this.bell(
        [row.assigned_to],
        'ticket.reply',
        ticketId,
        `${row.display_name?.trim() || row.email} replied`,
        row.subject,
      );
    }
    return { ok: true };
  }

  // ------------------------------------------------------------- the desk

  /**
   * Console accounts that can answer tickets: active, and holding
   * `support.reply` through their role — built-in or custom.
   */
  async agents(): Promise<{ id: string; name: string; email: string; open: number }[]> {
    const rows = await this.db.query<{
      id: string;
      name: string;
      email: string;
      role: string;
      role_permissions: string[];
      role_system: boolean;
      open: number;
    }>(
      `select a.id, a.name, a.email, a.role, r.permissions as role_permissions,
              r.system as role_system,
              (select count(*) from support_tickets t
                where t.assigned_to = a.id and t.status in ('open', 'pending'))::int as open
         from admin_users a join admin_roles r on r.name = a.role
        where a.disabled_at is null
        order by a.name`,
    );
    return rows
      .filter((a) => permissionsFor(a.role, a.role_permissions, a.role_system).includes('support.reply'))
      .map(({ id, name, email, open }) => ({ id, name, email, open }));
  }

  /** The agent with the fewest open tickets; the longest-idle breaks ties. */
  private async lightestAgent() {
    const agents = await this.agents();
    return agents.sort((a, b) => a.open - b.open)[0] ?? null;
  }

  private async autoAssignOn(): Promise<boolean> {
    const row = await this.db.queryOne<{ value: unknown }>(
      `select value from admin_settings where key = 'support.autoAssign'`,
    );
    return row?.value === true;
  }

  async settings() {
    return { autoAssign: await this.autoAssignOn() };
  }

  async setAutoAssign(on: boolean, adminId: string) {
    await this.db.query(
      `insert into admin_settings (key, value, updated_by, updated_at)
       values ('support.autoAssign', $1::jsonb, $2, now())
       on conflict (key) do update set value = excluded.value,
         updated_by = excluded.updated_by, updated_at = now()`,
      [JSON.stringify(on), adminId],
    );
    return { autoAssign: on };
  }

  /** Writes to the console's bell. Never throws: a missed ping must not fail a ticket. */
  private async bell(
    adminIds: string[],
    kind: 'ticket.new' | 'ticket.assigned' | 'ticket.reply',
    ticketId: string,
    title: string,
    body?: string,
  ) {
    if (adminIds.length === 0) return;
    try {
      await this.db.query(
        `insert into admin_notifications (admin_id, kind, ticket_id, title, body)
         select a, $2, $3, $4, $5 from unnest($1::uuid[]) a`,
        [adminIds, kind, ticketId, title.slice(0, 200), body?.slice(0, 300) ?? null],
      );
    } catch (err) {
      this.logger.error(`Could not ring the console bell: ${String(err)}`);
    }
  }

  async notifications(adminId: string) {
    const [items, unread] = await Promise.all([
      this.db.query(
        `select id, kind, ticket_id, title, body, read_at, created_at
           from admin_notifications where admin_id = $1
          order by created_at desc limit 40`,
        [adminId],
      ),
      this.db.queryOne<{ count: number }>(
        'select count(*)::int as count from admin_notifications where admin_id = $1 and read_at is null',
        [adminId],
      ),
    ]);
    return { items, unread: unread?.count ?? 0 };
  }

  async markRead(adminId: string, ids?: string[]) {
    await this.db.query(
      `update admin_notifications set read_at = now()
        where admin_id = $1 and read_at is null and ($2::uuid[] is null or id = any($2::uuid[]))`,
      [adminId, ids?.length ? ids : null],
    );
    return { ok: true };
  }

  // ------------------------------------------------------------- the console

  async list(params: TicketQuery, adminId: string) {
    const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
    const offset = Math.max(params.offset ?? 0, 0);
    const status = params.status?.trim() || null;
    const q = params.q?.trim() ? `%${params.q.trim()}%` : null;
    const category = (SUPPORT_CATEGORIES as readonly string[]).includes(params.category ?? '')
      ? params.category!
      : null;

    // Queues are the questions a desk asks: what is mine, what has nobody
    // taken, what is late. Each is a fixed fragment.
    // The filters are always $1–$4, so the list, its total and the queue
    // counts share them; limit and offset come after.
    const queue: Record<string, string> = {
      mine: `t.assigned_to = $4::uuid and t.status in ('open', 'pending')`,
      unassigned: `t.assigned_to is null and t.status in ('open', 'pending')`,
      overdue: `t.first_replied_at is null and t.due_at < now() and t.status in ('open', 'pending')`,
    };
    const where = `
      where ($1::text is null or t.status = $1)
        and ($2::text is null or t.subject ilike $2 or t.user_email ilike $2)
        and ($3::text is null or t.category = $3)
        -- Every parameter must appear for Postgres to type it, mine or not.
        and ($4::uuid is null or true)
        and ${queue[params.queue ?? ''] ?? 'true'}`;
    const args = [status, q, category, adminId];

    const rows = await this.db.query(
      `select t.id, t.subject, t.status, t.priority, t.category, t.user_email, t.user_id,
              t.created_at, t.updated_at, t.first_replied_at, t.resolved_at, t.due_at,
              t.assigned_to, a.name as assigned_name,
              (t.first_replied_at is null and t.due_at < now()
                and t.status in ('open', 'pending')) as overdue,
              (select count(*) from support_messages m where m.ticket_id = t.id)::int as messages,
              -- How long the customer has been waiting on us: since their last
              -- message, while the ticket is open.
              case when t.status = 'open' then
                (select max(m.created_at) from support_messages m
                  where m.ticket_id = t.id and m.author_type = 'user')
              end as waiting_since
         from support_tickets t
         left join admin_users a on a.id = t.assigned_to
        ${where}
        order by
          -- Late first, then urgent, then whoever has waited longest.
          (t.first_replied_at is null and t.due_at < now() and t.status in ('open', 'pending')) desc,
          case t.priority when 'urgent' then 0 when 'high' then 1
                          when 'normal' then 2 else 3 end,
          t.updated_at desc
        limit $5 offset $6`,
      [...args, limit, offset],
    );

    const total = await this.db.queryOne<{ count: string }>(
      `select count(*)::text as count from support_tickets t ${where}`,
      args,
    );

    const [counts, queues] = await Promise.all([
      this.db.query(`select status, count(*)::int as count from support_tickets group by 1`),
      this.db.queryOne<Record<string, number>>(
        `select
           count(*) filter (where ${queue.mine.replace('$4', '$1')})::int as mine,
           count(*) filter (where ${queue.unassigned})::int as unassigned,
           count(*) filter (where ${queue.overdue})::int as overdue
         from support_tickets t`,
        [adminId],
      ),
    ]);

    return { data: rows, total: Number(total?.count ?? 0), counts, queues };
  }

  /** The full thread, internal notes included. Console only. */
  async thread(ticketId: string) {
    const ticket = await this.db.queryOne(
      `select t.*, a.name as assigned_name, u.display_name as user_name, u.plan as user_plan,
              (t.first_replied_at is null and t.due_at < now()
                and t.status in ('open', 'pending')) as overdue
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

  /**
   * A staff reply, or an internal note.
   *
   * A reply reaches the customer in the app, by push and — new — by email,
   * with the reply in it. An unassigned ticket goes to whoever answers it
   * first. `setStatus` is what a canned reply does after sending ("Fixed on
   * our side" resolves the ticket).
   */
  async reply(
    ticketId: string,
    admin: { id: string; name: string },
    body: string,
    internal: boolean,
    options: { setStatus?: string; macroId?: string } = {},
  ) {
    const ticket = await this.db.queryOne<{
      user_id: string | null;
      subject: string;
      assigned_to: string | null;
      user_name: string | null;
      user_email: string;
    }>(
      `select t.user_id, t.subject, t.assigned_to, t.user_email,
              coalesce(nullif(trim(u.display_name), ''), split_part(t.user_email, '@', 1)) as user_name
         from support_tickets t left join users u on u.id = t.user_id
        where t.id = $1`,
      [ticketId],
    );
    if (!ticket) throw new NotFoundException('No such ticket');
    const text = body.trim();
    if (!text) throw new BadRequestException('Write something first');

    await this.db.query(
      `insert into support_messages
         (ticket_id, author_type, author_id, author_name, body, internal)
       values ($1, 'admin', $2, $3, $4, $5)`,
      [ticketId, admin.id, admin.name, text, internal],
    );

    const nextStatus =
      !internal && options.setStatus && ['pending', 'resolved', 'closed'].includes(options.setStatus)
        ? options.setStatus
        : null;
    await this.db.query(
      `update support_tickets
          set updated_at = now(),
              -- Only a real reply counts as a first response; an internal
              -- note is a conversation with yourself.
              first_replied_at = case
                when $2 then first_replied_at
                else coalesce(first_replied_at, now()) end,
              status = case when $2 then status
                            when $4::text is not null then $4
                            when status = 'open' then 'pending' else status end,
              resolved_at = case when $4::text in ('resolved', 'closed') then coalesce(resolved_at, now())
                                 else resolved_at end,
              -- The first to answer an unclaimed ticket owns it.
              assigned_to = case when $2 then assigned_to else coalesce(assigned_to, $3::uuid) end
        where id = $1`,
      [ticketId, internal, admin.id, nextStatus],
    );

    if (options.macroId) {
      await this.db.query(
        'update support_macros set use_count = use_count + 1 where id = $1',
        [options.macroId],
      );
    }

    // The customer hears about a reply, never about an internal note.
    if (!internal && ticket.user_id) {
      await this.notifier.notify([ticket.user_id], {
        topic: 'support',
        title: 'Support replied',
        body: ticket.subject,
        data: { type: 'support_reply', ticketId },
        email: supportReply({
          name: ticket.user_name ?? 'there',
          subject: ticket.subject,
          agent: admin.name.split(' ')[0],
          reply: text,
          url: `${this.mailConfig.appUrl}/support?ticket=${encodeURIComponent(ticketId)}`,
        }),
      });
    }

    return { ok: true };
  }

  async update(
    ticketId: string,
    patch: { status?: string; priority?: string; assignedTo?: string | null; category?: string | null },
    actor: { id: string; name: string },
  ) {
    if (patch.assignedTo) {
      const agents = await this.agents();
      if (!agents.some((a) => a.id === patch.assignedTo)) {
        throw new BadRequestException('That person cannot answer tickets');
      }
    }
    const before = await this.db.queryOne<{ assigned_to: string | null; subject: string }>(
      'select assigned_to, subject from support_tickets where id = $1',
      [ticketId],
    );
    if (!before) throw new NotFoundException('No such ticket');

    const row = await this.db.queryOne(
      `update support_tickets
          set status      = coalesce($2, status),
              priority    = coalesce($3, priority),
              assigned_to = case when $5 then $4::uuid else assigned_to end,
              category    = case when $7 then $6 else category end,
              -- A new priority moves the target, until the first reply is in.
              due_at      = case when $3::text is not null and first_replied_at is null
                                 then ${dueSql('$3::text', 'created_at')} else due_at end,
              resolved_at = case when $2 in ('resolved','closed') then coalesce(resolved_at, now())
                                 when $2 is not null then null
                                 else resolved_at end,
              updated_at  = now()
        where id = $1
        returning id, status, priority, category, assigned_to, due_at`,
      [
        ticketId,
        patch.status ?? null,
        patch.priority ?? null,
        patch.assignedTo ?? null,
        patch.assignedTo !== undefined,
        patch.category ?? null,
        patch.category !== undefined,
      ],
    );

    // Handed to someone else: they hear about it.
    if (patch.assignedTo && patch.assignedTo !== before.assigned_to && patch.assignedTo !== actor.id) {
      await this.bell(
        [patch.assignedTo],
        'ticket.assigned',
        ticketId,
        `${actor.name} gave you a ticket`,
        before.subject,
      );
    }
    return row;
  }

  // --------------------------------------------------------------- macros

  async macros() {
    return this.db.query(
      `select id, title, body, set_status, created_by_name, use_count, created_at, updated_at
         from support_macros order by use_count desc, lower(title)`,
    );
  }

  async saveMacro(
    input: { title: string; body: string; setStatus?: string | null },
    admin: { id: string; name: string },
    id?: string,
  ) {
    const status = input.setStatus && ['pending', 'resolved', 'closed'].includes(input.setStatus)
      ? input.setStatus
      : null;
    if (id) {
      const row = await this.db.queryOne(
        `update support_macros set title = $2, body = $3, set_status = $4, updated_at = now()
          where id = $1 returning id`,
        [id, input.title.trim(), input.body.trim(), status],
      );
      if (!row) throw new NotFoundException('No such reply');
      return row;
    }
    return this.db.queryOne(
      `insert into support_macros (title, body, set_status, created_by, created_by_name)
       values ($1, $2, $3, $4, $5) returning id`,
      [input.title.trim(), input.body.trim(), status, admin.id, admin.name],
    );
  }

  async removeMacro(id: string) {
    const row = await this.db.queryOne('delete from support_macros where id = $1 returning id', [id]);
    if (!row) throw new NotFoundException('No such reply');
    return row;
  }

  // --------------------------------------------------------------- insight

  /**
   * How the desk is doing over the last `days`: what is waiting, how long a
   * first reply and a resolution took (medians, so one stuck ticket does not
   * drown the rest), the daily flow, and each agent's share.
   */
  async insights(days = 30) {
    const window = Math.min(Math.max(days, 1), 365);
    const [now, speed, flow, agents] = await Promise.all([
      this.db.queryOne<Record<string, number>>(
        `select
           count(*) filter (where status = 'open')::int as open,
           count(*) filter (where status = 'pending')::int as pending,
           count(*) filter (where assigned_to is null and status in ('open','pending'))::int as unassigned,
           count(*) filter (where first_replied_at is null and due_at < now()
                              and status in ('open','pending'))::int as overdue
         from support_tickets`,
      ),
      this.db.queryOne<Record<string, number | null>>(
        `select
           percentile_cont(0.5) within group (order by extract(epoch from first_replied_at - created_at))
             filter (where first_replied_at is not null) / 3600 as first_reply_hours,
           percentile_cont(0.5) within group (order by extract(epoch from resolved_at - created_at))
             filter (where resolved_at is not null) / 3600 as resolution_hours,
           (count(*) filter (where first_replied_at is not null and first_replied_at <= due_at))::float
             / nullif(count(*) filter (where first_replied_at is not null), 0) as on_time
         from support_tickets
        where created_at > now() - make_interval(days => $1)`,
        [window],
      ),
      this.db.query(
        `select d::date as day,
                (select count(*) from support_tickets where created_at::date = d::date)::int as opened,
                (select count(*) from support_tickets where resolved_at::date = d::date)::int as resolved
           from generate_series(now() - make_interval(days => $1 - 1), now(), interval '1 day') d
          order by d`,
        [window],
      ),
      this.db.query(
        `select a.id, a.name,
                (select count(*) from support_tickets t
                  where t.assigned_to = a.id and t.status in ('open','pending'))::int as open,
                (select count(*) from support_tickets t
                  where t.assigned_to = a.id and t.resolved_at > now() - make_interval(days => $1))::int as resolved,
                (select count(*) from support_messages m
                  where m.author_type = 'admin' and m.author_id = a.id and not m.internal
                    and m.created_at > now() - make_interval(days => $1))::int as replies,
                (select percentile_cont(0.5) within group
                          (order by extract(epoch from t.first_replied_at - t.created_at)) / 3600
                   from support_tickets t
                  where t.assigned_to = a.id and t.first_replied_at is not null
                    and t.created_at > now() - make_interval(days => $1)) as first_reply_hours
           from admin_users a
          where a.disabled_at is null
            and exists (select 1 from support_tickets t where t.assigned_to = a.id
                        union all
                        select 1 from support_messages m where m.author_type = 'admin' and m.author_id = a.id)
          order by a.name`,
        [window],
      ),
    ]);
    return { days: window, now, speed, flow, agents };
  }
}
