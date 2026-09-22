import { NotFoundException } from '@nestjs/common';
import type { DatabaseService } from '../database/database.service';
import type { PortfolioService } from './portfolio.service';
import { NEVER_PUBLIC, ProfilesService } from './profiles.service';

/**
 * The public profile: who gets one, and what is in it.
 *
 * NEVER_PUBLIC promises a test that nothing on that list reaches the payload.
 * This is it. The database is faked with a row carrying every one of those
 * columns, so a return shape that started spreading the row would fail here.
 */

const VIEWER = '11111111-1111-4111-8111-111111111111';

const everyColumn = {
  id: '22222222-2222-4222-8222-222222222222',
  handle: 'ana',
  display_name: 'Ana Cruz',
  email: 'ana@example.com',
  avatar_url: null,
  title: 'Photographer',
  bio: null,
  location: 'Cebu City',
  website: null,
  roles: ['Photographer'],
  created_at: new Date('2025-03-01T00:00:00Z'),
  phone: '+639170000000',
  latitude: 10.3,
  longitude: 123.9,
  location_updated_at: new Date(),
  shares_location: true,
  last_seen_at: new Date(),
  plan: 'pro',
  plan_since: new Date(),
  paymongo_customer_id: 'cus_1',
  password_hash: 'x',
  discoverable: true,
  email_verified_at: new Date(),
  disabled_until: null,
  disabled_at: null,
  suspended_at: null,
};

function serviceOver(row: Record<string, unknown> | null) {
  const queryOne = jest.fn(async (_sql: string, _params?: unknown[]) => row);
  const db = { queryOne } as unknown as DatabaseService;
  const portfolio = { list: jest.fn(async () => []) };
  const service = new ProfilesService(db, portfolio as unknown as PortfolioService);
  return { service, queryOne };
}

describe('ProfilesService.publicProfile', () => {
  it('is not there across a block, either way, or for a suspended account', async () => {
    const { service, queryOne } = serviceOver(everyColumn);

    await service.publicProfile('Ana', VIEWER);

    const [sql, params] = queryOne.mock.calls[0];
    expect(params).toEqual(['ana', VIEWER]);
    expect(sql).toMatch(/u\.suspended_at is null/);
    expect(sql).toMatch(/user_blocks/);
    expect(sql).toMatch(/ub\.blocker_id = \$2 and ub\.blocked_id = u\.id/);
    expect(sql).toMatch(/ub\.blocker_id = u\.id and ub\.blocked_id = \$2/);
  });

  it('returns none of the columns that must never be public', async () => {
    const { service } = serviceOver(everyColumn);

    const profile = await service.publicProfile('ana', VIEWER);

    expect(NEVER_PUBLIC).toContain('suspended_at');
    for (const key of NEVER_PUBLIC) {
      expect(profile).not.toHaveProperty(key);
    }
    expect(JSON.stringify(profile)).not.toContain('ana@example.com');
  });

  it('gives one 404 for every reason there is no profile', async () => {
    const { service } = serviceOver(null);

    await expect(service.publicProfile('ana', VIEWER)).rejects.toThrow(
      new NotFoundException('Profile not found'),
    );
  });
});
