export type PlanName = 'free' | 'pro';

export interface PlanLimits {
  /** Total bytes of stored media. */
  storageBytes: number;
  /** Maximum workspaces. */
  workspaces: number;
  /** Maximum albums, across all workspaces. */
  albums: number;
}

const GB = 1024 ** 3;

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
    albums: 2,
  },
  pro: {
    storageBytes: 512 * GB,
    workspaces: Infinity,
    albums: Infinity,
  },
};

export function limitsFor(plan: string): PlanLimits {
  return PLAN_LIMITS[(plan as PlanName) in PLAN_LIMITS ? (plan as PlanName) : 'free'];
}

/** Infinity is not representable in JSON; callers get null instead. */
export function toJsonLimit(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}
