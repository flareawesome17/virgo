import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { blockedBetween } from '../safety/block-sql';
import { ShowcasesService } from './showcases.service';

/**
 * Comments on a showcase.
 *
 * `allow_comments` has been on showcases since 071 with nothing behind it.
 * This is what it was describing.
 */

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  author: {
    id: string;
    displayName: string;
    handle: string | null;
    avatarUrl: string | null;
  };
  /** Whether this viewer may remove it: their own, or on their own showcase. */
  canRemove: boolean;
}

const PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class CommentsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly showcases: ShowcasesService,
  ) {}

  /**
   * One thread, oldest first.
   *
   * Reads the showcase as the viewer first, so a post they cannot see has no
   * readable thread either — otherwise the comments are a way to learn what a
   * post they were not shown is about.
   *
   * Turning comments off hides the thread rather than deleting it. The author
   * can turn it back on and everything is still there; taking somebody's words
   * away because a switch was flipped would be a worse answer than not showing
   * them for now. The showcase's own author still sees them, so the switch is
   * not a way to lose track of what was said.
   */
  async list(
    viewerId: string,
    showcaseId: string,
    opts: { limit?: number } = {},
  ): Promise<{ data: Comment[]; allowed: boolean }> {
    const showcase = await this.showcases.one(viewerId, showcaseId);
    const mine = showcase.userId === viewerId;
    if (!showcase.allowComments && !mine) return { data: [], allowed: false };

    const limit = Math.min(Math.max(opts.limit ?? PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const rows = await this.db.query<{
      id: string;
      body: string;
      created_at: Date | string;
      author_id: string;
      display_name: string | null;
      handle: string | null;
      avatar_url: string | null;
    }>(
      `select c.id, c.body, c.created_at,
              u.id as author_id, u.display_name, u.avatar_url,
              -- A handle is only a link once the profile is published: /profiles/:handle
              -- and hire both refuse an unpublished one, so handing it out made the
              -- avatar and Hire lead to "Profile not found".
              case when u.public_profile then u.handle end as handle
         from showcase_comments c
         join users u on u.id = c.user_id
        where c.showcase_id = $1
          -- Somebody you have blocked, or who blocked you, is not in the
          -- thread: being blocked has to look like the other person not being
          -- there, and a comment is them being there.
          and not ${blockedBetween('$2', 'c.user_id')}
          and u.suspended_at is null
        order by c.created_at, c.id
        limit $3`,
      [showcaseId, viewerId, limit],
    );

    return {
      allowed: showcase.allowComments,
      data: rows.map((r) => ({
        id: r.id,
        body: r.body,
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        author: {
          id: r.author_id,
          displayName: r.display_name ?? 'Someone',
          handle: r.handle,
          avatarUrl: r.avatar_url,
        },
        // Your own, or anything on a showcase of yours: your post, your space.
        canRemove: r.author_id === viewerId || mine,
      })),
    };
  }

  /** Say something. Refused when the author has turned comments off. */
  async add(viewerId: string, showcaseId: string, body: string): Promise<Comment[]> {
    const showcase = await this.showcases.one(viewerId, showcaseId);
    if (!showcase.allowComments) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'COMMENTS_OFF',
        message: 'Comments are off for this post.',
      });
    }

    const trimmed = body.trim();
    // The column refuses this too; catching it here is what turns a 500 into
    // an answer.
    if (trimmed.length === 0) throw new BadRequestException('Write something first.');

    await this.db.query(
      'insert into showcase_comments (showcase_id, user_id, body) values ($1, $2, $3)',
      [showcaseId, viewerId, trimmed],
    );
    const { data } = await this.list(viewerId, showcaseId);
    return data;
  }

  /**
   * Remove one.
   *
   * Your own, or any on a showcase of yours. Both in the same statement, so a
   * comment that is neither answers the same way as one that does not exist —
   * a 404 either way tells nobody whose it was.
   */
  async remove(viewerId: string, showcaseId: string, commentId: string): Promise<Comment[]> {
    const gone = await this.db.query(
      `delete from showcase_comments c
        using showcases s
        where c.showcase_id = s.id
          and c.id = $1
          and c.showcase_id = $2
          and (c.user_id = $3 or s.user_id = $3)
        returning c.id`,
      [commentId, showcaseId, viewerId],
    );
    if (gone.length === 0) throw new NotFoundException('Comment not found');
    const { data } = await this.list(viewerId, showcaseId);
    return data;
  }
}
