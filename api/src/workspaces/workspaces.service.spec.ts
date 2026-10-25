import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ReauthService } from '../auth/reauth.service';
import type { DatabaseService } from '../database/database.service';
import type { NotifyService } from '../notifications/notify.service';
import type { QuotaService } from '../quota/quota.service';
import type { RealtimeGateway } from '../realtime/realtime.gateway';
import type { WorkspaceActivityService } from './workspace-activity.service';
import { WorkspaceTrashService } from './workspace-trash.service';
import { WorkspacesController } from './workspaces.controller';
import { type DeletedWorkspace, WorkspacesRepository } from './workspaces.repository';
import { WorkspacesService } from './workspaces.service';

/**
 * Deleting a workspace, and getting it back.
 *
 * On 2026-10-25 someone signed in with an owner's password deleted a
 * workspace with one tap, the owner's phone went on showing it, and which
 * device did it could not be found. A delete now asks for the password again,
 * moves the workspace to Recently deleted for 30 days, records the session
 * that asked, and tells the owner's devices and every member at once.
 *
 * The database is faked, so the statements are read here. Only a real
 * Postgres can prove them, and they were run on one before this was merged.
 */

const OWNER = 'owner-1';
const WORKSPACE = 'workspace-1';

function serviceOver(
  gone: DeletedWorkspace | null,
  options: { refuse?: Error; full?: Error } = {},
) {
  const workspaces = {
    trash: jest.fn(async () => gone),
    restore: jest.fn(async () => gone),
    findOne: jest.fn(async () => ({ id: WORKSPACE, name: 'Corepath Projects' })),
  };
  const realtime = { emitToUsers: jest.fn() };
  const reauth = {
    confirmDelete: jest.fn(async () => {
      if (options.refuse) throw options.refuse;
    }),
  };
  const quota = {
    assertCanCreateWorkspace: jest.fn(async () => {
      if (options.full) throw options.full;
    }),
  };
  const service = new WorkspacesService(
    workspaces as unknown as WorkspacesRepository,
    quota as unknown as QuotaService,
    {} as unknown as WorkspaceActivityService,
    {} as unknown as NotifyService,
    realtime as unknown as RealtimeGateway,
    reauth as unknown as ReauthService,
  );
  return { service, workspaces, realtime, reauth, quota };
}

