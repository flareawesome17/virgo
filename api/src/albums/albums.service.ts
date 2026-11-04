import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MEDIA_LOCAL_ZONE } from '../storage/capture-time';
import { MAX_RETENTION_DAYS } from './dto/album.dto';
import { type DeleteProof, ReauthService } from '../auth/reauth.service';
import { OwnedResourceService } from '../common/owned-resource.service';
import { DatabaseService } from '../database/database.service';
import { QuotaService } from '../quota/quota.service';
import { WorkspaceActivityService } from '../workspaces/workspace-activity.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { AlbumRow, AlbumsRepository, type DeletedAlbumRow } from './albums.repository';

/** Today in Manila, `YYYY-MM-DD`: the day a retention date is counted in. */
export function manilaToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MEDIA_LOCAL_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** `days` after a `YYYY-MM-DD`, as another. Calendar arithmetic, no clock. */
function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Retention as the album will store it: days after each upload, a last day,
 * or neither — never both.
 *
 * Choosing one clears the other, so a client only ever sends the one it
 * means. A date has to be a real day after today: today would empty the album
 * overnight, which is a mis-set value rather than an intent, and a past one
 * would do it at once. 0 days has always meant off, and still does.
 */
export function normalizeRetention(
  data: Record<string, unknown>,
  today = manilaToday(),
): Record<string, unknown> {
  const days = data.retention_days;
  const until = data.retention_until;
  const daysSet = typeof days === 'number' && days > 0;
  const untilSet = typeof until === 'string';

  if (daysSet && untilSet) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      code: 'RETENTION_BOTH',
      message: 'Keep the files for a number of days or until a date, not both.',
    });
  }

  const next = { ...data };
  if (days === 0) next.retention_days = null;
  if (daysSet) next.retention_until = null;

  if (untilSet) {
    const parsed = new Date(`${until}T00:00:00Z`);
    // 2026-02-30 parses as 2 March; round-tripping catches it.
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== until) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'RETENTION_DATE_INVALID',
        message: 'That is not a date on the calendar.',
      });
    }
    if (until <= today) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'RETENTION_DATE_PAST',
        message: 'Pick a day after today. The files are kept through it.',
      });
    }
    if (until > addDays(today, MAX_RETENTION_DAYS)) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'RETENTION_DATE_FAR',
        message: 'A date can be at most ten years away.',
      });
    }
    next.retention_days = null;
  }

  return next;
}

@Injectable()
export class AlbumsService extends OwnedResourceService<AlbumRow> {
  constructor(
    private readonly albums: AlbumsRepository,
    private readonly workspaces: WorkspacesService,
    private readonly quota: QuotaService,
    private readonly db: DatabaseService,
    private readonly feed: WorkspaceActivityService,
    private readonly reauth: ReauthService,
  ) {
    super(albums, 'Album');
  }

  /**
   * Moves an album to Recently deleted with its files, which stop counting
   * toward storage at once. Deleting is how someone at their limit makes
   * room: an album that went while its files stayed behind and went on
   * counting left them with a full meter and nothing to show where it went.
   *
   * Asks for the password, or the emailed code with two-factor on, as
   * deleting a workspace does (ReauthService), before anything is looked up.
   * Nothing is deleted for 30 days; WorkspaceTrashService does that.
   */
  async remove(userId: string, id: string, proof: DeleteProof = {}): Promise<void> {
    await this.reauth.confirmDelete(userId, proof);
    await super.remove(userId, id);
  }

  /** The owner's Recently deleted albums. */
  async deleted(userId: string): Promise<DeletedAlbumRow[]> {
    return this.albums.deleted(userId);
  }

  /**
   * Puts a deleted album back where it was, with its files, sections, links
   * and the people it was shared with.
   *
   * Nothing in Recently deleted counts toward the plan, so bringing an album
   * back asks what making it and uploading its files would: room for another
   * album in that workspace, and room for the files. No password: restoring
   * loses nothing.
   */
  async restore(userId: string, id: string): Promise<AlbumRow> {
    const album = await this.albums.restorable(userId, id);
    if (!album) throw new NotFoundException('That album is not in Recently deleted');

    await this.quota.assertCanCreateAlbum(userId, album.workspace_id);
    await this.quota.assertCanRestore(userId, album.bytes, 'album');

    const back = await this.albums.restore(userId, id);
    if (!back) throw new NotFoundException('That album is not in Recently deleted');
    return back;
  }

