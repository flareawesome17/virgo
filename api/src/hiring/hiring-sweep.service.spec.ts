import type { DatabaseService } from '../database/database.service';
import type { NotifyService } from '../notifications/notify.service';
import { HiringSweepService } from './hiring-sweep.service';

/**
 * The nightly sweep. Which posts it ends is the SQL's business, checked on a
 * real Postgres; this pins what it does about the people still waiting.
 */
function harness(posts: { id: string; title: string }[], declined: { user_id: string; post_id: string }[]) {
  const statements: string[] = [];
  const client = {
    query: jest.fn(async (sql: string) => {
      statements.push(sql);
      if (sql.includes('update hiring_posts')) return { rows: posts };
      if (sql.includes('update hiring_applications')) return { rows: declined };
      return { rows: [] };
    }),
  };
  const db = {
    transaction: jest.fn(async (fn: (c: typeof client) => Promise<unknown>) => fn(client)),
  } as unknown as DatabaseService;
  const notify = jest.fn(async () => undefined);
  const service = new HiringSweepService(db, { notify } as unknown as NotifyService);
  return { service, notify, statements };
}

describe('HiringSweepService.run', () => {
  it('declines what was still waiting on an ended post, and tells each person once', async () => {
    const h = harness(
      [{ id: 'p1', title: 'Reyes wedding' }],
      [
        { user_id: 'ana', post_id: 'p1' },
        { user_id: 'ben', post_id: 'p1' },
        // Two roles applied for by one person: told once.
        { user_id: 'ana', post_id: 'p1' },
      ],
    );

    await expect(h.service.run()).resolves.toEqual({ expired: 1, declined: 3 });

    const answer = h.statements.find((s) => s.includes('update hiring_applications'))!;
    expect(answer).toContain("status in ('new', 'shortlisted')");
    // The lock order a block and closing a post also use.
    expect(answer).toContain('order by id');
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.notify).toHaveBeenCalledWith(
      ['ana', 'ben'],
      expect.objectContaining({ topic: 'job-response', data: expect.objectContaining({ postId: 'p1' }) }),
    );
  });

  it('does nothing more when no post has ended', async () => {
    const h = harness([], []);

    await expect(h.service.run()).resolves.toEqual({ expired: 0, declined: 0 });
    expect(h.statements.some((s) => s.includes('update hiring_applications'))).toBe(false);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('keeps going when telling somebody fails', async () => {
    const h = harness(
      [
        { id: 'p1', title: 'One' },
        { id: 'p2', title: 'Two' },
      ],
      [
        { user_id: 'ana', post_id: 'p1' },
        { user_id: 'ben', post_id: 'p2' },
      ],
    );
    h.notify.mockRejectedValueOnce(new Error('push down'));

    await expect(h.service.run()).resolves.toEqual({ expired: 2, declined: 2 });
    expect(h.notify).toHaveBeenCalledTimes(2);
  });
});
