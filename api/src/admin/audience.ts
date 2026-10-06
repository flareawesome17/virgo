import { PLAN_CATALOGUE, limitsFor } from '../quota/quota.config';

/**
 * Who a filter means, as SQL — the one definition of "these people" that the
 * people list, a segment's count, a broadcast and a promo offered to a
 * segment all share, so a number in one place is the same people in another.
 *
 * Every value is a bind parameter or a fixed fragment chosen by a key:
 * nothing a caller sends becomes SQL. Fragments refer to `u`, the users row.
 */
export interface AudienceFilters {
  /** Matches email, name or handle. */
  q?: string;
  plan?: string;
  /** active, suspended, paused or unverified. */
  status?: string;
  /**
   * week (seen in the last 7 days), month (in the last 30), quiet (not in 30)
   * or dormant (not in 90). There is no "never": last_seen_at defaults to the
   * moment an account is made.
   */
  seen?: string;
  /** A tag's id. */
  tag?: string;
  /** ios or android: has push turned on for that platform. */
  platform?: string;
  /** on or off. */
  twoFactor?: string;
  /** 'true': at 80% or more of what the account may store. Kept for old links. */
  full?: string;
  /** At or above this percentage of what the account may store, promos included. */
  storageAbove?: number | string;
  /** Signed up on or after this day (YYYY-MM-DD). */
  joinedAfter?: string;
  /** Signed up before the end of this day. */
  joinedBefore?: string;
  /** yes: joined through somebody's referral. no: did not. */
  referred?: string;
  /** Has a phone whose app is older than this version. */
  versionBelow?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const VERSION = /^v?\d{1,6}(\.\d{1,6}){0,3}$/;

/** The account states, as the console's badges read them (lib/account-state.ts). */
export const USER_STATUS: Record<string, string> = {
  suspended: 'u.suspended_at is not null',
  paused: 'u.suspended_at is null and u.disabled_until > now()',
  unverified:
    'u.suspended_at is null and (u.disabled_until is null or u.disabled_until <= now()) and u.email_verified_at is null',
  active:
    'u.suspended_at is null and (u.disabled_until is null or u.disabled_until <= now()) and u.email_verified_at is not null',
};

export const USER_SEEN: Record<string, string> = {
  week: "u.last_seen_at > now() - interval '7 days'",
  month: "u.last_seen_at > now() - interval '30 days'",
  quiet: "(u.last_seen_at is null or u.last_seen_at < now() - interval '30 days')",
  dormant: "(u.last_seen_at is null or u.last_seen_at < now() - interval '90 days')",
};

/**
 * Each plan's storage allowance as SQL, for the storage filters. The
 * allowances live in quota.config.ts, not the database, so the CASE is
 * written from them; an unlimited plan is never nearly full.
 */
export function planStorageCase(column: string): string {
  const names = new Set([...PLAN_CATALOGUE.map((p) => p.name), 'pro']);
  const arms = [...names].map((name) => {
    const bytes = limitsFor(name).storageBytes;
    return `when '${name}' then ${Number.isFinite(bytes) ? Math.round(bytes) : '1e18'}`;
  });
  return `(case ${column} ${arms.join(' ')} else ${Math.round(limitsFor('free').storageBytes)} end)::numeric`;
}

/** What the account stores, and what claimed promos add to its allowance. */
export const STORED_BYTES =
  '(select coalesce(sum(f.size_bytes), 0) from user_files f where f.user_id = u.id)';
export const BONUS_BYTES = `(select coalesce(sum(p.storage_bytes), 0)
     from promo_grants g join promos p on p.id = g.promo_id
    where g.user_id = u.id and g.claimed_at is not null)`;

/** The storage threshold the filters ask for, as a fraction, or null. */
export function storageThreshold(f: AudienceFilters): number | null {
  const percent = Number(f.storageAbove);
  if (Number.isFinite(percent) && percent >= 1 && percent <= 100) return percent / 100;
  return f.full === 'true' ? 0.8 : null;
}

/**
 * Keeps only filters the API understands, with values it accepts. What a
 * segment or a broadcast stores, so nothing odd is ever saved to be read
 * back as an audience later.
 */
export function cleanFilters(input: unknown): AudienceFilters {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: AudienceFilters = {};
  const text = (key: keyof AudienceFilters, ok: (v: string) => boolean) => {
    const value = raw[key];
    if (typeof value === 'string' && value.trim() && ok(value.trim())) {
      (out as Record<string, unknown>)[key] = value.trim();
    }
  };
  text('q', (v) => v.length <= 200);
  text('plan', (v) => [...PLAN_CATALOGUE.map((p) => p.name), 'pro'].includes(v));
  text('status', (v) => v in USER_STATUS);
  text('seen', (v) => v in USER_SEEN);
  text('tag', (v) => UUID.test(v));
  text('platform', (v) => v === 'ios' || v === 'android');
  text('twoFactor', (v) => v === 'on' || v === 'off');
  text('joinedAfter', (v) => DAY.test(v));
  text('joinedBefore', (v) => DAY.test(v));
  text('referred', (v) => v === 'yes' || v === 'no');
  text('versionBelow', (v) => VERSION.test(v));
  const percent = Number(raw.storageAbove);
  if (Number.isFinite(percent) && percent >= 1 && percent <= 100) out.storageAbove = Math.round(percent);
  else if (raw.full === 'true') out.storageAbove = 80;
  return out;
}

/**
 * The WHERE fragments for these filters, adding their values to `args`.
 * Storage is left to the caller (see storageThreshold): the people list has
 * the figures already, in a CTE; a segment adds the fragment below.
 */
export function audienceWhere(f: AudienceFilters, args: unknown[]): string[] {
  const where: string[] = [];
  const bind = (value: unknown) => {
    args.push(value);
    return `$${args.length}`;
  };

  const q = f.q?.trim();
  if (q) {
    const p = bind(`%${q}%`);
    where.push(`(u.email ilike ${p} or u.display_name ilike ${p} or u.handle ilike ${p})`);
  }
  if (f.plan?.trim()) where.push(`u.plan = ${bind(f.plan.trim())}`);
  const status = USER_STATUS[f.status ?? ''];
  if (status) where.push(status);
  const seen = USER_SEEN[f.seen ?? ''];
  if (seen) where.push(seen);
  if (f.twoFactor === 'on') where.push('u.two_factor_enabled_at is not null');
  if (f.twoFactor === 'off') where.push('u.two_factor_enabled_at is null');
  if (f.tag && UUID.test(f.tag)) {
    where.push(
      `exists (select 1 from customer_tag_links l where l.user_id = u.id and l.tag_id = ${bind(f.tag)}::uuid)`,
    );
  }
  if (f.platform === 'ios' || f.platform === 'android') {
    where.push(
      `exists (select 1 from push_tokens p where p.user_id = u.id and p.platform = ${bind(f.platform)} and p.disabled_at is null)`,
    );
  }
  if (f.joinedAfter && DAY.test(f.joinedAfter)) {
    where.push(`u.created_at >= ${bind(f.joinedAfter)}::date`);
  }
  if (f.joinedBefore && DAY.test(f.joinedBefore)) {
    where.push(`u.created_at < ${bind(f.joinedBefore)}::date + 1`);
  }
  if (f.referred === 'yes') where.push('u.referred_by_user_id is not null');
  if (f.referred === 'no') where.push('u.referred_by_user_id is null');
  if (f.versionBelow && VERSION.test(f.versionBelow)) {
    // Compared as numbers, part by part: 1.10.0 is newer than 1.9.0, which
    // neither text nor a single cast gets right. The CASE keeps the cast
    // away from any stored version that is not plain numbers.
    const parts = f.versionBelow.replace(/^v/, '').split('.').map(Number);
    where.push(`exists (
      select 1 from push_tokens p
       where p.user_id = u.id and p.disabled_at is null
         and case when p.app_version ~ '^v?[0-9]{1,6}(\\.[0-9]{1,6}){0,3}$'
                  then string_to_array(ltrim(p.app_version, 'v'), '.')::int[] < ${bind(parts)}::int[]
                  else false end)`);
  }
  return where;
}

/**
 * The ids of everyone these filters mean, as one SELECT over `u`. Storage is
 * folded in as a correlated figure, which a segment of thousands affords; the
 * people list, which shows the figures too, computes them once in a CTE.
 */
export function audienceSelect(
  f: AudienceFilters,
  args: unknown[],
  extra: string[] = [],
): string {
  const where = [...audienceWhere(f, args), ...extra];
  const threshold = storageThreshold(f);
  if (threshold !== null) {
    args.push(threshold);
    where.push(
      `${STORED_BYTES} >= $${args.length}::numeric * (${planStorageCase('u.plan')} + ${BONUS_BYTES})`,
    );
  }
  return `select u.id from users u${where.length ? ` where ${where.join(' and ')}` : ''}`;
}