  /**
   * The albums.workspace_id foreign key only guarantees the workspace exists —
   * it says nothing about who owns it. Without this check a caller could create
   * an album pointing at another user's workspace id.
   *
   * 400 rather than 404 or 403: the workspace is invalid *as input to this
   * request*, and neither confirms nor denies that the id exists elsewhere.
   */
  private async assertWorkspace(
    userId: string,
    workspaceId: string | undefined,
  ): Promise<void> {
    if (workspaceId === undefined) return;
    const owned = await this.workspaces.assertOwned(userId, workspaceId);
    if (!owned) throw new BadRequestException('Unknown workspace');
  }

  async create(
    userId: string,
    data: Record<string, unknown>,
  ): Promise<AlbumRow> {
    await this.quota.assertCanCreateAlbum(
      userId,
      data.workspace_id as string | undefined,
    );
    await this.assertWorkspace(userId, data.workspace_id as string | undefined);
    const album = await super.create(userId, normalizeRetention(data));

    const shared = await this.shareWithMembers(album.id, album.workspace_id);
    await this.feed.record(album.workspace_id, userId, 'album-created', { albumId: album.id });
    // Read again when it was shared, so the card says so from the start.
    return shared > 0 ? ((await this.albums.findOne(userId, album.id)) ?? album) : album;
  }

  async update(
    userId: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<AlbumRow> {
    // Re-checked on update too: moving an album into a workspace is the same
    // authorization question as creating it there.
    const target = data.workspace_id as string | undefined;
    await this.assertWorkspace(userId, target);

    // A move is also the same *limit* question as creating it there. It was
    // not asked, so a workspace at its plan's limit could be filled past it by
    // making albums elsewhere and moving them in.
    let movedFrom: string | null = null;
    if (target !== undefined) {
      const current = await this.db.queryOne<{ workspace_id: string }>(
        'select workspace_id from albums where id = $1 and user_id = $2 and deleted_at is null',
        [id, userId],
      );
      if (!current) throw new NotFoundException('Album not found');
      if (current.workspace_id !== target) {
        await this.quota.assertCanCreateAlbum(userId, target);
        movedFrom = current.workspace_id;
      }
    }

    // Whichever cover was chosen last wins, so choosing one clears the other.
    // Left alone, an uploaded cover would keep losing to a photograph picked
    // weeks earlier, with nothing on screen to say why.
    if (typeof data.cover_key === 'string') {
      // Ownership first, so a key cannot be probed against someone else's album.
      await this.get(userId, id);
      if (!(await this.albums.isAlbumImage(id, data.cover_key))) {
        throw new BadRequestException('A cover has to be a photograph in this album');
      }
      data = { ...data, cover_url: null };
    } else if (typeof data.cover_url === 'string') {
      data = { ...data, cover_key: null };
    }

    const updated = await super.update(userId, id, normalizeRetention(data));
    if (movedFrom === null || target === undefined) return updated;

    await this.settleMove(userId, id, movedFrom, target);
    return (await this.albums.findOne(userId, id)) ?? updated;
  }

  /**
   * What moving an album between workspaces means for who can see it.
   *
   * The people in the workspace it left lose it: their access came from being
   * in that workspace, and the grants that were kept left the album in their
   * lists after it had gone. The people in the one it joined get it on the
   * same terms as any album added there. Its history stays behind with nobody
   * left to read it, so it goes, and the old workspace stops using it as its
   * cover.
   */
  private async settleMove(
    userId: string,
    albumId: string,
    from: string,
    to: string,
  ): Promise<void> {
    await this.db.query(
      `delete from collaborator_albums ca
        using collaborators c
        where ca.collaborator_id = c.id
          and ca.album_id = $1
          and c.workspace_id <> $2`,
      [albumId, to],
    );
    await this.db.query(
      'update workspaces set cover_album_id = null where id = $1 and cover_album_id = $2',
      [from, albumId],
    );
    await this.shareWithMembers(albumId, to);
    await this.feed.forgetAlbum(albumId, to);
    await this.feed.record(to, userId, 'album-moved', { albumId });
  }

  /**
   * Gives an album that has just arrived in a workspace to everyone there who
   * asked for albums added later, at the level they asked for.
   *
   * Pending invitations included, so someone who accepts next week does not
   * find the albums made in the meantime missing. Albums still start private
   * for everyone who did not ask — that is the default, and the owner's to
   * change.
   */
  private async shareWithMembers(albumId: string, workspaceId: string): Promise<number> {
    const rows = await this.db.query<{ collaborator_id: string }>(
      `insert into collaborator_albums (collaborator_id, album_id, media_access)
       select c.id, $1, c.new_album_access
         from collaborators c
        where c.workspace_id = $2
          and c.new_album_access is not null
          and c.status in ('accepted', 'pending')
       on conflict (collaborator_id, album_id) do nothing
       returning collaborator_id`,
      [albumId, workspaceId],
    );
    return rows.length;
  }
}
