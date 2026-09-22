import type { DatabaseService } from '../database/database.service';
import type { FriendsService } from '../friends/friends.service';
import type { MailConfig } from '../mail/mail.config';
import type { NotifyService } from '../notifications/notify.service';
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
