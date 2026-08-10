/**
 * Subscription plans.
 *
 * `pro` is kept as an alias of `freelance` so accounts already carrying it do
 * not silently drop to free limits when the tiers were renamed.
 */
export type PlanName = 'free' | 'freelance' | 'studio' | 'business' | 'pro';

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

const TB = 1024 ** 4;

const FREELANCE: PlanLimits = {
  storageBytes: 100 * GB,
  workspaces: 3,
  albumsPerWorkspace: 10,
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
    storageBytes: 500 * GB,
    workspaces: 10,
    albumsPerWorkspace: Infinity,
  },
  business: {
    storageBytes: 2 * TB,
    workspaces: Infinity,
    albumsPerWorkspace: Infinity,
  },
};

/**
 * What the plans screen renders, in display order.
 *
 * Everything paid is `comingSoon` for the pre-release. Free is the only tier
 * anyone can be on, deliberately: the point of the pre-release is to find out
 * what working photographers actually need before a number is committed to,
 * and ₱1,400 was set before there was any evidence for it.
 *
 * The ladder is still listed, priced, so visitors can see where this is going
 * and say if ₱399 is wrong while that is still cheap to change.
 *
 * The `name` keys are deliberately unchanged even though the labels moved
 * ("Freelance" is now "Freelancer"). `users.plan` stores these strings, and
 * renaming a key would silently drop every account holding the old one to
 * free limits.
 */
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
    label: 'Freelancer',
    // ₱399 a month.
    priceMinor: 39_900,
    currency: 'PHP',
    comingSoon: true,
    ...FREELANCE,
    features: [
      '100 GB cloud storage',
      '3 workspaces',
      '10 albums per workspace',
      'Client share links',
      'Collaborators and chat',
    ],
  },
  {
    name: 'studio',
    label: 'Studio',
    // ₱999 a month.
    priceMinor: 99_900,
    currency: 'PHP',
    comingSoon: true,
    ...PLAN_LIMITS.studio,
    features: [
      '500 GB cloud storage',
      '10 workspaces',
      // Not bare "unlimited": an album holds media, so storage stays the real
      // constraint and the copy should not promise otherwise.
      'Unlimited albums within your storage',
      'Team roles and permissions',
    ],
  },
  {
    name: 'business',
    label: 'Business',
    // ₱2,499 a month.
    priceMinor: 249_900,
    currency: 'PHP',
    comingSoon: true,
    ...PLAN_LIMITS.business,
    features: [
      '2 TB cloud storage',
      'Unlimited workspaces',
      'Unlimited albums within your storage',
      'Advanced permissions and activity history',
      'Priority support',
    ],
  },
];

/**
 * The tiers that can actually be bought — empty during the pre-release.
 *
 * Callers must handle that: an "one of: <list>" message built from this reads
 * as a broken sentence when the list is empty, so use PURCHASE_REFUSAL.
 */
export const PURCHASABLE_PLANS = PLAN_CATALOGUE.filter(
  (plan) => !plan.comingSoon && plan.priceMinor > 0,
);

/** Why a purchase was refused, phrased for whichever case is true today. */
export const PURCHASE_REFUSAL = PURCHASABLE_PLANS.length
  ? `Choose one of: ${PURCHASABLE_PLANS.map((p) => p.name).join(', ')}`
  : 'Paid plans are not available yet — Virgo is free during the pre-release.';

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
