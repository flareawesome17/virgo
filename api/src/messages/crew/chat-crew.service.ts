import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { HOLDS_ROLE } from '../../hiring/holds-role';
import { MailConfig } from '../../mail/mail.config';
import { MessagesService } from '../messages.service';

/** Hired people a job needs before its poster can start a crew chat. */
export const MIN_CREW = 2;

/**
 * Crew chats: groups that belong to something, and follow it.
 *
 * A workspace's team chat. Made the moment a second person joins the
 * workspace, with its owner as admin and everyone in it except clients; from
 * then on people join and leave it as they join and leave the workspace, and
 * it carries the workspace's name. An admin can still add a client, or take
 * somebody out.
 *
 * A job's crew chat. Started by its poster once two or more people are hired
 * on it: everyone hired and the poster, with the job card first. Anybody hired
 * later joins it, and somebody whose booking falls through leaves it.
 *
 * The workspace and hiring code call in after their own change has landed.
 * Everything here is best-effort from their side: a chat that could not be
 * kept in step must never undo somebody joining a workspace or being hired.
 */
@Injectable()
export class ChatCrewService {
  private readonly log = new Logger(ChatCrewService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly messages: MessagesService,
    private readonly mail: MailConfig,
  ) {}

  // ─── Team chats ────────────────────────────────────────────────────────────

  /**
   * Somebody accepted a workspace's invitation, or stopped being a client in
   * it. Puts them in its team chat, making the chat if this is its second
   * person.
   */
  async workspaceJoined(workspaceId: string, userId: string): Promise<void> {
    try {
      const ws = await this.workspace(workspaceId);
      if (!ws) return;
      const member = await this.db.queryOne<{ role: string }>(
        `select role from collaborators
          where workspace_id = $1 and collaborator_user_id = $2 and status = 'accepted'`,
        [workspaceId, userId],
      );
      // Clients stay out unless an admin adds them.
      if (!member || member.role === 'client') return;

      const chat = await this.teamChat(workspaceId);
      if (chat) {
        await this.messages.joinLinked(
          chat,
          userId,
          `${await this.nameOf(userId)} joined ${ws.name} and this chat`,
          { event: 'joined', via: 'workspace', subjectId: userId },
        );
        return;
      }

      const team = await this.db.query<{ user_id: string }>(
        `select collaborator_user_id as user_id from collaborators
          where workspace_id = $1
            and status = 'accepted'
            and role <> 'client'
            and collaborator_user_id is not null
            and collaborator_user_id <> $2`,
        [workspaceId, ws.ownerId],
      );
      if (team.length === 0) return;
      const made = await this.messages.createLinkedGroup({
        createdBy: ws.ownerId,
        title: ws.name,
        memberIds: team.map((t) => t.user_id),
        workspaceId,
      });
      if (made.created) {
        await this.messages.postNotice(
          made.id,
          ws.ownerId,
          `Team chat for ${ws.name}. People join and leave it with the workspace.`,
          { event: 'team-chat', workspaceId },
        );
      } else {
        // Somebody else's join made it a moment ago.
        await this.messages.joinLinked(
          made.id,
          userId,
          `${await this.nameOf(userId)} joined ${ws.name} and this chat`,
          { event: 'joined', via: 'workspace', subjectId: userId },
        );
      }
    } catch (err) {
      this.log.warn(`Team chat not updated for ${workspaceId}: ${String(err)}`);
    }
  }

  /** Somebody left a workspace, or its owner took them off it. */
  async workspaceLeft(workspaceId: string, userId: string): Promise<void> {
    try {
      const chat = await this.teamChat(workspaceId);
      if (!chat) return;
      const ws = await this.workspace(workspaceId, true);
      await this.messages.departLinked(
        chat,
        userId,
        `${await this.nameOf(userId)} left ${ws?.name ?? 'the workspace'} and this chat`,
        { event: 'left', via: 'workspace', subjectId: userId },
      );
    } catch (err) {
      this.log.warn(`Team chat not updated for ${workspaceId}: ${String(err)}`);
    }
  }

  /** The workspace was renamed; its team chat goes by the new name. */
  async workspaceRenamed(workspaceId: string, name: string): Promise<void> {
    try {
      const chat = await this.teamChat(workspaceId);
      if (chat) await this.messages.renameLinked(chat, name);
    } catch (err) {
      this.log.warn(`Team chat not renamed for ${workspaceId}: ${String(err)}`);
    }
  }

  private async teamChat(workspaceId: string): Promise<string | null> {
    const row = await this.db.queryOne<{ id: string }>(
      'select id from conversations where workspace_id = $1',
      [workspaceId],
    );
    return row?.id ?? null;
  }

