import { api } from '../client';

export interface UsageSummary {
  plan: string;
  storage: {
    usedBytes: number;
    /** null means unlimited. */
    limitBytes: number | null;
    fileCount: number;
  };
  workspaces: { used: number; limit: number | null };
  albums: { used: number; limit: number | null };
}

export interface PlanInfo {
  name: string;
  label: string;
  /**
   * Price per month in minor units — centavos, so 140000 is ₱1,400.
   *
   * Minor units because that is what PayMongo charges in; a float that has
   * been near a currency conversion is how somebody gets billed ₱1,399.99.
   */
  priceMinor: number;
  /** ISO 4217. PayMongo settles PHP only, so this is PHP. */
  currency: string;
  /** Listed but not purchasable yet. */
  comingSoon: boolean;
  storageBytes: number;
  /** null means unlimited. */
  workspaces: number | null;
  /** Per workspace, not in total. null means unlimited. */
  albumsPerWorkspace: number | null;
  features: string[];
}

/**
 * Plan limits and current consumption.
 *
 * Storage here is what is actually stored in the bucket — recorded server-side
 * from the size B2 reports when an upload is confirmed, not from anything the
 * device measures locally.
 */
export const usageApi = {
  get(): Promise<UsageSummary> {
    return api.get<UsageSummary>('/me/usage');
  },

  /** The tiers on offer, straight from the limits the server enforces. */
  plans(): Promise<{ data: PlanInfo[]; total: number }> {
    return api.get('/plans');
  },
};

/** `1.4 GB`, `860 MB`, `12 KB`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Gigabytes as a number, for progress bars. */
export function toGB(bytes: number): number {
  return bytes / 1024 ** 3;
}

/**
 * `₱1,400` — a price in minor units, rendered.
 *
 * Grouped, and without decimals when there are none: ₱1,400.00 on a pricing
 * card reads like a form field rather than a price.
 */
export function formatMoney(minor: number, currency = 'PHP'): string {
  const major = minor / 100;
  try {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency,
      minimumFractionDigits: major % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    // An unknown currency code should not take the pricing page down.
    return `${currency} ${major.toFixed(2)}`;
  }
}
