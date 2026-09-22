import type { DatabaseService } from '../database/database.service';
import { DiscoverService } from './discover.service';

/**
 * Nearby across a block.
 *
 * The database is faked, so this reads the SQL and the mapping. Which people
 * the query returns, and that the role counts agree with it, is checked on a
 * real Postgres.
 */

const ME = '11111111-1111-4111-8111-111111111111';

function serviceOver(people: Record<string, unknown>[]) {
  const queryOne = jest.fn(async () => ({
    latitude: 10.3,
    longitude: 123.9,
    shares_location: true,
  }));
  const query = jest.fn(async (_sql: string, _params?: unknown[]) => people);
  const db = { query, queryOne } as unknown as DatabaseService;
  return { service: new DiscoverService(db), query };
}

const person = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'ana@example.com',
  display_name: null,
  avatar_url: null,
  roles: ['Photographer'],
  handle: 'ana',
  distance_km: '3.2',
  relationship: 'pending_out',
};

describe('DiscoverService.nearby', () => {
  it('leaves out blocked and suspended people, and reads the pair from both rows', async () => {
    const { service, query } = serviceOver([person]);

    await service.nearby(ME);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/left join friends theirs\s+on theirs\.user_id = u\.id and theirs\.friend_user_id = \$1/);
    expect(sql).toMatch(/u\.suspended_at is null/);
    expect(sql).toMatch(/user_blocks/);
    expect(sql).toMatch(/ub\.blocker_id = \$1 and ub\.blocked_id = u\.id/);
    expect(sql).toMatch(/as relationship/);
    expect(params?.[0]).toBe(ME);
  });

  it('maps the relationship the SQL worked out, with the handle and no email', async () => {
    const { service } = serviceOver([person]);

    const { people } = await service.nearby(ME);

    expect(people).toEqual([
      {
        id: person.id,
        // The local-part fallback for someone with no display name.
        name: 'ana',
        avatarUrl: null,
        distanceKm: 3.2,
        roles: ['Photographer'],
        handle: 'ana',
        relationship: 'pending_out',
      },
    ]);
    expect(JSON.stringify(people)).not.toContain('ana@example.com');
  });
});
