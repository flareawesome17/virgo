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
  /** Cents per month, billed monthly. Zero on free. */
  priceCents: number;
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
    priceCents: 0,
    comingSoon: false,
    ...PLAN_LIMITS.free,
    features: ['15 GB cloud storage', '1 workspace', '2 albums', 'Client share links'],
  },
  {
    name: 'freelance',
    label: 'Freelance',
    priceCents: 2500,
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
    priceCents: 0,
    comingSoon: true,
    ...PLAN_LIMITS.studio,
    features: [
      'Unlimited workspaces and albums',
      '1 TB cloud storage',
      'Team roles and permissions',
    ],
  },
];

export function limitsFor(plan: string): PlanLimits {
  return PLAN_LIMITS[(plan as PlanName) in PLAN_LIMITS ? (plan as PlanName) : 'free'];
}

/** Infinity is not representable in JSON; callers get null instead. */
export function toJsonLimit(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}
