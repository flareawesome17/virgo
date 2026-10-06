import { audienceSelect, audienceWhere, cleanFilters, storageThreshold } from './audience';

/**
 * The one definition of an audience. Counts are checked against real Postgres
 * where the SQL runs; these pin that nothing a caller sends becomes SQL, and
 * what each filter means.
 */
describe('cleanFilters', () => {
  it('keeps what it knows, with values it accepts, and drops the rest', () => {
    expect(
      cleanFilters({
        plan: 'pro',
        status: 'active',
        seen: 'dormant',
        platform: 'ios',
        twoFactor: 'on',
        referred: 'yes',
        joinedAfter: '2026-09-01',
        versionBelow: '1.15',
        storageAbove: '75',
        nonsense: 'x',
      }),
    ).toEqual({
      plan: 'pro',
      status: 'active',
      seen: 'dormant',
      platform: 'ios',
      twoFactor: 'on',
      referred: 'yes',
      joinedAfter: '2026-09-01',
      versionBelow: '1.15',
      storageAbove: 75,
    });
  });

  it('refuses values that are not what they claim to be', () => {
    expect(
      cleanFilters({
        plan: 'diamond',
        tag: 'not-a-uuid',
        joinedAfter: '1 Sept',
        versionBelow: "1'; drop table users; --",
        storageAbove: 900,
        platform: 'windows',
      }),
    ).toEqual({});
  });

  it('reads the old "nearly full" link as 80%', () => {
    expect(cleanFilters({ full: 'true' })).toEqual({ storageAbove: 80 });
    expect(storageThreshold({ full: 'true' })).toBe(0.8);
    expect(storageThreshold({ storageAbove: 50 })).toBe(0.5);
    expect(storageThreshold({})).toBeNull();
  });

  it('copes with nothing at all', () => {
    expect(cleanFilters(undefined)).toEqual({});
    expect(cleanFilters('plan=pro')).toEqual({});
  });
});

describe('audienceWhere', () => {
  it('binds every value and adds nothing for no filters', () => {
    const args: unknown[] = [];
    expect(audienceWhere({}, args)).toEqual([]);
    expect(args).toEqual([]);

    const where = audienceWhere({ q: "o'brien", plan: 'pro', joinedAfter: '2026-09-01' }, args);
    expect(args).toEqual(["%o'brien%", 'pro', '2026-09-01']);
    expect(where.join(' ')).not.toContain("o'brien");
    expect(where).toContain('u.plan = $2');
    expect(where).toContain('u.created_at >= $3::date');
  });

  it('compares versions part by part, as numbers', () => {
    const args: unknown[] = [];
    const [fragment] = audienceWhere({ versionBelow: 'v1.15.2' }, args);
    expect(args).toEqual([[1, 15, 2]]);
    expect(fragment).toContain('::int[] < $1::int[]');
    // The cast only ever meets a plain numeric version.
    expect(fragment).toContain("case when p.app_version ~");
  });

  it('turns "joined before" into the end of that day', () => {
    const args: unknown[] = [];
    expect(audienceWhere({ joinedBefore: '2026-09-30' }, args)).toEqual(['u.created_at < $1::date + 1']);
  });

  it('starts numbering after parameters the caller already has', () => {
    const args: unknown[] = ['already', 'here'];
    expect(audienceWhere({ plan: 'free' }, args)).toEqual(['u.plan = $3']);
  });
});

describe('audienceSelect', () => {
  it('selects ids, with extra conditions and the storage figure bound', () => {
    const args: unknown[] = [];
    const sql = audienceSelect({ plan: 'pro', storageAbove: 90 }, args, ['u.suspended_at is null']);
    expect(sql.startsWith('select u.id from users u where u.plan = $1 and u.suspended_at is null and ')).toBe(true);
    expect(sql).toContain('>= $2::numeric *');
    expect(args).toEqual(['pro', 0.9]);
  });

  it('is everyone when there is nothing to narrow it', () => {
    const args: unknown[] = [];
    expect(audienceSelect({}, args)).toBe('select u.id from users u');
  });
});
