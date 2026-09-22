import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FriendsService } from '../friends/friends.service';
import { MailConfig } from '../mail/mail.config';
import { hireEnquiry } from '../mail/mail.templates';
import { MessagesService } from '../messages/messages.service';
import { NotifyService } from '../notifications/notify.service';
import { blockedBetween, PAIR_LOCK_SQL } from '../safety/block-sql';
import { BlocksService } from '../safety/blocks.service';

export interface HireEnquiry {
  id: string;
  direction: 'received' | 'sent';
  /** The other party — whoever the caller is not. */
  personName: string;
  personAvatarUrl: string | null;
  personHandle: string | null;
  roleWanted: string | null;
  eventDate: string | null;
  budget: string | null;
  message: string;
  status: 'new' | 'accepted' | 'declined';
  createdAt: string;
  respondedAt: string | null;
  /** Set on an accepted enquiry, so the UI can jump straight into the chat. */
  conversationId: string | null;
}

interface EnquiryRow {
  id: string;
  from_user_id: string;
  to_user_id: string;
  role_wanted: string | null;
  /**
   * `YYYY-MM-DD`, not a Date. The pool parses `date` columns as raw strings
   * (database.service.ts) precisely so a day never picks up a timezone on the
   * way through — "the shoot is on the 14th" must not become the 13th.
   */
  event_date: string | null;
  budget: string | null;
  message: string;
  status: 'new' | 'accepted' | 'declined';
  created_at: Date;
  responded_at: Date | null;
  person_name: string | null;
  person_email: string;
  person_avatar_url: string | null;
  person_handle: string | null;
}

@Injectable()
export class HireService {
  private readonly logger = new Logger(HireService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly friends: FriendsService,
    private readonly messages: MessagesService,
    private readonly notifier: NotifyService,
    private readonly mailConfig: MailConfig,
    private readonly blocks: BlocksService,
  ) {}

  /**
   * Sends an enquiry.
   *
   * Only to someone whose profile is published. The button exists on the public
   * page, so accepting an arbitrary `toUserId` would turn this into a way to
   * message any account on Virgo without being connected — exactly what the
   * friendship gate exists to prevent.
   *
   * The same 404 for a paused or suspended profile and for one on the other
   * side of a block, either way round — the rule the profile page itself
   * applies, so this cannot tell anyone more than that page does.
   */
  async send(
    fromUserId: string,
    input: {
      handle: string;
      message: string;
      roleWanted?: string;
      eventDate?: string;
      budget?: string;
    },
  ): Promise<HireEnquiry> {
    const message = input.message?.trim();
    if (!message) {
      throw new BadRequestException('Say what the job is');
    }

    const target = await this.db.queryOne<{ id: string; roles: string[] | null }>(
      `select u.id, u.roles from users u
        where lower(u.handle) = lower($1)
          and u.public_profile = true
          and (u.disabled_until is null or u.disabled_until <= now())
          and u.suspended_at is null
          and not ${blockedBetween('$2', 'u.id')}`,
      [input.handle, fromUserId],
    );
    if (!target) throw new NotFoundException('Profile not found');

    if (target.id === fromUserId) {
      throw new BadRequestException('That is your own profile');
    }

    // A role they do not list is a typo or a probe, and storing it would put
    // words in their mouth on their own enquiry screen.
    const roleWanted =
      input.roleWanted && (target.roles ?? []).includes(input.roleWanted)
        ? input.roleWanted
        : null;

    let row: EnquiryRow | null;
    try {
      row = await this.db.queryOne<EnquiryRow>(
        `insert into hire_enquiries
           (from_user_id, to_user_id, role_wanted, event_date, message, budget)
         values ($1, $2, $3, $4, $5, $6)
         returning *`,
        [
          fromUserId,
          target.id,
          roleWanted,
          input.eventDate || null,
          message,
          input.budget?.trim() || null,
        ],
      );
    } catch (err) {
      // The partial unique index, not a pre-check: two sends racing each other
      // both pass a select and only one can pass this.
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException(
          'You already have an open enquiry with them. Wait for a reply.',
        );
      }
      throw err;
    }

    const me = await this.account(fromUserId);
    const name = me ? this.nameFor(me) : 'Someone';

