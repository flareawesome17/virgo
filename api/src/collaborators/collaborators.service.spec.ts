import type { DatabaseService } from '../database/database.service';
import type { FriendsService } from '../friends/friends.service';
import type { MailConfig } from '../mail/mail.config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { NotifyService } from '../notifications/notify.service';
import type { BlocksService } from '../safety/blocks.service';
import type { WorkspaceActivityService } from '../workspaces/workspace-activity.service';
import type { WorkspacesService } from '../workspaces/workspaces.service';
import type { CollaboratorsRepository } from './collaborators.repository';
import { CollaboratorsService } from './collaborators.service';

/**
 * The albums an owner ticks when deciding what a collaborator can open.
 *
 * Each one shows how much it holds, and that number was read from
 * `albums.item_count`, a counter nothing maintains. It said 0 beside every
 * album made since August 2026, and 24 beside one holding 5 files. A grant covers
 * every file in an album, photographs, films and tracks alike, so the picker
 * counts every file.
 *
 * The database is faked, so this reads the query, and fails if the query
 * goes back to the column. Only a real Postgres can prove the count itself.
 */

const OWNER = 'owner-1';

/** Whether a query reads the stored column, rather than naming a count after it. */
function readsStoredCount(sql: string): boolean {
  return /\bitem_count\b/.test(sql.replace(/\bas\s+item_count\b/g, ''));
}

function serviceOver() {
  const query = jest.fn(async (_sql: string, _params?: unknown[]) => [] as unknown[]);
  const queryOne = jest.fn(async () => ({ workspace_id: 'workspace-1' }));
  const db = { query, queryOne } as unknown as DatabaseService;

  const service = new CollaboratorsService(
    {} as unknown as CollaboratorsRepository,
    {} as unknown as WorkspacesService,
    {} as unknown as FriendsService,
    db,
    {} as unknown as NotifyService,
    {} as unknown as MailConfig,
    {} as unknown as WorkspaceActivityService,
    {} as unknown as BlocksService,
  );
  return { service, query };
}

describe('CollaboratorsService albumsFor', () => {
  it('counts the files in each album rather than reading the stored column', async () => {
    const { service, query } = serviceOver();

    await service.albumsFor(OWNER, 'collaborator-1');

    expect(query).toHaveBeenCalledTimes(1);
    const [sql] = query.mock.calls[0];
    expect(readsStoredCount(sql)).toBe(false);
    expect(sql).toMatch(
      /count\(\*\)\s+from\s+user_files\s+f\s+where\s+f\.album_id\s*=\s*a\.id\b/,
    );
  });
});

/**
 * Workspace invitations across a block.
 *
 * A block declines every pending invitation between the two, in either
 * direction. What is left to pin here is the other half: answering or
 * resending one across a block finds nothing, and neither write can move a
 * row that is no longer pending — which is what serialises it with the block
 * without a pair lock.
 */
