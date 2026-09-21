import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { generateId } from '../../common/id';
import { DatabaseService } from '../../database/database.service';
import {
  accessAllows,
  QuotaService,
  type MediaAccess,
} from '../../quota/quota.service';

export interface AlbumSection {
  id: string;
  name: string;
  position: number;
  /** Files in this section, of every kind. */
  count: number;
  counts: { image: number; video: number; audio: number };
}

export interface AlbumSectionList {
  data: AlbumSection[];
  /** Files in the album that are in no section. */
  unsorted: number;
  /** Every file in the album — the "All" chip. */
  total: number;
  /** The whole album by kind, whichever section is on screen. */
  counts: { image: number; video: number; audio: number };
  /** Files the client has picked through the delivery link. */
  picked: number;
}

/** Postgres's code for a unique index refusing a row. */
const UNIQUE_VIOLATION = '23505';

/**
 * Named groups inside one album — "Prep", "Ceremony", "Reception".
 *
 * Authorised per album, the same way the album's media is: whoever may view
 * the album may see its sections, and arranging them is 'manage', the bar for
 * changing what the album contains. Collaborator uploads are billed to the
 * album's owner, so there is no telling which files a second shooter added
 * and letting 'upload' refile only their own is not something the data can
 * support.
 */
@Injectable()
export class AlbumSectionsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly quota: QuotaService,
  ) {}

  private async require(userId: string, albumId: string, level: MediaAccess) {
    const access = await this.quota.accessForAlbum(userId, albumId);
    if (!accessAllows(access, level)) {
      // One refusal for "no such album" and "not yours", so an id cannot be
      // probed for existence.
      throw new ForbiddenException(
        level === 'view'
          ? 'You do not have access to that album'
          : 'You cannot organise this album',
      );
    }
  }

  async list(userId: string, albumId: string): Promise<AlbumSectionList> {
    await this.require(userId, albumId, 'view');

    const sections = await this.db.query<{
      id: string;
      name: string;
      position: number;
      count: string;
      image: string;
      video: string;
      audio: string;
    }>(
      `select s.id, s.name, s.position,
              count(f.key)::text as count,
              count(f.key) filter (where f.content_type like 'image/%')::text as image,
              count(f.key) filter (where f.content_type like 'video/%')::text as video,
              count(f.key) filter (where f.content_type like 'audio/%')::text as audio
         from album_sections s
         left join user_files f on f.section_id = s.id and f.album_id = s.album_id
        where s.album_id = $1
        group by s.id
        order by s.position, s.created_at`,
      [albumId],
    );

    const totals = await this.db.queryOne<{
      total: string;
      unsorted: string;
      image: string;
      video: string;
      audio: string;
      picked: string;
    }>(
      `select count(*)::text as total,
              count(*) filter (where f.section_id is null)::text as unsorted,
              count(*) filter (where f.content_type like 'image/%')::text as image,
              count(*) filter (where f.content_type like 'video/%')::text as video,
              count(*) filter (where f.content_type like 'audio/%')::text as audio,
              count(p.file_key)::text as picked
         from user_files f
         left join album_picks p on p.album_id = f.album_id and p.file_key = f.key
        where f.album_id = $1`,
      [albumId],
    );

    return {
      data: sections.map((s) => ({
        id: s.id,
        name: s.name,
        position: s.position,
        count: Number(s.count),
        counts: { image: Number(s.image), video: Number(s.video), audio: Number(s.audio) },
      })),
      unsorted: Number(totals?.unsorted ?? 0),
      total: Number(totals?.total ?? 0),
      counts: {
        image: Number(totals?.image ?? 0),
        video: Number(totals?.video ?? 0),
        audio: Number(totals?.audio ?? 0),
      },
      picked: Number(totals?.picked ?? 0),
    };
  }

  async create(userId: string, albumId: string, name: string): Promise<AlbumSection> {
    await this.require(userId, albumId, 'manage');
    const clean = cleanName(name);
    try {
      const row = await this.db.queryOne<{ id: string; name: string; position: number }>(
        // Appended: a new section goes to the right of the ones already
        // arranged, which is where someone adding "Reception" after
        // "Ceremony" expects it.
        `insert into album_sections (id, album_id, name, position)
         values ($1, $2, $3,
                 coalesce((select max(position) + 1 from album_sections where album_id = $2), 0))
         returning id, name, position`,
        [generateId(), albumId, clean],
      );
      return { ...row!, count: 0, counts: { image: 0, video: 0, audio: 0 } };
    } catch (err) {
      throw duplicateOr(err);
    }
  }

  async rename(
    userId: string,
    albumId: string,
    sectionId: string,
    name: string,
  ): Promise<{ id: string; name: string }> {
    await this.require(userId, albumId, 'manage');
    try {
      const row = await this.db.queryOne<{ id: string; name: string }>(
        `update album_sections set name = $3
          where id = $1 and album_id = $2
          returning id, name`,
        [sectionId, albumId, cleanName(name)],
      );
      if (!row) throw new NotFoundException('Section not found');
      return row;
    } catch (err) {
      throw duplicateOr(err);
    }
  }

  /**
   * Sets the order to exactly `ids`.
   *
   * Takes the whole list rather than one move, so two people arranging at once
   * end with one of their orders rather than a blend of both, and the list
   * must name every section — a partial one would leave the others with
   * positions that no longer mean anything.
   */
  async reorder(userId: string, albumId: string, ids: string[]): Promise<{ ids: string[] }> {
    await this.require(userId, albumId, 'manage');
    const existing = await this.db.query<{ id: string }>(
      'select id from album_sections where album_id = $1',
      [albumId],
    );
    const known = new Set(existing.map((row) => row.id));
    if (
      ids.length !== known.size ||
      new Set(ids).size !== ids.length ||
      !ids.every((id) => known.has(id))
    ) {
      throw new BadRequestException('The order must list every section once');
    }
    await this.db.query(
      `update album_sections s
          set position = o.position
         from unnest($2::text[]) with ordinality as o(id, position)
        where s.album_id = $1 and s.id = o.id`,
      [albumId, ids],
    );
    return { ids };
  }

  /** Deletes the section. Its files stay in the album, unsorted. */
  async remove(userId: string, albumId: string, sectionId: string): Promise<void> {
    await this.require(userId, albumId, 'manage');
    const rows = await this.db.query<{ id: string }>(
      'delete from album_sections where id = $1 and album_id = $2 returning id',
      [sectionId, albumId],
    );
    if (rows.length === 0) throw new NotFoundException('Section not found');
  }

  /**
   * Files the given keys under a section, or takes them out of one (null).
   *
   * Only keys already in this album move; anything else in the list is
   * ignored rather than refused, so a selection that raced a delete still
   * files what is left. Returns how many actually moved.
   */
  async assign(
    userId: string,
    albumId: string,
    keys: string[],
    sectionId: string | null,
  ): Promise<{ moved: number }> {
    await this.require(userId, albumId, 'manage');
    if (keys.length === 0) return { moved: 0 };

    if (sectionId) {
      const section = await this.db.queryOne<{ id: string }>(
        'select id from album_sections where id = $1 and album_id = $2',
        [sectionId, albumId],
      );
      if (!section) throw new NotFoundException('Section not found');
    }

    const rows = await this.db.query<{ key: string }>(
      `update user_files set section_id = $3
        where album_id = $1 and key = any($2::text[])
        returning key`,
      [albumId, keys, sectionId],
    );
    return { moved: rows.length };
  }
}

function cleanName(name: string): string {
  const clean = name.replace(/\s+/g, ' ').trim();
  if (!clean) throw new BadRequestException('A section needs a name');
  if (clean.length > 60) throw new BadRequestException('Keep section names under 60 characters');
  return clean;
}

function duplicateOr(err: unknown): unknown {
  if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
    return new ConflictException('This album already has a section with that name');
  }
  return err;
}
