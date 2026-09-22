import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MailConfig } from '../mail/mail.config';
import { MailService } from '../mail/mail.service';
import { userReported } from '../mail/mail.templates';
import { BlocksService } from './blocks.service';
import type { ReportPersonDto } from './dto/safety.dto';

/**
 * Somebody telling us about an account.
 *
 * The job-report pattern: written down first, then one email to whoever
 * answers the reply-to address, with a link to the account in the console.
 * There is no review state yet — the console lists them and suspends from the
 * account page.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly blocks: BlocksService,
    private readonly mail: MailService,
    private readonly mailConfig: MailConfig,
  ) {}

  /**
   * Records a report and, the first time this person reports this account,
   * emails it on.
   *
   * A second report from the same person is the same complaint: it gets the
   * same thanks and no second email. The reporter's address is never put in
   * the email; the console shows it to the people allowed to see it.
   */
  async report(
    reporterId: string,
    dto: ReportPersonDto,
  ): Promise<{ reported: true }> {
    const targetId = await this.blocks.resolvePerson(reporterId, dto, 'report');
    const note = dto.note?.trim() || null;
    const source = dto.from ?? null;

    const inserted = await this.db.query<{ id: string }>(
      `insert into user_reports (reporter_id, target_id, reason, note, source)
       values ($1, $2, $3, $4, $5)
       on conflict (reporter_id, target_id) do nothing
       returning id`,
      [reporterId, targetId, dto.reason, note, source],
    );
    if (inserted.length === 0) return { reported: true };

    const target = await this.db.queryOne<{
      name: string;
      handle: string | null;
      n: number;
    }>(
      `select coalesce(nullif(btrim(u.display_name), ''), split_part(u.email, '@', 1)) as name,
              u.handle,
              (select count(*)::int from user_reports r where r.target_id = u.id) as n
         from users u
        where u.id = $1`,
      [targetId],
    );
    const count = Number(target?.n ?? 1);

    this.logger.warn(
      `account ${targetId} reported (${dto.reason}) — ${count} total`,
    );

    const to = this.mailConfig.replyTo;
    if (to) {
      await this.mail
        .send(
          to,
          userReported({
            name: target?.name ?? 'An account',
            handle: target?.handle ?? null,
            reason: dto.reason,
            note,
            reportCount: count,
            source,
            url: `${this.mailConfig.consoleUrl}/virgo-users/${targetId}`,
          }),
        )
        .catch((error: Error) =>
          // A report that was written down still counts. Failing the request
          // because the mail relay is down would lose it entirely.
          this.logger.error(`could not email the report: ${error.message}`),
        );
    }

    return { reported: true };
  }
}
