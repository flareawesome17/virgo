import { BadRequestException } from '@nestjs/common';
import type { DatabaseService } from '../database/database.service';
import { DiscoverService } from './discover.service';

/**
 * Nearby across a block, and from an address.
 *
 * The database is faked, so this reads the SQL and the mapping. Which people
 * the query returns, and that the role counts agree with it, is checked on a
 * real Postgres.
 */

const ME = '11111111-1111-4111-8111-111111111111';

/** The caller's own row as ownPosition reads it: placed by an address. */
const placedByAddress = {
  lat: 10.3157,
  lon: 123.8854,
  place: 'Cebu City',
  source: 'address',
  nearby_hidden: false,
  shares_location: false,
  latitude: null,
  location_place: null,
  location_updated_at: null,
  address_place: 'Cebu City',
};

function serviceOver(
  people: Record<string, unknown>[],
  me: Record<string, unknown> | null = placedByAddress,
) {
  const queryOne = jest.fn(async (_sql: string, _params?: unknown[]) => me);
  const query = jest.fn(async (_sql: string, _params?: unknown[]) => people);
  const db = { query, queryOne } as unknown as DatabaseService;
  return { service: new DiscoverService(db), query, queryOne };
}

const person = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'ana@example.com',
  display_name: null,
  avatar_url: null,
  roles: ['Photographer'],
  handle: 'ana',
  distance_km: '3',
  approximate: true,
  place: 'Mandaue',
  relationship: 'pending_out',
};

