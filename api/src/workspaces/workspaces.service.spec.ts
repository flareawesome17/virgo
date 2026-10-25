import { NotFoundException } from '@nestjs/common';
import type { DatabaseService } from '../database/database.service';
import type { NotifyService } from '../notifications/notify.service';
import type { QuotaService } from '../quota/quota.service';
import type { RealtimeGateway } from '../realtime/realtime.gateway';
import type { WorkspaceActivityService } from './workspace-activity.service';
import { WorkspacesController } from './workspaces.controller';
import { type DeletedWorkspace, WorkspacesRepository } from './workspaces.repository';
import { WorkspacesService } from './workspaces.service';

/**
 * Deleting a workspace.
 *
 * On 2026-10-25 one went and nothing said so: the owner's phone went on
 * showing it, which looked like the desktop had lost it, and which device
 * deleted it could not be found. A delete now leaves a record naming the
 * session that asked, and tells the owner's devices and every member at once.
 *
 * The database is faked, so this reads the statement. Only a real Postgres
 * can prove it, and it was run on one before this was merged.
 */

const OWNER = 'owner-1';
const WORKSPACE = 'workspace-1';

function serviceOver(gone: DeletedWorkspace | null) {
  const workspaces = { removeRecorded: jest.fn(async () => gone) };
  const realtime = { emitToUsers: jest.fn() };
  const service = new WorkspacesService(
    workspaces as unknown as WorkspacesRepository,
    {} as unknown as QuotaService,
    {} as unknown as WorkspaceActivityService,
    {} as unknown as NotifyService,
    realtime as unknown as RealtimeGateway,
  );
  return { service, workspaces, realtime };
}

describe('WorkspacesService.remove', () => {
  it('records the session that asked, then tells the owner and every member', async () => {
    const { service, workspaces, realtime } = serviceOver({
      name: 'Corepath Projects',
      member_ids: ['member-1', 'member-2'],
    });

    await service.remove(OWNER, WORKSPACE, { sessionId: 'family-1', userAgent: 'okhttp/4.12' });

    expect(workspaces.removeRecorded).toHaveBeenCalledWith(OWNER, WORKSPACE, {
      sessionId: 'family-1',
      userAgent: 'okhttp/4.12',
    });
    expect(realtime.emitToUsers).toHaveBeenCalledTimes(1);
    expect(realtime.emitToUsers).toHaveBeenCalledWith(['owner-1', 'member-1', 'member-2'], {
      type: 'workspace-deleted',
      workspaceId: WORKSPACE,
      at: expect.any(String),
    });
  });

  it('tells nobody when there was nothing of theirs to delete', async () => {
    const { service, realtime } = serviceOver(null);

    await expect(service.remove('member-1', WORKSPACE)).rejects.toBeInstanceOf(NotFoundException);
    expect(realtime.emitToUsers).not.toHaveBeenCalled();
  });
});

describe('WorkspacesController.remove', () => {
  it('passes on the session and the User-Agent', async () => {
    const service = { remove: jest.fn(async () => undefined) };
    const controller = new WorkspacesController(service as unknown as WorkspacesService);

    await controller.remove(OWNER, 'family-1', WORKSPACE, 'Mozilla/5.0 Edg/141');

    expect(service.remove).toHaveBeenCalledWith(OWNER, WORKSPACE, {
      sessionId: 'family-1',
      userAgent: 'Mozilla/5.0 Edg/141',
    });
  });
});

describe('WorkspacesRepository.removeRecorded', () => {
  function repositoryOver(row: DeletedWorkspace | null) {
    const queryOne = jest.fn(async (_sql: string, _params?: unknown[]) => row);
    const repository = new WorkspacesRepository({ queryOne } as unknown as DatabaseService);
    return { repository, queryOne };
  }

  /** The statement, with its whitespace run together. */
  const sqlOf = (queryOne: jest.Mock) => String(queryOne.mock.calls[0][0]).replace(/\s+/g, ' ');

  it('deletes and records in one statement, scoped to the owner', async () => {
    const { repository, queryOne } = repositoryOver({ name: 'Corepath Projects', member_ids: [] });

    await repository.removeRecorded(OWNER, WORKSPACE, { sessionId: 'family-1', userAgent: 'okhttp/4.12' });

    expect(queryOne).toHaveBeenCalledTimes(1);
    const sql = sqlOf(queryOne);
    expect(sql).toMatch(/where w\.id = \$1 and w\.user_id = \$2::uuid/);
    expect(sql).toMatch(/delete from workspaces w using target t where w\.id = t\.id/);
    expect(sql).toMatch(/insert into workspace_deletions/);
    expect(queryOne.mock.calls[0][1]).toEqual([WORKSPACE, OWNER, 'family-1', 'okhttp/4.12']);
  });

  it('records only a row the delete removed, so a lost race leaves no second record', async () => {
    const { repository, queryOne } = repositoryOver(null);

    await expect(repository.removeRecorded(OWNER, WORKSPACE)).resolves.toBeNull();

    const sql = sqlOf(queryOne);
    const insert = sql.slice(sql.indexOf('insert into workspace_deletions'));
    expect(insert).toMatch(/from target t join gone g on g\.id = t\.id/);
  });

  it('counts only accepted members, the ones who lose it', async () => {
    const { repository, queryOne } = repositoryOver(null);

    await repository.removeRecorded(OWNER, WORKSPACE);

    expect(sqlOf(queryOne)).toMatch(/c\.status = 'accepted'/);
  });

  it('keeps no more of a User-Agent than a refresh token does', async () => {
    const { repository, queryOne } = repositoryOver(null);

    await repository.removeRecorded(OWNER, WORKSPACE, { userAgent: 'x'.repeat(1000) });

    const [, , session, userAgent] = queryOne.mock.calls[0][1] as unknown[];
    expect(session).toBeNull();
    expect(userAgent).toHaveLength(300);
  });
});
