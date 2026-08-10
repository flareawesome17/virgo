import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { AdminIdentity } from './admin-auth.service';

export interface AuditEntry {
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
}

/**
 * The record of what console accounts did.
 *
 * Every write path through the console goes through here. Reads deliberately
 * do not: logging "viewed the user list" on every page load buries the one
 * entry that matters — the account that got disabled — under thousands that
 * do not.
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
  async record(admin: AdminIdentity, entry: AuditEntry): Promise<void> {
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

  async list(params: { limit?: number; offset?: number; targetId?: string } = {}) {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const offset = Math.max(params.offset ?? 0, 0);

    const rows = await this.db.query(
      `select id, admin_email, action, target_type, target_id, detail, created_at
         from admin_audit_log
        where ($3::text is null or target_id = $3)
        order by created_at desc
        limit $1 offset $2`,
      [limit, offset, params.targetId ?? null],
    );

    const total = await this.db.queryOne<{ count: string }>(
      `select count(*)::text as count from admin_audit_log
        where ($1::text is null or target_id = $1)`,
      [params.targetId ?? null],
    );

    return { data: rows, total: Number(total?.count ?? 0) };
  }
}
