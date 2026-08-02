import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FriendsService } from '../friends/friends.service';
import { MailConfig } from '../mail/mail.config';
import { eventInvite } from '../mail/mail.templates';
import { NotifyService } from '../notifications/notify.service';

export type AttendeeStatus = 'pending' | 'accepted' | 'declined';

export interface Attendee {
  id: string;
  event_id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  status: AttendeeStatus;
  responded_at: Date | null;
  invited_by: string;
}

export interface EventInvitation {
  id: string;
  event_id: string;
  status: AttendeeStatus;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string | null;
  event_type: string;
  /** Who sent it — an invitation with no name attached is unanswerable. */
  inviter_name: string;
  created_at: Date;
}

/**
 * Invitations to a scheduled event.
 *
 * Separate from ScheduleEventsService, which owns the events themselves. This
 * is about people: who was asked, who accepted, and who needs telling.
 *
 * Friends only, the same rule as workspace collaborators and chat. Being able
 * to put an event on a stranger's calendar is a spam vector, not a feature.
 */
@Injectable()
export class EventAttendeesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly friends: FriendsService,
    private readonly notifier: NotifyService,
    private readonly mailConfig: MailConfig,
  ) {}

  /** Throws unless the caller owns the event. Only the owner may invite. */
  private async assertOwner(userId: string, eventId: string) {
    const row = await this.db.queryOne<{
      id: string;
      title: string;
      event_date: string;
      event_time: string | null;
    }>(
      'select id, title, event_date, event_time from schedule_events where id = $1 and user_id = $2',
      [eventId, userId],
    );
    if (!row) throw new NotFoundException('Event not found');
    return row;
  }

  /**
   * Invites people to an event.
   *
   * Re-inviting someone who declined resets them to pending, which is what
   * "ask again" should mean; someone who already accepted is left alone rather
   * than being silently un-accepted.
   */
  async invite(
    userId: string,
    eventId: string,
    inviteeIds: string[],
  ): Promise<{ invited: number }> {
    const event = await this.assertOwner(userId, eventId);

    const unique = [...new Set(inviteeIds)].filter((id) => id !== userId);
    if (unique.length === 0) {
      throw new BadRequestException('Choose at least one person to invite');
    }

    for (const id of unique) {
      if (!(await this.friends.areFriends(userId, id))) {
        throw new ForbiddenException(
          'You can only invite people you are friends with',
        );
      }
    }

    const rows = await this.db.query<{ user_id: string }>(
      `insert into event_attendees (event_id, user_id, invited_by, status)
       select $1, unnest($2::uuid[]), $3, 'pending'
       on conflict (event_id, user_id) do update
         set status = case
               -- Asking again un-declines; it does not undo a yes.
               when event_attendees.status = 'declined' then 'pending'
               else event_attendees.status
             end,
             responded_at = case
               when event_attendees.status = 'declined' then null
               else event_attendees.responded_at
             end,
             invited_by = excluded.invited_by
       returning user_id`,
      [eventId, unique, userId],
    );

    await this.notifyInvitees(userId, event, rows.map((r) => r.user_id));
    return { invited: rows.length };
  }

  /** Accepts or declines. Only the invitee may answer their own invitation. */
  async respond(
    userId: string,
    eventId: string,
    accept: boolean,
  ): Promise<{ status: AttendeeStatus }> {
    const status: AttendeeStatus = accept ? 'accepted' : 'declined';

    const row = await this.db.queryOne<{ id: string; invited_by: string }>(
      `update event_attendees
          set status = $3, responded_at = now()
        where event_id = $1 and user_id = $2
        returning id, invited_by`,
      [eventId, userId, status],
    );
    if (!row) throw new NotFoundException('Invitation not found');

    await this.notifyOrganiser(userId, eventId, row.invited_by, status);
    return { status };
  }

  /**
   * Who is invited, and what they said.
   *
   * Visible to the organiser and to anyone invited — an attendee deciding
   * whether to go usually wants to know who else is coming.
   */
  async attendees(userId: string, eventId: string): Promise<Attendee[]> {
    const allowed = await this.db.queryOne<{ ok: boolean }>(
      `select true as ok
         from schedule_events e
        where e.id = $1
          and (e.user_id = $2
               or exists (select 1 from event_attendees a
                           where a.event_id = e.id and a.user_id = $2))`,
      [eventId, userId],
    );
    if (!allowed) throw new NotFoundException('Event not found');

    return this.db.query<Attendee>(
      `select a.id, a.event_id, a.user_id, a.status, a.responded_at, a.invited_by,
              coalesce(u.display_name, split_part(u.email, '@', 1)) as name,
              u.avatar_url
         from event_attendees a
         join users u on u.id = a.user_id
        where a.event_id = $1
        order by a.status, name`,
      [eventId],
    );
  }

  /**
   * Events the caller has been invited to.
   *
   * Past events are excluded: an invitation to something that already happened
   * is not a decision anyone can still make.
   */
  async invitations(
    userId: string,
    status: AttendeeStatus = 'pending',
  ): Promise<EventInvitation[]> {
    return this.db.query<EventInvitation>(
      `select a.id, a.event_id, a.status, a.created_at,
              e.title, e.description, e.event_date, e.event_time, e.event_type,
              coalesce(o.display_name, split_part(o.email, '@', 1)) as inviter_name
         from event_attendees a
         join schedule_events e on e.id = a.event_id
         join users o on o.id = a.invited_by
        where a.user_id = $1
          and a.status = $2
          and e.event_date >= current_date
        order by e.event_date, e.event_time nulls last`,
      [userId, status],
    );
  }

  /** Withdraws an invitation. Organiser only. */
  async remove(
    userId: string,
    eventId: string,
    attendeeUserId: string,
  ): Promise<{ removed: boolean }> {
    await this.assertOwner(userId, eventId);
    const rows = await this.db.query<{ id: string }>(
      'delete from event_attendees where event_id = $1 and user_id = $2 returning id',
      [eventId, attendeeUserId],
    );
    return { removed: rows.length > 0 };
  }

  /**
   * Events the caller is going to but does not own.
   *
   * Folded into the schedule so an accepted invitation shows up on the
   * calendar rather than only in a list of invitations.
   */
  async acceptedEventIds(userId: string): Promise<string[]> {
    const rows = await this.db.query<{ event_id: string }>(
      `select event_id from event_attendees where user_id = $1 and status = 'accepted'`,
      [userId],
    );
    return rows.map((r) => r.event_id);
  }

  /** Best-effort: a failed notification must not undo a stored invitation. */
  private async notifyInvitees(
    organiserId: string,
    event: { id: string; title: string; event_date: string; event_time: string | null },
    inviteeIds: string[],
  ): Promise<void> {
    if (inviteeIds.length === 0) return;
    try {
      const organiser = await this.db.queryOne<{ name: string }>(
        `select coalesce(display_name, split_part(email, '@', 1)) as name
           from users where id = $1`,
        [organiserId],
      );

      const when = event.event_time
        ? `${event.event_date} at ${event.event_time.slice(0, 5)}`
        : event.event_date;
      const who = organiser?.name ?? 'Someone';

      await this.notifier.notify(inviteeIds, {
        topic: 'event-invite',
        title: `${who} invited you`,
        body: `${event.title} — ${when}`,
        data: { type: 'event_invite', eventId: event.id },
        email: eventInvite({
          inviterName: who,
          eventTitle: event.title,
          when,
          url: `${this.mailConfig.appUrl}/schedule`,
        }),
      });
    } catch {
      // Swallowed on purpose — see above.
    }
  }

  private async notifyOrganiser(
    responderId: string,
    eventId: string,
    organiserId: string,
    status: AttendeeStatus,
  ): Promise<void> {
    try {
      const meta = await this.db.queryOne<{ name: string; title: string }>(
        `select coalesce(u.display_name, split_part(u.email, '@', 1)) as name,
                e.title
           from users u, schedule_events e
          where u.id = $1 and e.id = $2`,
        [responderId, eventId],
      );

      await this.notifier.notify([organiserId], {
        topic: 'event-response',
        title: `${meta?.name ?? 'Someone'} ${status} your invitation`,
        body: meta?.title ?? 'Event',
        data: { type: 'event_response', eventId, accepted: status === 'accepted' },
      });
    } catch {
      // Swallowed on purpose.
    }
  }
}
