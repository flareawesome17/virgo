import {
  BadRequestException,
  ConflictException,
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
  ) {}

  /**
   * Sends an enquiry.
   *
   * Only to someone whose profile is published. The button exists on the public
   * page, so accepting an arbitrary `toUserId` would turn this into a way to
   * message any account on Virgo without being connected — exactly what the
   * friendship gate exists to prevent.
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
      `select id, roles from users
        where lower(handle) = lower($1)
          and public_profile = true
          and (disabled_until is null or disabled_until <= now())`,
      [input.handle],
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

  /** Both inboxes for the caller — what they were sent and what they sent. */
  async list(userId: string): Promise<HireEnquiry[]> {
    const rows = await this.db.query<EnquiryRow & { conversation_id: string | null }>(
      `select e.*,
              other.display_name as person_name,
              other.email        as person_email,
              other.avatar_url   as person_avatar_url,
              other.handle       as person_handle,
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
        where e.from_user_id = $1 or e.to_user_id = $1
        order by e.created_at desc
        limit 200`,
      [userId],
    );

    return rows.map((row) => this.present(row, userId, row.conversation_id));
  }

  /**
   * Accepts an enquiry — the moment two strangers become collaborators.
   *
   * One transaction for the status, the friendship and the conversation. Split
   * across three, a failure halfway leaves an enquiry marked accepted with no
   * way to talk to the person who sent it, which reads to both sides as the
   * feature being broken.
   */
  async accept(userId: string, id: string): Promise<HireEnquiry> {
    const enquiry = await this.forRecipient(userId, id);

    await this.db.transaction(async (client) => {
      await client.query(
        `update hire_enquiries
            set status = 'accepted', responded_at = now()
          where id = $1`,
        [id],
      );
      await this.friends.connect(userId, enquiry.from_user_id, client);
    });

    // Outside the transaction: openDirect runs its own, and it is idempotent —
    // a retry finds the conversation the first attempt made.
    const conversation = await this.messages.openDirect(
      userId,
      enquiry.from_user_id,
    );

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
   */
  async decline(userId: string, id: string): Promise<HireEnquiry> {
    await this.forRecipient(userId, id);

    await this.db.query(
      `update hire_enquiries
          set status = 'declined', responded_at = now()
        where id = $1`,
      [id],
    );

    return this.present(await this.byId(id, userId), userId, null);
  }

  /** An enquiry the caller is the recipient of, and has not answered yet. */
  private async forRecipient(userId: string, id: string): Promise<EnquiryRow> {
    const row = await this.db.queryOne<EnquiryRow>(
      'select * from hire_enquiries where id = $1 and to_user_id = $2',
      [id, userId],
    );
    // Same answer for "not yours" and "does not exist", so an id cannot be
    // tested for existence by anyone it was not sent to.
    if (!row) throw new NotFoundException('Enquiry not found');
    if (row.status !== 'new') {
      throw new BadRequestException(`That enquiry is already ${row.status}`);
    }
    return row;
  }

  private async byId(id: string, viewerId: string): Promise<EnquiryRow> {
    const row = await this.db.queryOne<EnquiryRow>(
      `select e.*,
              other.display_name as person_name,
              other.email        as person_email,
              other.avatar_url   as person_avatar_url,
              other.handle       as person_handle
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
