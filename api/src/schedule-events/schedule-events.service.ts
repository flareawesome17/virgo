import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OwnedResourceService } from '../common/owned-resource.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
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

  async create(
    userId: string,
    data: Record<string, unknown>,
  ): Promise<ScheduleEventRow> {
    await this.assertWorkspace(userId, data.workspace_id as string | undefined);
    return super.create(userId, data);
  }

  async update(
    userId: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<ScheduleEventRow> {
    await this.assertWorkspace(userId, data.workspace_id as string | undefined);
    return super.update(userId, id, data);
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
