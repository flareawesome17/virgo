import { BadRequestException, Injectable } from '@nestjs/common';
import { OwnedResourceService } from '../common/owned-resource.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import {
  ScheduleEventRow,
  ScheduleEventsRepository,
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
  ): Promise<ScheduleEventRow[]> {
    if (from > to) {
      throw new BadRequestException('`from` must not be after `to`');
    }
    return this.events.findInRange(userId, from, to);
  }
}