describe('DiscoverService.nearby', () => {
  it('leaves out blocked, suspended and hidden people, and reads the pair from both rows', async () => {
    const { service, query } = serviceOver([person]);

    await service.nearby(ME);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/left join friends theirs\s+on theirs\.user_id = u\.id and theirs\.friend_user_id = \$1/);
    expect(sql).toMatch(/u\.suspended_at is null/);
    expect(sql).toMatch(/user_blocks/);
    expect(sql).toMatch(/ub\.blocker_id = \$1 and ub\.blocked_id = u\.id/);
    expect(sql).toMatch(/as relationship/);
    expect(sql).toMatch(/not u\.nearby_hidden/);
    expect(params?.[0]).toBe(ME);
  });

  it('places people by their shared position while it counts, and by their address otherwise', async () => {
    const { service, query } = serviceOver([person]);

    await service.nearby(ME);

    const [sql] = query.mock.calls[0];
    // The 30-day rule for a device fix, with a picked city exempt.
    expect(sql).toMatch(/u\.location_place is not null\s+or u\.location_updated_at > now\(\) - interval '30 days'/);
    expect(sql).toMatch(/else u\.address_latitude end as lat/);
    expect(sql).toMatch(/else u\.address_longitude end as lon/);
    // Somebody nothing places is not a candidate.
    expect(sql).toMatch(/pos\.lat is not null/);
  });

  it('maps the relationship the SQL worked out, with the handle, the place, and no email', async () => {
    const { service } = serviceOver([person]);

    const result = await service.nearby(ME);

    expect(result.people).toEqual([
      {
        id: person.id,
        // The local-part fallback for someone with no display name.
        name: 'ana',
        avatarUrl: null,
        distanceKm: 3,
        approximate: true,
        place: 'Mandaue',
        roles: ['Photographer'],
        handle: 'ana',
        relationship: 'pending_out',
      },
    ]);
    expect(JSON.stringify(result.people)).not.toContain('ana@example.com');
  });

  it('searches from the address without the caller sharing anything', async () => {
    const { service, query } = serviceOver([person]);

    const result = await service.nearby(ME, 25);

    // `sharing` is what the installed apps show the list on.
    expect(result.sharing).toBe(true);
    expect(result.origin).toEqual({ source: 'address', place: 'Cebu City' });
    expect(result).not.toHaveProperty('place');
    const [, params] = query.mock.calls[0];
    expect(params).toEqual([ME, 10.3157, 123.8854, 25, []]);
  });

  it("searches from a hidden caller's position all the same", async () => {
    const { service, query } = serviceOver([person], { ...placedByAddress, nearby_hidden: true });

    const result = await service.nearby(ME);

    expect(result.sharing).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('says there is nowhere to search from when nothing places the caller', async () => {
    const { service, query } = serviceOver([person], {
      ...placedByAddress,
      lat: null,
      lon: null,
      place: null,
      source: null,
      address_place: null,
    });

    const result = await service.nearby(ME);

    expect(result).toEqual({ sharing: false, people: [], origin: null });
    expect(query).not.toHaveBeenCalled();
  });

  it('measures from a typed city, even for somebody nothing places', async () => {
    const { service, query, queryOne } = serviceOver([person], null);

    const result = await service.nearby(ME, 50, [], 'cdo');

    expect(result.place).toBe('Cagayan de Oro');
    expect(result.origin).toEqual({ source: 'search', place: 'Cagayan de Oro' });
    expect(queryOne).not.toHaveBeenCalled();
    const [, params] = query.mock.calls[0];
    expect(params?.slice(1, 3)).toEqual([8.4542, 124.6319]);
  });

  it('refuses a typed place it cannot measure from', async () => {
    const { service } = serviceOver([person]);

    await expect(service.nearby(ME, 50, [], 'Shangri-La Mactan')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('DiscoverService.roleCounts', () => {
  it('counts in the database over everyone in range, not over the list of 50', async () => {
    const { service, query } = serviceOver([
      { role: 'Photographer', n: 120 },
      { role: 'Not a role', n: 3 },
    ]);

    const counts = await service.roleCounts(ME, 30);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('unnest(candidates.roles)');
    expect(sql).toContain('group by r.role');
    expect(sql).not.toMatch(/limit 50/);
    // The same candidates as the list, blocks, suspensions and hiding included.
    expect(sql).toMatch(/user_blocks/);
    expect(sql).toMatch(/not u\.nearby_hidden/);
    expect(params).toEqual([ME, 10.3157, 123.8854, 30, []]);
    expect(counts.Photographer).toBe(120);
    expect(counts).not.toHaveProperty('Not a role');
  });

  it('counts nobody when there is nowhere to measure from', async () => {
    const { service, query } = serviceOver([], {
      ...placedByAddress,
      lat: null,
      lon: null,
      source: null,
    });

    const counts = await service.roleCounts(ME);

    expect(query).not.toHaveBeenCalled();
    expect(Object.values(counts).every((n) => n === 0)).toBe(true);
  });
});

describe('DiscoverService.sharingStatus', () => {
  it('says an address is enough to appear, and names the place for the installed apps', async () => {
    const { service } = serviceOver([]);

    expect(await service.sharingStatus(ME)).toEqual({
      sharing: true,
      updatedAt: null,
      place: 'Cebu City',
      source: 'address',
      hidden: false,
      addressPlace: 'Cebu City',
      shared: null,
    });
  });

  it('does not call a hidden account discoverable', async () => {
    const { service } = serviceOver([], { ...placedByAddress, nearby_hidden: true });

    const status = await service.sharingStatus(ME);

    expect(status.sharing).toBe(false);
    expect(status.hidden).toBe(true);
    expect(status.source).toBe('address');
  });

  it('reports a stale device position as shared while the address places them', async () => {
    const old = new Date('2026-01-01T00:00:00Z');
    const { service } = serviceOver([], {
      ...placedByAddress,
      shares_location: true,
      latitude: 10.29,
      location_updated_at: old,
    });

    const status = await service.sharingStatus(ME);

    expect(status.shared).toBe('gps');
    expect(status.source).toBe('address');
    expect(status.updatedAt).toBe(old);
  });
});

describe('DiscoverService.setHidden', () => {
  it('writes the flag and answers with the new status', async () => {
    const { service, query } = serviceOver([], { ...placedByAddress, nearby_hidden: true });

    const status = await service.setHidden(ME, true);

    expect(query).toHaveBeenCalledWith('update users set nearby_hidden = $2 where id = $1', [
      ME,
      true,
    ]);
    expect(status.hidden).toBe(true);
  });
});

describe('DiscoverService.placeAddresses', () => {
  it('places a batch, and marks the rows it could not place as looked at', async () => {
    const query = jest.fn(async (sql: string, params?: unknown[]) => {
      if (/^\s*select id, address_city/.test(sql)) {
        // One batch, smaller than the limit, so the loop stops after it.
        return [
          { id: 'a', address_city: 'Mandaue City', address_province: 'Cebu' },
          { id: 'b', address_city: 'Atlantis', address_province: 'Narnia' },
        ];
      }
      return ((params?.[0] as string[]) ?? []).map((id) => ({ id }));
    });
    const service = new DiscoverService({
      query,
      queryOne: jest.fn(),
    } as unknown as DatabaseService);

    const seen = await service.placeAddresses(10);

    expect(seen).toBe(2);
    const [sql, params] = query.mock.calls[1];
    expect(sql).toMatch(/address_geocoded_at = now\(\)/);
    expect(sql).toMatch(/where u\.id = v\.id and u\.address_geocoded_at is null/);
    expect(params).toEqual([
      ['a', 'b'],
      [10.3237, null],
      [123.9227, null],
      ['Mandaue', null],
    ]);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('stops rather than reading the same batch forever when nothing is written', async () => {
    const query = jest.fn(async (sql: string) =>
      /^\s*select id, address_city/.test(sql)
        ? [{ id: 'a', address_city: 'Cebu', address_province: 'Cebu' }]
        : [],
    );
    const service = new DiscoverService({
      query,
      queryOne: jest.fn(),
    } as unknown as DatabaseService);

    await service.placeAddresses(1);

    expect(query).toHaveBeenCalledTimes(2);
  });
});
