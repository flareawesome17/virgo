import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ShowcasesService } from './showcases.service';

/**
 * Reporting a showcase.
 *
 * Until this existed a report could only name an account, which is both
 * heavier than most situations warrant and useless for saying which post is
 * the problem. A feed of public photographs needs the post to be reportable.
 */

export const SHOWCASE_REPORT_REASONS = [
  'spam',
  'scam',
  'harassment',
  'inappropriate',
  'stolen_work',
  'wrong_credit',
  'other',
] as const;

export type ShowcaseReportReason = (typeof SHOWCASE_REPORT_REASONS)[number];

@Injectable()
export class ShowcaseReportsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly showcases: ShowcasesService,
  ) {}

  /**
   * File one.
   *
   * Reads the showcase as the viewer first, so a post they cannot see is one
   * they cannot report — otherwise reporting becomes a way to confirm that
   * something exists.
   *
   * A second report from the same person is the same complaint: the unique
   * constraint absorbs it and the caller is told it went through, because
   * "you already reported this" is a distinction that serves nobody.
   */
  async report(
    userId: string,
    showcaseId: string,
    reason: ShowcaseReportReason,
    note?: string,
  ): Promise<{ reported: true }> {
    await this.showcases.one(userId, showcaseId);
    await this.db.query(
      `insert into showcase_reports (reporter_id, showcase_id, reason, note)
       values ($1, $2, $3, $4)
       on conflict (reporter_id, showcase_id)
       do update set reason = excluded.reason, note = excluded.note`,
      [userId, showcaseId, reason, note?.trim() || null],
    );
    return { reported: true };
  }
}
