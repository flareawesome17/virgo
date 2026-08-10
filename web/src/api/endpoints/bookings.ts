import { api } from '../client';

export type BookingSide = 'poster' | 'creative';

/**
 * What the two of them actually agreed.
 *
 * Not a contract — no signature, no legal weight. What it gives is narrower:
 * terms neither person can change quietly, because any edit clears both
 * confirmations and the other side has to agree again.
 */
export interface Booking {
  id: string;
  applicationId: string;
  postId: string;
  postTitle: string;
  postSlug: string;
  /** Which side you are on. Every screen branches on this. */
  yourSide: BookingSide;
  otherParty: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    handle: string | null;
  };
  role: string | null;
  eventDate: string | null;
  location: string | null;
  /** Centavos, like every other money field. */
  rateMinor: number | null;
  currency: string;
  notes: string | null;
  /**
   * Whether the creative has agreed to the terms as they currently stand.
   *
   * One flag, not a pair. The poster writes the terms — that is their part —
   * and the creative agrees or does not, which is what hiring somebody is.
   * Read it with `yourSide`: for a poster it means "they said yes", for a
   * creative it means "you said yes".
   *
   * Any edit clears it, so it is always about the terms on screen now.
   */
  confirmed: boolean;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  conversationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BookingPatch {
  role?: string | null;
  eventDate?: string | null;
  location?: string | null;
  rateMinor?: number | null;
  notes?: string | null;
}

export const bookingsApi = {
  list(): Promise<Booking[]> {
    return api.get('/bookings');
  },

  byId(id: string): Promise<Booking> {
    return api.get(`/bookings/${id}`);
  },

  /** Either side, while it is not cancelled. Clears both confirmations. */
  update(id: string, patch: BookingPatch): Promise<Booking> {
    return api.patch(`/bookings/${id}`, { body: patch });
  },

  confirm(id: string): Promise<Booking> {
    return api.post(`/bookings/${id}/confirm`);
  },

  cancel(id: string, reason?: string): Promise<Booking> {
    return api.post(`/bookings/${id}/cancel`, { body: { reason } });
  },
};

/** "PHP 15,000" from centavos. Null when no rate has been agreed. */
export function rateLabel(
  minor: number | null | undefined,
  currency = 'PHP',
): string | null {
  if (minor == null) return null;
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}
