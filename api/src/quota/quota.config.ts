/**
 * Subscription plans.
 *
 * `pro` is kept as an alias of `freelance` so accounts already carrying it do
 * not silently drop to free limits when the tiers were renamed.
 */
export type PlanName = 'free' | 'freelance' | 'studio' | 'pro';

export interface PlanLimits {
  /** Total bytes of stored media. */
  storageBytes: number;
  /** Maximum workspaces. */
  workspaces: number;
  /**
   * Maximum albums *per workspace*.
   *
   * Per workspace rather than in total: the plan is sold as "2 workspaces with
   * 5 albums each", and a global cap would let one workspace consume the whole
   * allowance and leave the second unusable.
   */
  albumsPerWorkspace: number;
}

export interface PlanInfo extends PlanLimits {
  name: PlanName;
  label: string;
  /**
   * Price per month in minor units — centavos, so 140000 is ₱1,400.
   *
   * Minor units rather than a decimal because that is what PayMongo charges
   * in, and a float that has been through a currency conversion is how a
   * customer gets billed ₱1,399.99.
   */
  priceMinor: number;
  /** ISO 4217. PayMongo settles PHP only, so this is PHP everywhere. */
  currency: 'PHP';
  /** Listed but not purchasable yet. */
  comingSoon: boolean;
  features: string[];
}

const GB = 1024 ** 3;

const FREELANCE: PlanLimits = {
  storageBytes: 100 * GB,
  workspaces: 2,
  albumsPerWorkspace: 5,
};

/**
 * Per-plan limits.
 *
 * `Infinity` means unbounded — JSON.stringify turns that into null, so the
 * usage endpoint maps it to `null` explicitly rather than leaking NaN.
 */
export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  free: {
    storageBytes: 15 * GB,
    workspaces: 1,
    albumsPerWorkspace: 2,
  },
  freelance: FREELANCE,
  // An alias, not a separate tier — same limits.
  pro: FREELANCE,
  studio: {
    storageBytes: 1024 * GB,
    workspaces: Infinity,
    albumsPerWorkspace: Infinity,
  },
};

/** What the plans screen renders, in display order. */
export const PLAN_CATALOGUE: PlanInfo[] = [
  {
    name: 'free',
    label: 'Free',
    priceMinor: 0,
    currency: 'PHP',
    comingSoon: false,
    ...PLAN_LIMITS.free,
    features: ['15 GB cloud storage', '1 workspace', '2 albums', 'Client share links'],
  },
  {
    name: 'freelance',
    label: 'Freelance',
    // ₱1,400 a month.
    priceMinor: 140_000,
    currency: 'PHP',
    comingSoon: false,
    ...FREELANCE,
    features: [
      '100 GB cloud storage',
      '2 workspaces',
      '5 albums per workspace',
      'Client share links',
      'Collaborators and chat',
    ],
  },
  {
    name: 'studio',
    label: 'Studio',
    priceMinor: 0,
    currency: 'PHP',
    comingSoon: true,
    ...PLAN_LIMITS.studio,
    features: [
      'Unlimited workspaces and albums',
      '1 TB cloud storage',
      'Team roles and permissions',
    ],
  },
];

/** The tiers that can actually be bought. */
export const PURCHASABLE_PLANS = PLAN_CATALOGUE.filter(
  (plan) => !plan.comingSoon && plan.priceMinor > 0,
);

export function planInfo(name: string): PlanInfo | undefined {
  return PLAN_CATALOGUE.find((plan) => plan.name === name);
}

export function limitsFor(plan: string): PlanLimits {
  return PLAN_LIMITS[(plan as PlanName) in PLAN_LIMITS ? (plan as PlanName) : 'free'];
}

/** Infinity is not representable in JSON; callers get null instead. */
export function toJsonLimit(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}
