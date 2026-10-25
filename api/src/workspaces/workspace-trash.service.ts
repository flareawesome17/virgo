import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TRASH_DAYS, WorkspacesRepository } from './workspaces.repository';

/**
 * Empties Recently deleted: a workspace deleted 30 days ago is deleted for
 * real, as deleting one used to do at once.
 *
 * Hourly, so "deleted on the 24th" means the 24th and not whenever a daily
 * run next comes round. Nobody is told: everyone who had the workspace was
 * told when it was deleted, and the owner was shown the date then.
 */
@Injectable()
export class WorkspaceTrashService {
  private readonly logger = new Logger(WorkspaceTrashService.name);
  private running = false;

  constructor(private readonly workspaces: WorkspacesRepository) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sweep(): Promise<void> {
    // A slow run overlapping the next would only find locked rows, but there
    // is no reason to start one.
    if (this.running) return;
    this.running = true;
    try {
      await this.run();
    } catch (error) {
      this.logger.error(`sweep failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Exposed so it can be triggered in a test or by hand. */
  async run(): Promise<number> {
    let purged = 0;
    // Batches, so a backlog — after an outage, say — is cleared in short
    // statements instead of one that holds every row at once.
    for (;;) {
      const ids = await this.workspaces.purgeExpired();
      purged += ids.length;
      if (ids.length < 100) break;
    }
    if (purged > 0) {
      this.logger.log(`Deleted ${purged} workspace(s) after ${TRASH_DAYS} days in Recently deleted`);
    }
    return purged;
  }
}
