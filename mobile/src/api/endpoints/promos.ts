import { api } from '../client';

export type PromoKind = 'targeted' | 'referral';

/**
 * A reward being offered to this account, waiting to be taken.
 *
 * Only unclaimed and unexpired offers ever reach a client — the server does
 * not send a lapsed one, because there is nothing to be done about it and a
 * dead offer on screen reads as a bug.
 */
export interface OfferedPromo {
  /** What you claim. The promo's own id is deliberately not exposed here. */
  grantId: string;
  name: string;
  description: string | null;
  kind: PromoKind;
  /** Extra storage in bytes. Zero when this promo gives none. */
  storageBytes: number;
  extraWorkspaces: number;
  extraAlbumsPerWorkspace: number;
  /** Null means it does not expire. */
  expiresAt: string | null;
  /** Who joining earned this, on a referral. Null on a targeted offer. */
  referredName: string | null;
}

export interface ClaimedPromo {
  claimed: true;
  /** "5 GB of storage and 2 extra workspaces", ready to show. */
  reward: string;
  /**
   * The account's totals *after* claiming. null means unlimited.
   *
   * Sent so the congratulation can say "your storage is now 30 GB" instead of
   * only naming the reward. A promo adds to what the plan already gives, and
   * without the new total somebody has to do that sum themselves — or wonder
   * whether it replaced their allowance rather than adding to it.
   */
  limits: {
    storageBytes: number | null;
    workspaces: number | null;
    albumsPerWorkspace: number | null;
  };
}

export const promosApi = {
  /** What this account is being offered right now. */
  offers(): Promise<OfferedPromo[]> {
    return api.get('/promos');
  },

  /**
   * This account's referral code.
   *
   * Allocated on the first read rather than at signup, so most accounts —
   * which never share one — never get a column filled in.
   */
  referralCode(): Promise<{ code: string }> {
    return api.get('/promos/referral-code');
  },

  claim(grantId: string): Promise<ClaimedPromo> {
    return api.post(`/promos/${grantId}/claim`);
  },
};

/** "5 GB", "512 MB". Bytes are never shown raw. */
export function storageLabel(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${Math.round(gb * 10) / 10} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

/**
 * What a promo gives, in one line.
 *
 * The server composes the same sentence for notifications; this exists so a
 * card can render it without a round trip, and the two are deliberately
 * worded the same way.
 */
export function rewardLabel(promo: {
  storageBytes: number;
  extraWorkspaces: number;
  extraAlbumsPerWorkspace: number;
}): string {
  const parts: string[] = [];
  if (promo.storageBytes > 0) {
    parts.push(`${storageLabel(promo.storageBytes)} of storage`);
  }
  if (promo.extraWorkspaces > 0) {
    parts.push(
      `${promo.extraWorkspaces} extra workspace${promo.extraWorkspaces === 1 ? '' : 's'}`,
    );
  }
  if (promo.extraAlbumsPerWorkspace > 0) {
    parts.push(
      `${promo.extraAlbumsPerWorkspace} more album${
        promo.extraAlbumsPerWorkspace === 1 ? '' : 's'
      } per workspace`,
    );
  }
  if (parts.length === 0) return 'A reward';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * "Expires in 3 days", or null when it never does.
 *
 * Rounded up, so an offer with eleven hours left says "1 day" rather than
 * "0 days" — the number is there to create urgency honestly, and rounding
 * down would show zero for something still claimable.
 */
export function expiryLabel(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const hours = Math.ceil(ms / 3_600_000);
  if (hours <= 1) return 'Expires within the hour';
  if (hours < 24) return `Expires in ${hours} hours`;
  const days = Math.ceil(hours / 24);
  return `Expires in ${days} day${days === 1 ? '' : 's'}`;
}