    await this.notifier.notify([target.id], {
      topic: 'hire-enquiry',
      title: 'New hire enquiry',
      body: roleWanted
        ? `${name} is looking for a ${roleWanted.toLowerCase()}`
        : `${name} wants to work with you`,
      data: { type: 'hire_enquiry', enquiryId: row!.id, fromUserId },
      email: hireEnquiry({
        fromName: name,
        roleWanted,
        when: input.eventDate ? this.readableDate(input.eventDate) : null,
        url: `${this.mailConfig.appUrl}/network?tab=enquiries`,
      }),
    });

    this.logger.log(`hire enquiry ${row!.id} sent to ${target.id}`);
    // Re-read rather than presenting the INSERT's own row: `returning *` has no
    // joined person columns, so the sender would get their new enquiry back
    // labelled "Someone" instead of the name they just wrote to.
    return this.present(await this.byId(row!.id, fromUserId), fromUserId, null);
  }

  /**
   * Both inboxes for the caller — what they were sent and what they sent.
   *
   * An enquiry still open or turned down is hidden across a block, and while
   * the other side is suspended; lifting the suspension brings it back. An
   * accepted one stays: it is agreed work, with a chat behind it.
   */
  async list(userId: string): Promise<HireEnquiry[]> {
    const rows = await this.db.query<EnquiryRow & { conversation_id: string | null }>(
      `select e.*,
              other.display_name as person_name,
              other.email        as person_email,
              other.avatar_url   as person_avatar_url,
              -- Only a published handle: an unpublished one is not a link,
              -- and handing it out names a profile its owner has not chosen
              -- to show.
              case when other.public_profile then other.handle end as person_handle,
              (select c.id
                 from conversations c
                 join conversation_participants a
                   on a.conversation_id = c.id and a.user_id = e.from_user_id
                 join conversation_participants b
                   on b.conversation_id = c.id and b.user_id = e.to_user_id
                where c.is_group = false
                limit 1) as conversation_id
         from hire_enquiries e
         join users other
           on other.id = case when e.from_user_id = $1
                              then e.to_user_id else e.from_user_id end
        where (e.from_user_id = $1 or e.to_user_id = $1)
          and (e.status = 'accepted'
               or (not ${blockedBetween('e.from_user_id', 'e.to_user_id')}
                   and other.suspended_at is null))
        order by e.created_at desc
        limit 200`,
      [userId],
    );

    return rows.map((row) => this.present(row, userId, row.conversation_id));
  }

  /**
   * Accepts an enquiry — the moment two strangers become collaborators.
   *
   * One transaction for the status and the friendship. Split across two, a
   * failure halfway leaves an enquiry marked accepted with no way to talk to
   * the person who sent it, which reads to both sides as the feature being
   * broken.
   *
   * The pair lock comes first, before the enquiry row is touched (see
   * PAIR_LOCK_SQL): a block takes the same lock and then declines this same
   * row, and taking the two in opposite orders is a deadlock. Under the lock
   * the pair is checked again, and the update only moves an enquiry still at
   * 'new', so a block or a second tap that got there first wins cleanly.
   */
  async accept(userId: string, id: string): Promise<HireEnquiry> {
    const enquiry = await this.db.queryOne<{ from_user_id: string; status: string }>(
      'select from_user_id, status from hire_enquiries where id = $1 and to_user_id = $2',
      [id, userId],
    );
    // Same answer for "not yours" and "does not exist", so an id cannot be
    // tested for existence by anyone it was not sent to.
    if (!enquiry) throw new NotFoundException('Enquiry not found');

    await this.db.transaction(async (client) => {
      await client.query(PAIR_LOCK_SQL, [userId, enquiry.from_user_id]);
      // A block either way, or either account suspended, reads as the enquiry
      // not being there — the same 404 as any other miss.
      if (await this.blocks.unavailable(userId, enquiry.from_user_id, client)) {
        throw new NotFoundException('Enquiry not found');
      }

      const moved = await client.query<{ id: string }>(
        `update hire_enquiries
            set status = 'accepted', responded_at = now()
          where id = $1 and to_user_id = $2 and status = 'new'
          returning id`,
        [id, userId],
      );
      if (moved.rows.length === 0) {
        const current = await client.query<{ status: string }>(
          'select status from hire_enquiries where id = $1',
          [id],
        );
        throw new BadRequestException(
          `That enquiry is already ${current.rows[0]?.status ?? enquiry.status}`,
        );
      }

      // This client already holds the pair lock, so connect() taking it again
      // returns at once.
      await this.friends.connect(userId, enquiry.from_user_id, client);
    });

    // Outside the transaction: openDirect runs its own, and it is idempotent —
    // a retry finds the conversation the first attempt made.
    //
    // A 403 here means a block landed in the moment after the commit. The
    // acceptance stands, since it was made first, but nobody is sent into a
    // chat the block has closed and nobody is told.
    const conversation = await this.messages
      .openDirect(userId, enquiry.from_user_id)
      .catch((err: unknown) => {
        if (err instanceof ForbiddenException) return null;
        throw err;
      });
    if (!conversation) {
      return this.present(await this.byId(id, userId), userId, null);
    }

    const me = await this.account(userId);
    await this.notifier.notify([enquiry.from_user_id], {
      topic: 'hire-response',
      title: 'Enquiry accepted',
      body: `${me ? this.nameFor(me) : 'They'} accepted your enquiry — you can chat now`,
      data: {
        type: 'hire_response',
        enquiryId: id,
        fromUserId: userId,
        conversationId: conversation.id,
      },
    });

    this.logger.log(`hire enquiry ${id} accepted by ${userId}`);
    const fresh = await this.byId(id, userId);
    return this.present(fresh, userId, conversation.id);
  }

  /**
   * Declines, silently.
   *
   * The sender sees the status change if they look, and gets nothing pushed at
   * them — the same choice already made for declined friend requests. "X turned
   * you down" is a notification nobody has ever wanted to receive.
   *
   * Across a block the enquiry is not there, as it is not in the list. No pair
   * lock: this writes one row, only while it is still 'new', and connects
   * nobody.
   */
  async decline(userId: string, id: string): Promise<HireEnquiry> {
    const row = await this.db.queryOne<EnquiryRow>(
      'select * from hire_enquiries where id = $1 and to_user_id = $2',
      [id, userId],
    );
    // Same answer for "not yours" and "does not exist", so an id cannot be
    // tested for existence by anyone it was not sent to.
    if (!row) throw new NotFoundException('Enquiry not found');
    if (await this.blocks.between(userId, row.from_user_id)) {
      throw new NotFoundException('Enquiry not found');
    }
    if (row.status !== 'new') {
      throw new BadRequestException(`That enquiry is already ${row.status}`);
    }

    const moved = await this.db.query<{ id: string }>(
      `update hire_enquiries
          set status = 'declined', responded_at = now()
        where id = $1 and status = 'new'
        returning id`,
      [id],
    );
    if (moved.length === 0) {
      // Answered since it was read: accepted on another device, or closed by a
      // block.
      const current = await this.db.queryOne<{ status: string }>(
        'select status from hire_enquiries where id = $1',
        [id],
      );
      throw new BadRequestException(
        `That enquiry is already ${current?.status ?? 'answered'}`,
      );
    }

    return this.present(await this.byId(id, userId), userId, null);
  }

  private async byId(id: string, viewerId: string): Promise<EnquiryRow> {
    const row = await this.db.queryOne<EnquiryRow>(
      `select e.*,
              other.display_name as person_name,
              other.email        as person_email,
              other.avatar_url   as person_avatar_url,
              case when other.public_profile then other.handle end as person_handle
         from hire_enquiries e
         join users other
           on other.id = case when e.from_user_id = $2
                              then e.to_user_id else e.from_user_id end
        where e.id = $1`,
      [id, viewerId],
    );
    if (!row) throw new NotFoundException('Enquiry not found');
    return row;
  }

  private present(
    row: EnquiryRow,
    viewerId: string,
    conversationId: string | null,
  ): HireEnquiry {
    return {
      id: row.id,
      direction: row.from_user_id === viewerId ? 'sent' : 'received',
      personName: row.person_name?.trim() || row.person_email?.split('@')[0] || 'Someone',
      personAvatarUrl: row.person_avatar_url ?? null,
      personHandle: row.person_handle ?? null,
      roleWanted: row.role_wanted,
      eventDate: row.event_date,
      budget: row.budget,
      message: row.message,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      respondedAt: row.responded_at?.toISOString() ?? null,
      conversationId,
    };
  }

  private readableDate(iso: string): string | null {
    const date = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-PH', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }

  private async account(
    id: string,
  ): Promise<{ email: string; display_name: string | null } | null> {
    return this.db.queryOne<{ email: string; display_name: string | null }>(
      'select email, display_name from users where id = $1',
      [id],
    );
  }

  private nameFor(account: { email: string; display_name: string | null }): string {
    return account.display_name?.trim() || account.email.split('@')[0];
  }
}