describe('CollaboratorsService invitations', () => {
  const INVITER = 'inviter-1';
  const INVITEE = 'invitee-1';

  function invitationHarness(
    options: {
      blocked?: boolean;
      /** What the conditional update returns; null is "no longer pending". */
      updated?: Record<string, unknown> | null;
    } = {},
  ) {
    const invitation = {
      id: 'collab-1',
      user_id: INVITER,
      collaborator_user_id: INVITEE,
      workspace_id: 'workspace-1',
      name: 'Ana Cruz',
      role: 'editor',
      status: 'pending',
      recent: false,
    };
    const updated =
      options.updated === undefined ? { ...invitation, status: 'accepted' } : options.updated;

    const queryOne = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (/^\s*update collaborators/.test(sql)) return updated;
      if (/from collaborators where id = \$1/.test(sql)) return invitation;
      if (/from users where id = \$1/.test(sql)) {
        return { display_name: 'Someone', email: 'someone@example.com' };
      }
      if (/from workspaces where id = \$1/.test(sql)) return { name: 'Wedding' };
      return null;
    });
    const query = jest.fn(async (_sql: string, _params?: unknown[]) => [] as unknown[]);
    const db = { query, queryOne } as unknown as DatabaseService;

    const blocks = {
      between: jest.fn(async () =>
        options.blocked ? { id: 'block-1', byMe: false } : null,
      ),
    };
    const notifier = { notify: jest.fn(async () => undefined) };
    const feed = { record: jest.fn(async () => undefined) };

    const service = new CollaboratorsService(
      {} as unknown as CollaboratorsRepository,
      {} as unknown as WorkspacesService,
      {} as unknown as FriendsService,
      db,
      notifier as unknown as NotifyService,
      { appUrl: 'https://web.example' } as unknown as MailConfig,
      feed as unknown as WorkspaceActivityService,
      blocks as unknown as BlocksService,
    );

    const updates = () =>
      queryOne.mock.calls.filter(([sql]) => /^\s*update collaborators/.test(sql));
    return { service, query, queryOne, blocks, notifier, feed, updates };
  }

  it.each([true, false])(
    'refuses an answer (accept=%s) across a block as if there were no invitation',
    async (accept) => {
      const h = invitationHarness({ blocked: true });

      await expect(
        h.service.respondToInvitation(INVITEE, 'collab-1', accept),
      ).rejects.toThrow(new NotFoundException('Invitation not found'));

      expect(h.blocks.between).toHaveBeenCalledWith(INVITEE, INVITER);
      expect(h.updates()).toHaveLength(0);
      expect(h.feed.record).not.toHaveBeenCalled();
      expect(h.notifier.notify).not.toHaveBeenCalled();
    },
  );

  it('only answers an invitation that is still pending, and only as the invitee', async () => {
    const h = invitationHarness();

    await h.service.respondToInvitation(INVITEE, 'collab-1', true);

    const [sql, params] = h.updates()[0];
    expect(sql).toMatch(/status = 'pending'/);
    expect(sql).toMatch(/collaborator_user_id = \$3/);
    expect(params).toEqual(['collab-1', 'accepted', INVITEE]);
    expect(h.notifier.notify).toHaveBeenCalledTimes(1);
  });

  it('says so, and tells nobody, when the invitation stopped being pending first', async () => {
    const h = invitationHarness({ updated: null });

    await expect(
      h.service.respondToInvitation(INVITEE, 'collab-1', true),
    ).rejects.toThrow(new BadRequestException('That invitation has already been answered'));

    expect(h.feed.record).not.toHaveBeenCalled();
    expect(h.notifier.notify).not.toHaveBeenCalled();
  });

  it('will not resend an invitation across a block', async () => {
    const h = invitationHarness({ blocked: true });

    await expect(h.service.resend(INVITER, 'collab-1')).rejects.toThrow(
      new NotFoundException('Invitation not found'),
    );

    expect(h.blocks.between).toHaveBeenCalledWith(INVITER, INVITEE);
    expect(h.updates()).toHaveLength(0);
    expect(h.notifier.notify).not.toHaveBeenCalled();
  });

  it('resends only while still pending, and never falls back to the stale row', async () => {
    const h = invitationHarness({ updated: null });

    await expect(h.service.resend(INVITER, 'collab-1')).rejects.toThrow(
      new BadRequestException('That invitation has already been answered'),
    );

    const [sql] = h.updates()[0];
    expect(sql).toMatch(/where id = \$1 and status = 'pending'/);
    expect(h.notifier.notify).not.toHaveBeenCalled();
  });

  it('never lists an invitation from across a block', async () => {
    const h = invitationHarness();

    await h.service.invitationsFor(INVITEE);

    const [sql, params] = h.query.mock.calls[0];
    expect(sql).toMatch(/user_blocks/);
    expect(sql).toMatch(/ub\.blocked_id = c\.user_id/);
    expect(params).toEqual([INVITEE]);
  });
});