  /** A workspace that is not in Recently deleted, unless `anyState`. */
  private async workspace(
    workspaceId: string,
    anyState = false,
  ): Promise<{ name: string; ownerId: string } | null> {
    const row = await this.db.queryOne<{ name: string; user_id: string }>(
      `select name, user_id from workspaces
        where id = $1 and ($2::boolean or deleted_at is null)`,
      [workspaceId, anyState],
    );
    return row ? { name: row.name?.trim() || 'the workspace', ownerId: row.user_id } : null;
  }

  // ─── Crew chats ────────────────────────────────────────────────────────────

  /**
   * Starts the crew chat for one of the caller's job posts, or opens the one
   * it has. Everyone hired on it and the poster, with the job card first.
   * A poster who left it is put back.
   */
  async startCrew(userId: string, postId: string): Promise<{ id: string }> {
    const post = await this.db.queryOne<{ id: string; title: string; slug: string }>(
      'select id, title, slug from hiring_posts where id = $1 and user_id = $2',
      [postId, userId],
    );
    if (!post) throw new NotFoundException('Job post not found');

    const existing = await this.crewChat(postId);
    if (existing) {
      await this.messages.joinLinked(
        existing,
        userId,
        `${await this.nameOf(userId)} joined`,
        { event: 'joined', via: 'crew', subjectId: userId },
      );
      return { id: existing };
    }

    const hired = await this.hiredOn(postId, userId);
    if (hired.length < MIN_CREW) {
      throw new BadRequestException(`Hire at least ${MIN_CREW} people to start a crew chat`);
    }
    const made = await this.messages.createLinkedGroup({
      createdBy: userId,
      title: `${post.title} crew`,
      memberIds: hired,
      hiringPostId: postId,
    });
    if (made.created) {
      await this.messages.postNotice(
        made.id,
        userId,
        `${await this.nameOf(userId)} started this chat for everyone hired on ${post.title}`,
        { event: 'crew-chat', postId },
      );
      // The job card goes first. Sent like any card, so everyone hired is
      // pushed: it is how they hear the crew chat exists.
      try {
        await this.messages.send(
          userId,
          made.id,
          `Job post: ${post.title}\n${this.mail.siteUrl}/jobs/${post.slug}`,
          { card: { kind: 'job-post', context: { postId } } },
        );
      } catch (err) {
        this.log.warn(`No job card in the crew chat for ${postId}: ${String(err)}`);
      }
    }
    return { id: made.id };
  }

  /** Somebody was hired on a job. Into its crew chat, if it has one. */
  async hired(postId: string, userId: string): Promise<void> {
    try {
      const chat = await this.crewChat(postId);
      if (!chat) return;
      await this.messages.joinLinked(
        chat,
        userId,
        `${await this.nameOf(userId)} joined the crew`,
        { event: 'joined', via: 'crew', subjectId: userId },
      );
    } catch (err) {
      this.log.warn(`Crew chat not updated for ${postId}: ${String(err)}`);
    }
  }

  /**
   * A booking on a job was cancelled. Out of its crew chat, unless they are
   * still hired on it for another role.
   */
  async unbooked(postId: string, userId: string): Promise<void> {
    try {
      const chat = await this.crewChat(postId);
      if (!chat) return;
      const still = await this.db.queryOne<{ held: boolean }>(
        `select exists (select 1 from hiring_applications a
                         where a.post_id = $1 and a.user_id = $2 and ${HOLDS_ROLE('a')}) as held`,
        [postId, userId],
      );
      if (still?.held) return;
      await this.messages.departLinked(
        chat,
        userId,
        `${await this.nameOf(userId)} is no longer on this job`,
        { event: 'left', via: 'crew', subjectId: userId },
      );
    } catch (err) {
      this.log.warn(`Crew chat not updated for ${postId}: ${String(err)}`);
    }
  }

  private async crewChat(postId: string): Promise<string | null> {
    const row = await this.db.queryOne<{ id: string }>(
      'select id from conversations where hiring_post_id = $1',
      [postId],
    );
    return row?.id ?? null;
  }

  /** Everyone holding a role on the post, once each, not counting its poster. */
  private async hiredOn(postId: string, posterId: string): Promise<string[]> {
    const rows = await this.db.query<{ user_id: string }>(
      `select distinct a.user_id
         from hiring_applications a
        where a.post_id = $1 and a.user_id <> $2 and ${HOLDS_ROLE('a')}`,
      [postId, posterId],
    );
    return rows.map((r) => r.user_id);
  }

  private async nameOf(userId: string): Promise<string> {
    const row = await this.db.queryOne<{ name: string }>(
      `select coalesce(display_name, split_part(email, '@', 1)) as name from users where id = $1`,
      [userId],
    );
    return row?.name ?? 'Someone';
  }
}