describe('WorkspacesService.remove', () => {
  it('asks for the password, moves it to Recently deleted, and tells the owner and every member', async () => {
    const { service, workspaces, realtime, reauth } = serviceOver({
      name: 'Corepath Projects',
      member_ids: ['member-1', 'member-2'],
    });

    await service.remove(
      OWNER,
      WORKSPACE,
      { password: 'hunter2' },
      { sessionId: 'family-1', userAgent: 'okhttp/4.12' },
    );

    expect(reauth.confirmDelete).toHaveBeenCalledWith(OWNER, { password: 'hunter2' });
    expect(workspaces.trash).toHaveBeenCalledWith(OWNER, WORKSPACE, {
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

  it('deletes nothing without the password', async () => {
    const refusal = new ForbiddenException({ code: 'REAUTH_REQUIRED' });
    const { service, workspaces, realtime } = serviceOver(
      { name: 'Corepath Projects', member_ids: [] },
      { refuse: refusal },
    );

    await expect(service.remove(OWNER, WORKSPACE)).rejects.toBe(refusal);
    expect(workspaces.trash).not.toHaveBeenCalled();
    expect(realtime.emitToUsers).not.toHaveBeenCalled();
  });

  it('tells nobody when there was nothing of theirs to delete', async () => {
    const { service, realtime } = serviceOver(null);

    await expect(
      service.remove('member-1', WORKSPACE, { password: 'hunter2' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(realtime.emitToUsers).not.toHaveBeenCalled();
  });
});

describe('WorkspacesService.restore', () => {
  it('brings it back to everyone who had it, without a password', async () => {
    const { service, workspaces, realtime, reauth, quota } = serviceOver({
      name: 'Corepath Projects',
      member_ids: ['member-1'],
    });

    const back = await service.restore(OWNER, WORKSPACE, { sessionId: 'family-2' });

    expect(quota.assertCanCreateWorkspace).toHaveBeenCalledWith(OWNER, 'restore');
    expect(workspaces.restore).toHaveBeenCalledWith(OWNER, WORKSPACE, { sessionId: 'family-2' });
    expect(reauth.confirmDelete).not.toHaveBeenCalled();
    expect(realtime.emitToUsers).toHaveBeenCalledWith(['owner-1', 'member-1'], {
      type: 'workspace-restored',
      workspaceId: WORKSPACE,
      at: expect.any(String),
    });
    expect(back).toEqual({ id: WORKSPACE, name: 'Corepath Projects' });
  });

  it('is refused at the plan limit, before anything changes', async () => {
    const full = new ForbiddenException('Your plan includes 3 workspaces.');
    const { service, workspaces, realtime } = serviceOver(
      { name: 'Corepath Projects', member_ids: [] },
      { full },
    );

    await expect(service.restore(OWNER, WORKSPACE)).rejects.toBe(full);
    expect(workspaces.restore).not.toHaveBeenCalled();
    expect(realtime.emitToUsers).not.toHaveBeenCalled();
  });

  it('answers 404 for anything not in their Recently deleted', async () => {
    const { service, realtime } = serviceOver(null);

    await expect(service.restore(OWNER, WORKSPACE)).rejects.toBeInstanceOf(NotFoundException);
    expect(realtime.emitToUsers).not.toHaveBeenCalled();
  });
});

describe('WorkspacesController', () => {
  it('passes the proof, the session and the User-Agent on a delete', async () => {
    const service = { remove: jest.fn(async () => undefined) };
    const controller = new WorkspacesController(service as unknown as WorkspacesService);

    await controller.remove(OWNER, 'family-1', WORKSPACE, { password: 'hunter2' }, 'Mozilla/5.0 Edg/141');

    expect(service.remove).toHaveBeenCalledWith(
      OWNER,
      WORKSPACE,
      { password: 'hunter2' },
      { sessionId: 'family-1', userAgent: 'Mozilla/5.0 Edg/141' },
    );
  });
});

describe('WorkspacesRepository statements', () => {
  function repositoryOver(row: unknown) {
    const queryOne = jest.fn(async (_sql: string, _params?: unknown[]) => row);
    const query = jest.fn(async (_sql: string, _params?: unknown[]) => [] as unknown[]);
    const repository = new WorkspacesRepository({ queryOne, query } as unknown as DatabaseService);
    return { repository, queryOne, query };
  }

  /** The statement, with its whitespace run together. */
  const sqlOf = (mock: jest.Mock, call = 0) =>
    String(mock.mock.calls[call][0]).replace(/\s+/g, ' ');

  it('deletes by setting deleted_at, scoped to the owner, and records it in the same statement', async () => {
    const { repository, queryOne } = repositoryOver({ name: 'Corepath Projects', member_ids: [] });

    await repository.trash(OWNER, WORKSPACE, { sessionId: 'family-1', userAgent: 'okhttp/4.12' });

    const sql = sqlOf(queryOne);
    expect(sql).toMatch(/where w\.id = \$1 and w\.user_id = \$2::uuid and w\.deleted_at is null/);
    expect(sql).toMatch(/update workspaces w set deleted_at = now\(\)/);
    expect(sql).not.toMatch(/delete from workspaces/);
    expect(sql).toMatch(/insert into workspace_deletions .* from target t join trashed x on x\.id = t\.id/);
    expect(queryOne.mock.calls[0][1]).toEqual([WORKSPACE, OWNER, 'family-1', 'okhttp/4.12']);
  });

  it('keeps no more of a User-Agent than a refresh token does', async () => {
    const { repository, queryOne } = repositoryOver(null);

    await repository.trash(OWNER, WORKSPACE, { userAgent: 'x'.repeat(1000) });

    const [, , session, userAgent] = queryOne.mock.calls[0][1] as unknown[];
    expect(session).toBeNull();
    expect(userAgent).toHaveLength(300);
  });

  it('hides a deleted workspace from every list and lookup, owner included', async () => {
    const { repository, query, queryOne } = repositoryOver(null);

    await repository.findAll(OWNER);
    await repository.findOne(OWNER, WORKSPACE);
    await repository.count(OWNER);
    await repository.existsForUser(OWNER, WORKSPACE);

    expect(sqlOf(query)).toMatch(/w\.deleted_at is null and \(w\.user_id = \$1 or me\.id is not null\)/);
    for (const call of [0, 1]) {
      expect(sqlOf(queryOne, call)).toMatch(/w\.deleted_at is null and \(w\.user_id = \$1/);
    }
    expect(sqlOf(queryOne, 2)).toMatch(/and deleted_at is null/);
  });

  it('restores only the owner’s, and notes it on the open record', async () => {
    const { repository, queryOne } = repositoryOver(null);

    await repository.restore(OWNER, WORKSPACE, { sessionId: 'family-2' });

    const sql = sqlOf(queryOne);
    expect(sql).toMatch(/set deleted_at = null where w\.id = \$1 and w\.user_id = \$2::uuid and w\.deleted_at is not null/);
    expect(sql).toMatch(/set restored_at = now\(\), restored_session_id = \$3::uuid/);
    expect(queryOne.mock.calls[0][1]).toEqual([WORKSPACE, OWNER, 'family-2']);
  });

  it('purges only what has waited 30 days, without queueing on another sweep', async () => {
    const { repository, query } = repositoryOver(null);

    await repository.purgeExpired();

    const sql = sqlOf(query);
    expect(sql).toMatch(/where deleted_at < now\(\) - interval '30 days'/);
    expect(sql).toMatch(/for update skip locked/);
    expect(sql).toMatch(/set purged_at = now\(\)/);
  });
});

describe('WorkspaceTrashService', () => {
  it('works through a backlog a batch at a time', async () => {
    const batches = [Array.from({ length: 100 }, (_, i) => `w${i}`), ['w100', 'w101']];
    const workspaces = { purgeExpired: jest.fn(async () => batches.shift() ?? []) };
    const sweep = new WorkspaceTrashService(workspaces as unknown as WorkspacesRepository);

    await expect(sweep.run()).resolves.toBe(102);
    expect(workspaces.purgeExpired).toHaveBeenCalledTimes(2);
  });
});
