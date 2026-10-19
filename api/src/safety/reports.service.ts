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
 * The console's moderation queue reviews it (ModerationService).
 *
 * A report from a chat can carry the messages it is about. They are copied
 * when it is filed, so staff read what was reported and never the
 * conversation itself.
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

    // One open report per reporter per account: a second, while the first
    // is still waiting, is the same complaint — though it can bring more of
    // the conversation with it.
    const inserted = await this.db.query<{ id: string }>(
      `insert into user_reports (reporter_id, target_id, reason, note, source)
       values ($1, $2, $3, $4, $5)
       on conflict (reporter_id, target_id) where status = 'open' do nothing
       returning id`,
      [reporterId, targetId, dto.reason, note, source],
    );
    const reportId =
      inserted[0]?.id ??
      (
        await this.db.queryOne<{ id: string }>(
          `select id from user_reports
            where reporter_id = $1 and target_id = $2 and status = 'open'`,
          [reporterId, targetId],
        )
      )?.id;

    if (reportId && source === 'chat' && dto.conversationId && dto.messageIds?.length) {
      await this.captureEvidence(reportId, reporterId, targetId, dto.conversationId, dto.messageIds);
    }
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

  /**
   * Copies the reported messages into report_evidence.
   *
   * Only what the reporter could see, and only what passed between the two of
   * them: a message in that conversation, from either of them, not deleted
   * for everyone, not deleted by the reporter for themselves, and not before
   * they cleared the chat. Anyone else's words in a group stay out, and so
   * does any id that is not one of those — silently, since a report is worth
   * keeping even when its evidence is not. Both must be in the conversation.
   *
   * Never throws: the report is written down already, and losing it because a
   * copy failed would be worse than a report without the copy.
   */
  private async captureEvidence(
    reportId: string,
    reporterId: string,
    targetId: string,
    conversationId: string,
    messageIds: string[],
  ): Promise<void> {
    try {
      await this.db.query(
        `insert into report_evidence
           (report_id, message_id, conversation_id, sender_id, sender_role, sender_name, body, kind, sent_at)
         select $1, m.id, m.conversation_id, m.sender_id,
                case when m.sender_id = $2 then 'reporter' else 'reported' end,
                coalesce(nullif(btrim(u.display_name), ''), split_part(u.email, '@', 1)),
                m.body, m.kind, m.created_at
           from messages m
           join conversation_participants me
             on me.conversation_id = m.conversation_id and me.user_id = $2
           join users u on u.id = m.sender_id
          where m.conversation_id = $4
            and m.id = any($5::uuid[])
            and m.sender_id in ($2, $3)
            and m.deleted_at is null
            and (me.cleared_at is null or m.created_at > me.cleared_at)
            and not exists (select 1 from message_deletions d
                             where d.message_id = m.id and d.user_id = $2)
            and exists (select 1 from conversation_participants them
                         where them.conversation_id = m.conversation_id and them.user_id = $3)
         on conflict (report_id, message_id) do nothing`,
        [reportId, reporterId, targetId, conversationId, messageIds],
      );
    } catch (error) {
      this.logger.error(`could not keep a chat report's messages: ${(error as Error).message}`);
    }
  }
}
