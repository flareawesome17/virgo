import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { AdminAuthService, type AdminIdentity } from './admin-auth.service';
import {
  digestRecoveryCode,
  generateRecoveryCodes,
  generateSecret,
  openSecret,
  otpauthUri,
  sealSecret,
  verifyTotp,
} from './totp';

/** How long the sign-in record is kept. Long enough to see a slow campaign. */
const LOGIN_EVENTS_DAYS = 180;

/**
 * Two-factor, sessions and the sign-in record — the parts of staff security
 * that are managed from the console rather than exercised at sign-in.
 */
@Injectable()
export class AdminSecurityService {
  private readonly logger = new Logger(AdminSecurityService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly auth: AdminAuthService,
  ) {}

  // ------------------------------------------------------------ two-factor

  /**
   * Starts enrolment: a new secret, held as pending until a code from the app
   * proves it was scanned. Calling it again replaces the pending one, which
   * is what "the QR code expired, show me another" needs.
   */
  async startTwoFactor(admin: AdminIdentity) {
    if (admin.twoFactorEnabled) {
      throw new BadRequestException(
        'Two-factor is already on. Turn it off first to move it to a new phone.',
      );
    }
    const secret = generateSecret();
    await this.db.query(
      'update admin_users set totp_pending_secret = $2 where id = $1',
      [admin.id, sealSecret(secret, this.auth.secret())],
    );
    return { secret, uri: otpauthUri(secret, admin.email) };
  }

  /**
   * Finishes enrolment and hands back the recovery codes — the only time they
   * are ever shown.
   */
  async enableTwoFactor(admin: AdminIdentity, code: string) {
    const row = await this.db.queryOne<{ totp_pending_secret: string | null }>(
      'select totp_pending_secret from admin_users where id = $1',
      [admin.id],
    );
    const secret = row?.totp_pending_secret
      ? openSecret(row.totp_pending_secret, this.auth.secret())
      : null;
    if (!secret) {
      throw new BadRequestException('Start the setup again — there is no code waiting to be confirmed.');
    }
    const step = verifyTotp(secret, code);
    if (step === null) {
      throw new BadRequestException(
        'That code does not match. Check the time on your phone is set automatically, then try the current code.',
      );
    }

    const codes = generateRecoveryCodes();
    await this.db.query(
      `update admin_users
          set totp_secret = $2, totp_pending_secret = null, totp_enabled_at = now(),
              totp_last_step = $3, recovery_codes = $4
        where id = $1`,
      [admin.id, sealSecret(secret, this.auth.secret()), step, codes.map(digestRecoveryCode)],
    );
    return { recoveryCodes: codes };
  }

  /**
   * Turns two-factor off. Needs the password, so a session left open on a
   * shared machine cannot quietly remove the second factor.
   *
   * Allowed even when the role requires it: the account is then held at the
   * setup screen until it enrols again, which is how a new phone is added.
   */
  async disableTwoFactor(admin: AdminIdentity, password: string) {
    if (!(await this.auth.checkPassword(admin.id, password))) {
      throw new BadRequestException('Your password is incorrect');
    }
    await this.clearTwoFactor(admin.id);
  }

  /** New recovery codes, the old ones dead. Needs a current code from the app. */
  async regenerateRecoveryCodes(admin: AdminIdentity, code: string) {
    const row = await this.db.queryOne<{ totp_secret: string | null; totp_last_step: string | null }>(
      'select totp_secret, totp_last_step from admin_users where id = $1',
      [admin.id],
    );
    const secret = row?.totp_secret ? openSecret(row.totp_secret, this.auth.secret()) : null;
    const lastStep = row?.totp_last_step == null ? null : Number(row.totp_last_step);
    const step = secret ? verifyTotp(secret, code, { lastStep }) : null;
    if (step === null) throw new BadRequestException('That code did not work. Try the current one.');

    const codes = generateRecoveryCodes();
    await this.db.query(
      'update admin_users set recovery_codes = $2, totp_last_step = $3 where id = $1',
      [admin.id, codes.map(digestRecoveryCode), step],
    );
    return { recoveryCodes: codes };
  }

  /**
   * An owner clears somebody else's two-factor — the lost-phone case — and
   * signs them out everywhere. If their role requires it they enrol again at
   * their next sign-in.
   */
  async resetTwoFactorFor(targetId: string, actingAdminId: string) {
    if (targetId === actingAdminId) {
      throw new BadRequestException('Turn off your own two-factor from My account.');
    }
    const row = await this.clearTwoFactor(targetId);
    await this.auth.revokeAllFor(targetId);
    return row;
  }

