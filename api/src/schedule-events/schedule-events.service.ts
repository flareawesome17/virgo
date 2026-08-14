import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OwnedResourceService } from '../common/owned-resource.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { EventAttendeesService } from './event-attendees.service';
import {
  ScheduleEventRow,
  ScheduleEventsRepository,
  VisibleScheduleEventRow,
} from './schedule-events.repository';

@Injectable()
export class ScheduleEventsService extends OwnedResourceService<ScheduleEventRow> {
  constructor(
    private readonly events: ScheduleEventsRepository,
    private readonly workspaces: WorkspacesService,
    private readonly attendees: EventAttendeesService,
  ) {
    super(events, 'Schedule event');
  }

  /** workspace_id is nullable here, so only a supplied value is checked. */
  private async assertWorkspace(
    userId: string,
    workspaceId: string | undefined | null,
  ): Promise<void> {
    if (workspaceId === undefined || workspaceId === null) return;
    const owned = await this.workspaces.assertOwned(userId, workspaceId);
    if (!owned) throw new BadRequestException('Unknown workspace');
  }

  /**
   * Keeps `event_type` and `event_type_other` consistent with each other.
   *
   * The two are one choice to the person making it — "Other, and here is what
   * it is" — but they arrive as two independent fields, and a PATCH may carry
   * either without the other. So the pair is resolved against the event as it
   * currently stands rather than against the request alone: sending only a
   * label leaves the existing type, and sending only a type reuses or clears
   * the existing label.
   *
   * Switching away from `other` clears the label rather than keeping it. A
   * meeting that still remembers it was once called "Client viewing" would
   * eventually surface that name somewhere, and the database rejects the
   * combination anyway.
   */
  private resolveEventType(
    data: Record<string, unknown>,
    current: { event_type: string; event_type_other: string | null },
  ): Record<string, unknown> {
    const type = (data.event_type as string | undefined) ?? current.event_type;

    if (type !== 'other') return { ...data, event_type_other: null };

    // `undefined` means the field was not sent and the stored label stands;
    // `null` means it was sent as empty, which is a request to clear it — and
    // an `other` event with no label is exactly what this rejects.
    const supplied =
      data.event_type_other === undefined
        ? current.event_type_other
        : (data.event_type_other as string | null);

    const label = supplied?.trim();
    if (!label) {
      throw new BadRequestException(
        'Say what kind of event this is, or pick one of the listed types',
      );
    }
    return { ...data, event_type_other: label };
  }

  async create(
    userId: string,
    data: Record<string, unknown>,
  ): Promise<ScheduleEventRow> {
    await this.assertWorkspace(userId, data.workspace_id as string | undefined);
    // Nothing stored yet, so the fallback is the column default a bare insert
    // would have taken.
    return super.create(
      userId,
      this.resolveEventType(data, { event_type: 'event', event_type_other: null }),
    );
  }

  /**
   * Editing an event changes it on the calendar of everyone who accepted, so
   * a move is announced.
   *
   * Read-then-write rather than trusting the request body: a client may send
   * `event_date` unchanged, and notifying on "the field was present" would
   * push to everyone every time the form is saved. Both rows come back from
   * Postgres, so the values are already normalised and compare directly.
   */
  async update(
    userId: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<ScheduleEventRow> {
    await this.assertWorkspace(userId, data.workspace_id as string | undefined);

    const before = await this.get(userId, id);
    const after = await super.update(
      userId,
      id,
      this.resolveEventType(data, before),
    );

    /**
     * What actually changed, in words an attendee would use.
     *
     * Compared field by field against the stored row rather than read off the
     * request body: a form that submits every field on every save would
     * otherwise report a change each time somebody opened and closed it.
     *
     * Date and time collapse into one entry. They are one fact to the person
     * reading it — "the time changed" — and listing both when a shoot slides
     * an hour is noise.
     */
    const changed: string[] = [];
    if (
      before.event_date !== after.event_date ||
      before.event_time !== after.event_time
    ) {
      changed.push('the date and time');
    }
    if (before.title !== after.title) changed.push('the title');
    if (before.description !== after.description) changed.push('the notes');
    // The label is part of the type, not a field of its own — renaming an
    // "Other" event from "Client viewing" to "Site recce" changed what kind of
    // thing it is, as far as anyone reading the calendar is concerned.
    if (
      before.event_type !== after.event_type ||
      before.event_type_other !== after.event_type_other
    ) {
      changed.push('the event type');
    }
    if (before.workspace_id !== after.workspace_id) {
      changed.push('the workspace');
    }

    if (changed.length > 0) {
      await this.attendees.notifyEventChanged(
        userId,
        {
          id: after.id,
          title: after.title,
          event_date: after.event_date,
          event_time: after.event_time,
        },
        // The email says what it moved *from* as well as to. "Your shoot has
        // moved" with only the new date leaves the reader reconstructing the
        // old one from memory, which is the mistake this exists to prevent.
        { event_date: before.event_date, event_time: before.event_time },
        changed,
      );
    }

    return after;
  }

  /** Used by reminders before attaching one to a schedule event. */
  async assertOwned(userId: string, eventId: string): Promise<boolean> {
    return this.events.existsForUser(userId, eventId);
  }

  async listRange(
    userId: string,
    from: string,
    to: string,
  ): Promise<VisibleScheduleEventRow[]> {
    if (from > to) {
      throw new BadRequestException('`from` must not be after `to`');
    }
    return this.events.findInRange(userId, from, to);
  }

  /**
   * The paginated list, including events the user accepted an invitation to.
   *
   * Overrides the inherited owner-only `list`, which would drop every event
   * somebody else organised — the whole point of accepting an invitation.
   */
  async listVisible(
    userId: string,
    options: {
      workspaceId?: string;
      eventType?: string;
      limit?: number;
      offset?: number;
      orderBy?: string;
      direction?: 'asc' | 'desc';
    },
  ): Promise<VisibleScheduleEventRow[]> {
    return this.events.findAllVisible(userId, options);
  }

  async countVisible(
    userId: string,
    options: { workspaceId?: string; eventType?: string },
  ): Promise<number> {
    return this.events.countVisible(userId, options);
  }

  /** One event, readable by its owner and by anyone attending it. */
  async getVisible(
    userId: string,
    id: string,
  ): Promise<VisibleScheduleEventRow> {
    const row = await this.events.findVisible(userId, id);
    if (!row) throw new NotFoundException('Schedule event not found');
    return row;
  }
}
