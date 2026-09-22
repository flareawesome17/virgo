import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FriendsService } from '../friends/friends.service';
import { MailConfig } from '../mail/mail.config';
import { eventChanged, eventInvite } from '../mail/mail.templates';
import { NotifyService } from '../notifications/notify.service';
import { blockedBetween, PAIR_LOCK_SQL } from '../safety/block-sql';
import { BlocksService } from '../safety/blocks.service';

export type AttendeeStatus = 'pending' | 'accepted' | 'declined';

/**
 * `2026-08-25` + `09:00:00` -> `2026-08-25 at 09:00`.
 *
 * Shared so the invite email and the change email cannot describe the same
 * event two different ways. An event with no time is a whole day, and saying
 * "at 00:00" about one would be inventing precision.
 */
function formatWhen(date: string, time: string | null): string {
  return time ? `${date} at ${time.slice(0, 5)}` : date;
}

/**
 * `['the title', 'the notes']` -> `"the title and the notes"`.
 *
 * Oxford comma from three items, because "the date and time, the title and the
 * notes" reads as two things until you get to the end of it.
 */
function listChanges(items: readonly string[]): string {
  if (items.length === 0) return 'something';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

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
  /** Set only when `event_type` is `other`; what the organiser called it. */
  event_type_other: string | null;
  /** Where it happens. Usually the first thing an invitee wants to know. */
  location: string | null;
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
    private readonly blocks: BlocksService,
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
   *
   * Refused when it would put two people on either side of a block on the
   * same event, the way a group chat refuses such a member.
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

    // Each invitee is the organiser's friend, which rules out a block with the
    // organiser. One of them may still have blocked, or been blocked by,
    // somebody already on the event — or somebody else in this batch — and an
    // event puts them in front of each other: on the guest list, and in the
    // push and email every edit sends. The same rule as adding someone to a
    // group chat, and like it the answer says only that some pair cannot be
    // together, not which.
    //
    // Only people joining are checked. Anyone already pending or accepted is
    // on the event whatever happens here, and asking them again must not start
    // failing because of a block that came after they were invited.
    const clash = await this.db.queryOne<{ blocked: boolean }>(
      `with party as (
         select a.user_id
           from event_attendees a
          where a.event_id = $1 and a.status in ('pending', 'accepted')
       ), joining as (
         select j.id
           from unnest($2::uuid[]) as j(id)
          where j.id not in (select user_id from party)
       ), everyone as (
         select user_id as id from party
         union
         select id from joining
       )
       select exists (
         select 1
           from user_blocks b
          where (b.blocker_id in (select id from joining)
                 and b.blocked_id in (select id from everyone))
             or (b.blocked_id in (select id from joining)
                 and b.blocker_id in (select id from everyone))
       ) as blocked`,
      [eventId, unique],
    );
    if (clash?.blocked) {
      throw new ForbiddenException(
        unique.length === 1
          ? "They can't be invited to this event."
          : "Some of the people you picked can't be invited to this event.",
      );
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

  /**
   * Accepts or declines. Only the invitee may answer their own invitation.
   *
   * An answer can take a declined invitation back to accepted, so unlike a
   * workspace invitation this cannot lean on a `pending` condition to lose a
   * race with a block: the block's decline and the invitee's own look the
   * same afterwards. It takes the pair lock first instead (see PAIR_LOCK_SQL)
   * and checks the pair under it.
   *
   * Across a block, accepting is refused as if the invitation were not there.
   * Declining is allowed — someone already going can still drop out — but the
   * organiser is not told. Nobody is told about an answer that changed
   * nothing, either, so tapping the same button twice is not two pushes.
   */
  async respond(
    userId: string,
    eventId: string,
    accept: boolean,
  ): Promise<{ status: AttendeeStatus }> {
    const status: AttendeeStatus = accept ? 'accepted' : 'declined';

    const row = await this.db.queryOne<{
      id: string;
      status: AttendeeStatus;
      organiser_id: string;
    }>(
      `select a.id, a.status, e.user_id as organiser_id
         from event_attendees a
         join schedule_events e on e.id = a.event_id
        where a.event_id = $1 and a.user_id = $2`,
      [eventId, userId],
    );
    if (!row) throw new NotFoundException('Invitation not found');

    const { blocked, changed } = await this.db.transaction(async (client) => {
      await client.query(PAIR_LOCK_SQL, [userId, row.organiser_id]);
      const block = !!(await this.blocks.between(userId, row.organiser_id, client));
      if (block && accept) throw new NotFoundException('Invitation not found');

      const moved = await client.query<{ id: string }>(
        `update event_attendees
            set status = $2, responded_at = now()
          where id = $1 and status <> $2
          returning id`,
        [row.id, status],
      );
      return { blocked: block, changed: moved.rows.length > 0 };
    });

    // Only the organiser can invite, so they are who sent it and who hears.
    if (changed && !blocked) {
      await this.notifyOrganiser(userId, eventId, row.organiser_id, status);
    }
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
      // `status = 'accepted'`, matching every other read on this event. Without
      // it this was the one path looser than the rest: somebody still deciding
      // — or who had already said no — could read the full guest list of an
      // event they cannot otherwise fetch.
      `select true as ok
         from schedule_events e
        where e.id = $1
          and (e.user_id = $2
               or exists (select 1 from event_attendees a
                           where a.event_id = e.id and a.user_id = $2
                             and a.status = 'accepted'))`,
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
   *
   * So is anything from an organiser across a block. A block declines those,
   * but the release before this one does not, and whatever it wrote during a
   * rollback must not be offered once this one is back.
   */
  async invitations(
    userId: string,
    status: AttendeeStatus = 'pending',
  ): Promise<EventInvitation[]> {
    return this.db.query<EventInvitation>(
      `select a.id, a.event_id, a.status, a.created_at,
              e.title, e.description, e.event_date, e.event_time,
              e.event_type, e.event_type_other, e.location,
              coalesce(o.display_name, split_part(o.email, '@', 1)) as inviter_name
         from event_attendees a
         join schedule_events e on e.id = a.event_id
         join users o on o.id = a.invited_by
        where a.user_id = $1
          and a.status = $2
          and e.event_date >= current_date
          and not ${blockedBetween('$1', 'e.user_id')}
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

      const when = formatWhen(event.event_date, event.event_time);
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

  /**
   * Tells everyone with a stake in the event that it changed.
   *
   * Every edit anybody on it can see: the date or time, the title, the notes,
   * the event type, the workspace. A move keeps its own wording, because it
   * is the change that can cost somebody a wasted trip and it should not read
   * like a corrected typo.
   *
   * Two audiences, deliberately, because attendees may now edit an event they
   * did not create. Everyone who accepted hears that their plans changed; the
   * organiser hears that somebody touched their event, which is different news
   * and needs the person named. Whoever made the edit is in neither list —
   * they were there when it happened.
   *
   * Best-effort, like the rest: the edit is already committed, and failing to
   * announce it must not fail the edit.
   */
  async notifyEventChanged(
    /** Whoever made the change. Not necessarily the organiser. */
    editorId: string,
    event: {
      id: string;
      /** The organiser, who is told when somebody else does the editing. */
      user_id: string;
      title: string;
      event_date: string;
      event_time: string | null;
    },
    /** The date and time as they stood before the edit, for the email. */
    previous: { event_date: string; event_time: string | null },
    /** What changed, already phrased — "the title", "the date and time". */
    changed: readonly string[],
  ): Promise<void> {
    try {
      const rows = await this.db.query<{ user_id: string }>(
        `select user_id from event_attendees
          where event_id = $1 and status = 'accepted' and user_id <> $2`,
        [event.id, editorId],
      );
      const attendeeIds = rows.map((r) => r.user_id);
      const tellOrganiser = event.user_id !== editorId;
      if (attendeeIds.length === 0 && !tellOrganiser) return;

      const editor = await this.db.queryOne<{ name: string }>(
        `select coalesce(display_name, split_part(email, '@', 1)) as name
           from users where id = $1`,
        [editorId],
      );

      const when = formatWhen(event.event_date, event.event_time);
      const previousWhen = formatWhen(previous.event_date, previous.event_time);
      const moved = previousWhen !== when;
      const who = editor?.name ?? 'Someone';

      // A move is the change that costs somebody a wasted trip, so it keeps
      // its own wording. Saying "has moved" about a corrected typo would
      // teach people to distrust the one alert that matters.
      //
      // Named rather than "An event you joined": with attendees editing, the
      // first thing anybody wants to know is who changed it — and the same
      // sentence then works for the organiser, whose event it is.
      const push = {
        topic: 'event-updated' as const,
        title: moved ? `${who} moved an event` : `${who} updated an event`,
        body: moved
          ? `${event.title} — now ${when}`
          : `${event.title} — ${listChanges(changed)} changed`,
        data: { type: 'event_updated', eventId: event.id },
      };

      const email = (audience: 'attendee' | 'organiser') =>
        eventChanged({
          editorName: who,
          eventTitle: event.title,
          previousWhen,
          when,
          changed,
          audience,
          url: `${this.mailConfig.appUrl}/schedule`,
        });

      // In-app is not enough here: the people who need this are the ones not
      // currently looking at Virgo.
      if (attendeeIds.length > 0) {
        await this.notifier.notify(attendeeIds, {
          ...push,
          email: email('attendee'),
        });
      }
      if (tellOrganiser) {
        await this.notifier.notify([event.user_id], {
          ...push,
          email: email('organiser'),
        });
      }
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
