import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { TRASH_DAYS, WorkspacesRepository } from './workspaces.repository';

/** How many albums, or workspaces, one statement takes. */
const BATCH = 100;

/**
 * Empties Recently deleted: an album or a workspace deleted 30 days ago is
 * deleted for good, and its files with it (106_album_trash.sql).
 *
 * The files go first, and the album or workspace only once the bucket has
 * taken all of them. One it held on to waits for the next run, so a file
 * that still exists is never left behind out of every album, where nothing
 * would say where it came from.
 *
 * Hourly, so "deleted on the 24th" means the 24th and not whenever a daily
 * run next comes round. Nobody is told: everyone who had it was told when it
 * was deleted, and the owner was shown the date then.
 */
@Injectable()
export class WorkspaceTrashService {
  private readonly logger = new Logger(WorkspaceTrashService.name);
  private running = false;

  constructor(
    private readonly workspaces: WorkspacesRepository,
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sweep(): Promise<void> {
    // A slow run overlapping the next would only delete the same objects
    // twice, but there is no reason to start one.
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
  async run(): Promise<{ albums: number; workspaces: number }> {
    const albums = await this.purgeAlbums();
    const workspaces = await this.purgeWorkspaces();
    if (albums + workspaces > 0) {
      this.logger.log(
        `Deleted ${albums} album(s) and ${workspaces} workspace(s) after ${TRASH_DAYS} days in Recently deleted`,
      );
    }
    return { albums, workspaces };
  }

  /**
   * Albums deleted on their own, a batch at a time, so a backlog — after an
   * outage, say — is cleared in short statements. Each batch leaves out what
   * this run already tried, so albums the bucket held on to are not tried
   * again until the next one.
   */
  private async purgeAlbums(): Promise<number> {
    const tried: string[] = [];
    let purged = 0;
    for (;;) {
      const rows = await this.db.query<{ id: string }>(
        `select id from albums
          where deleted_at < now() - interval '${TRASH_DAYS} days'
            and id <> all($2::text[])
          order by deleted_at
          limit $1`,
        [BATCH, [...tried]],
      );
      if (rows.length === 0) break;
      const ids = rows.map((r) => r.id);
      tried.push(...ids);

      await this.storage.purgeAlbumFiles(ids);
      const gone = await this.db.query<{ id: string }>(
        `delete from albums a
          where a.id = any($1::text[])
            and a.deleted_at < now() - interval '${TRASH_DAYS} days'
            and not exists (select 1 from user_files f where f.album_id = a.id)
          returning a.id`,
        [ids],
      );
      purged += gone.length;
      if (rows.length < BATCH) break;
    }
    return purged;
  }

  /**
   * Workspaces, the same way: the files of every album in one first, unless
   * it was deleted before its files went with it, then the workspace.
   */
  private async purgeWorkspaces(): Promise<number> {
    const tried: string[] = [];
    let purged = 0;
    for (;;) {
      const rows = await this.workspaces.expired(BATCH, [...tried]);
      if (rows.length === 0) break;
      tried.push(...rows.map((r) => r.id));

      const albumIds = rows.filter((r) => !r.purge_keeps_files).flatMap((r) => r.album_ids);
      await this.storage.purgeAlbumFiles(albumIds);
      purged += (await this.workspaces.purge(rows.map((r) => r.id))).length;
      if (rows.length < BATCH) break;
    }
    return purged;
  }
}
