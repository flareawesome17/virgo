import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ShowcasesService } from './showcases.service';

/**
 * Likes.
 *
 * The light half of the pair. Keeping asks somebody to choose a shelf and say
 * why; a like costs one tap. Both exist because they say different things, and
 * a feed with only one of them either collects no signal or collects no taste.
 *
 * Liking your own work is allowed, unlike keeping it. Keeping is refused
 * because kept_count orders the feed and self-keeping would be a promotion
 * lever; likes rank nothing, and refusing somebody their own post is a
 * surprise with nothing behind it.
 */
@Injectable()
export class LikesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly showcases: ShowcasesService,
  ) {}

  /**
   * Like it, and answer with the count as it now stands.
   *
   * Read as the viewer first, so everything that hides a showcase — unpublished,
   * taken down, connections-only, a block either way — also stops it being
   * liked. Without that, a like is a way to confirm something exists that you
   * were not allowed to see.
   */
  async like(userId: string, showcaseId: string): Promise<{ likeCount: number; liked: boolean }> {
    await this.showcases.one(userId, showcaseId);
    await this.db.query(
      `insert into showcase_likes (showcase_id, user_id) values ($1, $2)
       on conflict (showcase_id, user_id) do nothing`,
      [showcaseId, userId],
    );
    return this.state(userId, showcaseId);
  }

  /**
   * Take it back.
   *
   * No visibility read here: unliking something you can no longer see must
   * still work, or a showcase that went connections-only would leave a like
   * you had no way to remove.
   */
  async unlike(userId: string, showcaseId: string): Promise<{ likeCount: number; liked: boolean }> {
    await this.db.query(
      'delete from showcase_likes where showcase_id = $1 and user_id = $2',
      [showcaseId, userId],
    );
    return this.state(userId, showcaseId);
  }

  /**
   * Which of these the viewer has liked.
   *
   * One lookup for a whole feed page, so a card draws its heart in the right
   * state without a query each.
   */
  async likedAmong(userId: string, showcaseIds: string[]): Promise<string[]> {
    if (showcaseIds.length === 0) return [];
    const rows = await this.db.query<{ showcase_id: string }>(
      `select showcase_id from showcase_likes
        where user_id = $1 and showcase_id = any($2::uuid[])`,
      [userId, showcaseIds],
    );
    return rows.map((r) => r.showcase_id);
  }

  /** The count the trigger has just recomputed, and whether this viewer is in it. */
  private async state(
    userId: string,
    showcaseId: string,
  ): Promise<{ likeCount: number; liked: boolean }> {
    const row = await this.db.queryOne<{ like_count: number; liked: boolean }>(
      `select s.like_count,
              exists (
                select 1 from showcase_likes l
                 where l.showcase_id = s.id and l.user_id = $2
              ) as liked
         from showcases s where s.id = $1`,
      [showcaseId, userId],
    );
    return { likeCount: Number(row?.like_count ?? 0), liked: row?.liked ?? false };
  }
}