  private async clearTwoFactor(adminId: string) {
    const row = await this.db.queryOne<{ id: string; email: string }>(
      `update admin_users
          set totp_secret = null, totp_pending_secret = null, totp_enabled_at = null,
              totp_last_step = null, recovery_codes = '{}'
        where id = $1
        returning id, email`,
      [adminId],
    );
    if (!row) throw new NotFoundException('No such console account');
    return row;
  }

  async recoveryCodesLeft(adminId: string): Promise<number> {
    const row = await this.db.queryOne<{ left_count: number }>(
      'select cardinality(recovery_codes) as left_count from admin_users where id = $1',
      [adminId],
    );
    return row?.left_count ?? 0;
  }

  // -------------------------------------------------------------- lockout

  async unlock(targetId: string) {
    const row = await this.db.queryOne<{ id: string; email: string }>(
      `update admin_users set failed_logins = 0, locked_until = null
        where id = $1 returning id, email`,
      [targetId],
    );
    if (!row) throw new NotFoundException('No such console account');
    return row;
  }

  // ------------------------------------------------------------- sessions

  /** Sessions still able to refresh, newest activity first. */
  async sessions(adminId?: string) {
    return this.db.query(
      `select s.id, s.admin_id, a.name as admin_name, a.email as admin_email,
              s.ip, s.user_agent, s.created_at, s.last_seen_at, s.expires_at
         from admin_sessions s
         join admin_users a on a.id = s.admin_id
        where s.revoked_at is null and s.expires_at > now()
          and ($1::uuid is null or s.admin_id = $1)
        order by s.last_seen_at desc
        limit 200`,
      [adminId ?? null],
    );
  }

  /**
   * Ends a session. Scoped to one account when `ownerId` is given, so ending
   * "your" sessions can never reach somebody else's by id.
   */
  async endSession(sessionId: string, ownerId?: string) {
    const row = await this.db.queryOne<{ id: string; admin_id: string }>(
      `select id, admin_id from admin_sessions
        where id = $1 and revoked_at is null and ($2::uuid is null or admin_id = $2)`,
      [sessionId, ownerId ?? null],
    );
    if (!row) throw new NotFoundException('That session has already ended');
    await this.auth.endSession(row.id);
    return row;
  }

  /** Every session of one account except the one asking. */
  async endOtherSessions(adminId: string, keepSessionId?: string) {
    const rows = await this.db.query<{ id: string }>(
      `select id from admin_sessions
        where admin_id = $1 and revoked_at is null and ($2::uuid is null or id <> $2)`,
      [adminId, keepSessionId ?? null],
    );
    for (const row of rows) await this.auth.endSession(row.id);
    return { ended: rows.length };
  }

  // ------------------------------------------------------------- sign-ins

  async loginEvents(params: {
    adminId?: string;
    outcome?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const offset = Math.max(params.offset ?? 0, 0);
    // "failed" is every outcome but success, which is the question asked most.
    const where = `
      where ($1::uuid is null or e.admin_id = $1)
        and ($2::text is null
             or ($2 = 'failed' and e.outcome <> 'success')
             or e.outcome = $2)`;
    const args = [params.adminId || null, params.outcome || null];
    const rows = await this.db.query(
      `select e.id, e.admin_id, a.name as admin_name, e.email, e.outcome, e.ip,
              e.user_agent, e.created_at
         from admin_login_events e
         left join admin_users a on a.id = e.admin_id
         ${where}
        order by e.created_at desc
        limit $3 offset $4`,
      [...args, limit, offset],
    );
    const total = await this.db.queryOne<{ count: string }>(
      `select count(*)::text as count from admin_login_events e ${where}`,
      args,
    );
    return { data: rows, total: Number(total?.count ?? 0) };
  }

  /**
   * Nightly: sign-in records past their keeping time, and sessions that can
   * no longer be used (their refresh tokens go with them).
   */
  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async prune(): Promise<void> {
    try {
      await this.db.query(
        `delete from admin_login_events where created_at < now() - make_interval(days => $1)`,
        [LOGIN_EVENTS_DAYS],
      );
      await this.db.query(
        `delete from admin_sessions
          where coalesce(revoked_at, expires_at) < now() - interval '30 days'`,
      );
    } catch (err) {
      this.logger.error(`Pruning console security records failed: ${String(err)}`);
    }
  }
}
