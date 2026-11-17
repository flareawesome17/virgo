/**
 * The Virgo things a chat can carry as a card.
 *
 * Each is a message kind of its own (migration 112). The message stores only
 * what the thing is — an id, and for album photos the client link made for
 * them — and the details are read fresh every time the thread is, so a moved
 * date or an edited package shows as it is now, not as it was sent.
 *
 * Every card's body is a plain line with its link, written when it is sent.
 * That is what the chat list, a push and an app from before cards show.
 */
export const CARD_KINDS = ['album-photos', 'booking', 'job-post', 'post', 'package', 'date-plan'] as const;
export type CardKind = (typeof CARD_KINDS)[number];

/** The calendar's kinds of entry a date card can be, as the calendar names them. */
export const PLAN_TYPES = ['event', 'meeting', 'editing', 'review', 'delivery'] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

/** Photos in one card. Far under a client link's own limit, and a chat is not an album. */
export const MAX_CARD_FILES = 500;
