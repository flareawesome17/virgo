import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface AuditEntry {
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
}

/** Who acted. An identity from the guard, or an account row on the sign-in path. */
export interface AuditActor {
  id: string;
  email: string;
}

export interface AuditQuery {
  limit?: number;
  offset?: number;
  adminId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  /** ISO dates, inclusive of the whole `to` day. */
  from?: string;
  to?: string;
  /** Views are left out unless asked for: they would bury every change. */
  includeViews?: boolean;
}

/** One "viewed this customer" per person per customer per this many minutes. */
const VIEW_WINDOW_MINUTES = 10;

/**
 * The record of what console accounts did — and, since phase 2, whose
 * personal data they opened.
 *
 * Changes are recorded at every write. Views are recorded separately and
 * sparingly: one entry per person per customer per ten minutes, because the
 * page refetches whenever the window regains focus and an entry per fetch
 * would bury the one that matters under thousands that do not.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Never throws.
   *
   * A failure to write the audit row must not roll back the action it
   * describes — the account is already disabled, and turning that into a 500
   * would leave the caller believing it had not happened. It is logged loudly
   * instead, because a silently missing audit trail is its own problem.
   */
  async record(admin: AuditActor, entry: AuditEntry): Promise<void> {
    try {
      await this.db.query(
        `insert into admin_audit_log
           (admin_id, admin_email, action, target_type, target_id, detail)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          admin.id,
          admin.email,
          entry.action,
          entry.targetType ?? null,
          entry.targetId ?? null,
          JSON.stringify(entry.detail ?? {}),
        ],
      );
    } catch (err) {
      this.logger.error(
        `Audit write failed for ${admin.email} ${entry.action}: ${String(err)}`,
      );
    }
  }

  /**
   * Records that someone opened a record holding personal data.
   *
   * The insert itself checks for a recent entry, so two tabs loading the same
   * customer at once still write one row at most most of the time — and two
   * at worst, which is harmless.
   */
  async recordView(admin: AuditActor, targetType: string, targetId: string): Promise<void> {
    const action = `${targetType}.view`;
    try {
      await this.db.query(
        `insert into admin_audit_log (admin_id, admin_email, action, target_type, target_id)
         select $1, $2, $3, $4, $5
          where not exists (
            select 1 from admin_audit_log
             where admin_id = $1 and action = $3 and target_id = $5
               and created_at > now() - make_interval(mins => $6))`,
        [admin.id, admin.email, action, targetType, targetId, VIEW_WINDOW_MINUTES],
      );
    } catch (err) {
      this.logger.error(`Audit view write failed for ${admin.email}: ${String(err)}`);
    }
  }

  async list(params: AuditQuery = {}) {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const offset = Math.max(params.offset ?? 0, 0);

    // A named action is always shown, views included: asking for
    // `user.view` by name is asking for views.
    const where = `
      where ($1::uuid is null or l.admin_id = $1)
        and ($2::text is null or l.action = $2)
        and ($3::text is null or l.target_type = $3)
        and ($4::text is null or l.target_id = $4)
        and ($5::date is null or l.created_at >= $5::date)
        and ($6::date is null or l.created_at < $6::date + 1)
        and ($2::text is not null or $7::boolean or l.action not like '%.view')`;
    const args = [
      params.adminId || null,
      params.action || null,
      params.targetType || null,
      params.targetId || null,
      params.from || null,
      params.to || null,
      params.includeViews ?? false,
    ];

    const rows = await this.db.query(
      `select l.id, l.admin_id, l.admin_email, a.name as admin_name, l.action,
              l.target_type, l.target_id, l.detail, l.created_at,
              -- The person behind a user id, so the log reads as names.
              case when l.target_type = 'user'
                   then (select coalesce(nullif(trim(u.display_name), ''), u.email)
                           from users u where u.id = l.target_id::uuid)
              end as target_label
         from admin_audit_log l
         left join admin_users a on a.id = l.admin_id
         ${where}
        order by l.created_at desc
        limit $8 offset $9`,
      [...args, limit, offset],
    );

    const total = await this.db.queryOne<{ count: string }>(
      `select count(*)::text as count from admin_audit_log l ${where}`,
      args,
    );

    return { data: rows, total: Number(total?.count ?? 0) };
  }

  /** What the filters offer: every action ever recorded, and every actor. */
  async facets() {
    const [actions, admins] = await Promise.all([
      this.db.query<{ action: string }>(
        'select distinct action from admin_audit_log order by action',
      ),
      this.db.query<{ id: string; name: string; email: string }>(
        `select distinct a.id, a.name, a.email
           from admin_audit_log l join admin_users a on a.id = l.admin_id
          order by a.name`,
      ),
    ]);
    return { actions: actions.map((a) => a.action), admins };
  }
}
