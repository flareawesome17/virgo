import { api } from '../client';
import type { PayCardContext } from './money';
import { formatMoney } from './usage';

export interface Conversation {
  id: string;
  isGroup: boolean;
  /** Group title, or the other person's name for a direct chat. */
  title: string;
  avatarUrl: string | null;
  participantCount: number;
  lastMessage: string | null;
  lastAt: string | null;
  lastSender: string | null;
  unread: number;
  /**
   * The line that matched a search, when the hit was inside the thread rather
   * than on its name. Null outside of search, and null when it would just
   * repeat `lastMessage`.
   */
  matchSnippet: string | null;
  /** Whether you have muted it, and until when. */
  muted: boolean;
  mutedUntil: string | null;
  /**
   * The other person in a direct chat. Null on a group.
   *
   * Presence arrives as a stream of socket events keyed by account id, so the
   * list needs the id to match them against — the title alone is not enough.
   */
  otherUserId: string | null;
  /** Their state when this response was made; the socket keeps it current. */
  otherOnline: boolean | null;
  otherLastSeenAt: string | null;
  /*
   * How it sits in your own list. Optional so an older API's response still
   * type-checks; absent reads as false.
   */
  /** Kept at the top of your list. Up to five. */
  pinned?: boolean;
  /** Out of the list until something new is said in it. */
  archived?: boolean;
  /** Marked unread by you, to come back to. Cleared when you read it. */
  markedUnread?: boolean;
}

/**
 * The six reactions. Keys on the wire, emoji on screen: "❤️" is two code
 * points, and a key cannot be sent half-formed.
 */
export const REACTIONS = ['like', 'love', 'haha', 'wow', 'sad', 'thanks'] as const;
export type ReactionKey = (typeof REACTIONS)[number];

export const REACTION_EMOJI: Record<ReactionKey, string> = {
  like: '👍',
  love: '❤️',
  haha: '😂',
  wow: '😮',
  sad: '😢',
  thanks: '🙏',
};

/** What each reaction is called, for screen readers. */
export const REACTION_LABEL: Record<ReactionKey, string> = {
  like: 'Thumbs up',
  love: 'Heart',
  haha: 'Laughing',
  wow: 'Wow',
  sad: 'Sad',
  thanks: 'Thank you',
};

export interface MessageReaction {
  userId: string;
  reaction: ReactionKey;
}

/** How long after sending your own message you can still fix it. The API enforces it too. */
export const EDIT_WINDOW_MINUTES = 15;

/** Whether `message` is yours to edit right now. */
export function canEditMessage(
  message: Pick<ConversationMessage, 'sender_id' | 'created_at' | 'deleted_at' | 'kind'>,
  myId: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!myId || message.sender_id !== myId || message.deleted_at) return false;
  if ((message.kind ?? 'text') !== 'text') return false;
  return now - new Date(message.created_at).getTime() < EDIT_WINDOW_MINUTES * 60_000;
}

/**
 * The reactions on a message, grouped for drawing: each kind once, with how
 * many and whether one of them is yours. In the order each kind first
 * appeared.
 */
export function groupReactions(
  reactions: readonly MessageReaction[] | undefined,
  myId: string | null | undefined,
): { reaction: ReactionKey; count: number; mine: boolean }[] {
  const groups = new Map<ReactionKey, { reaction: ReactionKey; count: number; mine: boolean }>();
  for (const r of reactions ?? []) {
    if (!REACTION_EMOJI[r.reaction]) continue;
    const group = groups.get(r.reaction) ?? { reaction: r.reaction, count: 0, mine: false };
    group.count += 1;
    if (r.userId === myId) group.mine = true;
    groups.set(r.reaction, group);
  }
  return [...groups.values()];
}

/** Your own reaction on a message, if you left one. */
export function myReaction(
  reactions: readonly MessageReaction[] | undefined,
  myId: string | null | undefined,
): ReactionKey | null {
  return reactions?.find((r) => r.userId === myId)?.reaction ?? null;
}

/** One run of a message body: plain words, or a link. */
export type BodyPart = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string };

// A link with a scheme, a www. one, or a bare address on a common ending —
// "virgo.ph/u/ana", "maps.app.goo.gl/x7Qm2", "gcash.com" — the way people
// actually paste them. Stops at whitespace; trailing punctuation is trimmed
// below, so "see virgo.ph/u/x." links the address and not the full stop.
const LINK =
  /\b(?:https?:\/\/[^\s<>]+|www\.[^\s<>]+|(?:[a-z0-9-]+\.)+(?:ph|com|net|org|io|co|app|me|gl|ly|be|to|tv|dev|page|link|info|biz)(?![a-z0-9-])(?:\/[^\s<>]*)?)/gi;
const TRAILING = /[.,!?;:'")\]}]+$/;

/** Splits a message body into words and links, for tappable links. */
export function splitLinks(body: string): BodyPart[] {
  const parts: BodyPart[] = [];
  let last = 0;
  for (const match of body.matchAll(LINK)) {
    let text = match[0];
    const trailing = TRAILING.exec(text)?.[0] ?? '';
    if (trailing) text = text.slice(0, -trailing.length);
    if (!text) continue;
    const start = match.index ?? 0;
    // The domain half of an email address is not a link to open.
    if (start > 0 && body[start - 1] === '@') continue;
    if (start > last) parts.push({ kind: 'text', text: body.slice(last, start) });
    const href = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    parts.push({ kind: 'link', text, href });
    last = start + text.length;
  }
  if (last < body.length) parts.push({ kind: 'text', text: body.slice(last) });
  return parts;
}

/** Whether a link is one of Virgo's own pages, which get a preview. */
export function isVirgoLink(href: string): boolean {
  try {
    const host = new URL(href).hostname.toLowerCase();
    return host === 'virgo.ph' || host.endsWith('.virgo.ph');
  } catch {
    return false;
  }
}

/** The first Virgo link in a body, which is the one a message previews. */
export function firstVirgoLink(body: string): string | null {
  for (const part of splitLinks(body)) {
    if (part.kind === 'link' && isVirgoLink(part.href)) return part.href;
  }
  return null;
}

/** What a chat draws under a Virgo link. From `GET /link-previews`. */
export type LinkPreview =
  | {
      kind: 'album';
      url: string;
      title: string;
      part: 'album' | 'section' | 'files';
      total: number;
      counts: { image: number; video: number; audio: number };
      thumbs: string[];
    }
  | { kind: 'profile'; url: string; title: string; subtitle: string | null; imageUrl: string | null }
  | { kind: 'post'; url: string; title: string; subtitle: string; imageUrl: string | null }
  | { kind: 'job'; url: string; title: string; subtitle: string | null; date: string | null }
  | { kind: 'statement'; url: string; title: string };

/** "84 photos", "12 photos and 2 films", "3 files". */
export function describeAlbumCount(counts: { image: number; video: number; audio: number }): string {
  const bits: string[] = [];
  if (counts.image) bits.push(`${counts.image} photo${counts.image === 1 ? '' : 's'}`);
  if (counts.video) bits.push(`${counts.video} film${counts.video === 1 ? '' : 's'}`);
  if (counts.audio) bits.push(`${counts.audio} recording${counts.audio === 1 ? '' : 's'}`);
  if (bits.length === 0) return 'Nothing in it yet';
  return bits.length === 1 ? bits[0] : `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}`;
}

/** A saved reply: dropped into the message box, never sent on its own. */
export interface SavedReply {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

/** How many saved replies one account can keep. The API enforces it too. */
export const MAX_SAVED_REPLIES = 20;

/** How many chats can be pinned. The API enforces it too. */
export const MAX_PINNED_CHATS = 5;

/** How many chats one Forward can go to. The API enforces it too. */
export const MAX_FORWARD_TARGETS = 5;

/*
 * Chat on a weak signal.
 *
 * The rules both apps follow; each platform only says what the connection is
 * (NetInfo on the phone, the browser's connection hints on web).
 */

/**
 * How good the connection is, as chat cares about it.
 *
 * 'slow' is 2G or 3G, a metered line with "Save data" on, or a browser
 * saying 'slow-2g' / '2g' / '3g'. 'fast' is 4G, 5G or an unknown mobile
 * line. 'wifi' is Wi-Fi or ethernet.
 */
export type ConnectionQuality = 'offline' | 'slow' | 'fast' | 'wifi';

/**
 * The setting: when photos, films, voice notes and link pictures load on
 * their own. Kept on each device, because data plans are per device.
 *
 *   'fast'   on Wi-Fi and fast mobile data (the default)
 *   'always' whatever the connection
 *   'tap'    only when tapped
 */
export type MediaAutoLoad = 'fast' | 'always' | 'tap';

export const MEDIA_AUTO_LOAD_DEFAULT: MediaAutoLoad = 'fast';

export const MEDIA_AUTO_LOAD_LABEL: Record<MediaAutoLoad, string> = {
  fast: 'On Wi-Fi and fast data',
  always: 'Always',
  tap: 'Only when I tap',
};

/** Whether pictures and media should load without a tap right now. */
export function shouldAutoLoadMedia(setting: MediaAutoLoad, quality: ConnectionQuality): boolean {
  if (quality === 'offline') return false;
  if (setting === 'always') return true;
  if (setting === 'tap') return false;
  return quality === 'wifi' || quality === 'fast';
}

/**
 * Nothing bigger than this downloads on its own over mobile data, even when
 * media loads automatically. Files and voice notes above it wait for a tap.
 */
export const AUTO_DOWNLOAD_MAX_BYTES = 300_000;

/** How many messages a chat opens on: fewer on a slow line, older ones on scroll. */
export function firstPageSize(quality: ConnectionQuality): number {
  return quality === 'slow' ? 30 : 100;
}

/**
 * Whether the backup poll should run. The live connection already brings
 * every new message; polling on top of it is only for when it is down.
 */
export function shouldPollChat(socketConnected: boolean): boolean {
  return !socketConnected;
}

/** What you can change about how a chat sits in your own list. */
export interface ListStatePatch {
  pinned?: boolean;
  archived?: boolean;
  markedUnread?: boolean;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender_name?: string;
  /** Set when deleted for everyone; `body` is then empty. */
  deleted_at?: string | null;
  /** Account ids named in the body. */
  mentions?: string[];
  reply_to_id?: string | null;
  /** Quoted preview, null when the quoted message was itself deleted. */
  reply_to_body?: string | null;
  reply_to_sender?: string | null;
  reply_to_deleted?: boolean;
  /**
   * What sort of message this is.
   *
   * 'text' is somebody typing, and is the default for everything written
   * before this existed. 'job-accepted' is the app itself marking the moment
   * an application was accepted, rendered as a card rather than a bubble.
   * 'pay-card' is somebody sending how to pay them, as a card on their side.
   * The rest (CardKind) are Virgo things somebody shared: album photos, a
   * booking, a job post, a post, a package, a date.
   */
  kind?: 'text' | 'job-accepted' | 'pay-card' | CardKind;
  /** What the card needs. Null on a typed message. Read it by `kind`. */
  context?:
    | JobAcceptedContext
    | PayCardContext
    | AlbumCardContext
    | BookingCardContext
    | JobPostCardContext
    | PostCardContext
    | PackageCardContext
    | DatePlanCardContext
    | null;
  /**
   * The id the sender's app gave this message before sending it — how that app
   * matches the stored message to the bubble it drew while sending. Absent
   * from an older API, and null on messages sent before apps made one.
   */
  client_id?: string | null;
  /** When the sender last changed the words. Shown as "Edited". */
  edited_at?: string | null;
  /** Sent with Forward. Shown as a small "Forwarded" label. */
  forwarded?: boolean;
  /** One per person, oldest first. Absent from an older API. */
  reactions?: MessageReaction[];
}

/**
 * The acceptance card.
 *
 * Ids rather than a snapshot of the terms: the booking is editable by both
 * sides, and a card frozen with the rate it opened at would be worse than no
 * card at all — it would show two different agreements on one screen.
 */
export interface JobAcceptedContext {
  applicationId: string;
  postId: string;
  postSlug: string;
  postTitle: string;
  /** Which of the post's roles. Null on posts that only ever wanted one. */
  role: string | null;
  bookingId: string;
}

// ─── Cards: Virgo things shared in a chat ───────────────────────────────────

/**
 * What a chat can carry from the rest of Virgo. Each card stores what the
 * thing is, and the server fills in how it is now every time the thread is
 * read: a moved date or a new payment shows on a card sent last week. A field
 * filled in as null means the thing is gone, or no longer its sender's to
 * show, and the card says so.
 */
export const CARD_KINDS = ['album-photos', 'booking', 'job-post', 'post', 'package', 'date-plan'] as const;
export type CardKind = (typeof CARD_KINDS)[number];

export function isCardKind(kind: string | null | undefined): kind is CardKind {
  return !!kind && (CARD_KINDS as readonly string[]).includes(kind);
}

/** The calendar's kinds of entry a date can be. A shoot is 'event' there. */
export const PLAN_TYPES = ['event', 'meeting', 'editing', 'review', 'delivery'] as const;
export type PlanType = (typeof PLAN_TYPES)[number];
export const PLAN_TYPE_LABEL: Record<PlanType, string> = {
  event: 'Shoot',
  meeting: 'Meeting',
  editing: 'Editing',
  review: 'Review',
  delivery: 'Delivery',
};

/** Photos in one card. The API enforces it too. */
export const MAX_CARD_FILES = 500;

export interface AlbumCardContext {
  albumId: string;
  linkId: string;
  /** The client link made for just these files. Opening the card opens it. */
  url: string;
  album: {
    name: string;
    /** The one section everything is in, when there is one. */
    sectionName: string | null;
    total: number;
    counts: { image: number; video: number; audio: number };
    /** Up to four small thumbnails. */
    thumbs: string[];
    /** Each thumbnail's tiny blurred stand-in, in the same order. */
    blurs: (string | null)[];
  } | null;
}

export interface BookingCardContext {
  bookingId: string;
  booking: {
    id: string;
    postTitle: string;
    postSlug: string;
    role: string | null;
    eventDate: string | null;
    location: string | null;
    rateMinor: number | null;
    currency: string;
    /** Both sides have agreed. */
    confirmed: boolean;
    cancelled: boolean;
    /** The two on it, who alone can open it. */
    parties: string[];
  } | null;
}

export interface JobPostCardContext {
  postId: string;
  job: {
    slug: string;
    title: string;
    eventDate: string | null;
    location: string | null;
    roles: string[];
    /** Centavos. */
    budgetMin: number | null;
    budgetMax: number | null;
    status: string;
    postedBy: string | null;
  } | null;
}

export interface PostCardContext {
  showcaseId: string;
  post: {
    id: string;
    title: string | null;
    likeCount: number;
    makerId: string;
    makerName: string;
    thumbUrl: string;
    blur: string | null;
    /** The first piece is a film. */
    film: boolean;
    pieces: number;
  } | null;
}

export interface PackageCardContext {
  packageId: string;
  package: {
    id: string;
    title: string;
    totalMinor: number;
    receivedMinor: number;
    balanceMinor: number;
    paidInFull: boolean;
    /** The statement page. Null once its sender stops sharing it. */
    statementUrl: string | null;
  } | null;
}

export type PlanAnswer = 'pending' | 'accepted' | 'declined';

export interface DatePlanCardContext {
  eventId: string;
  plan: {
    eventId: string;
    title: string;
    /** YYYY-MM-DD. */
    date: string;
    /** HH:MM, or null for a whole day. */
    time: string | null;
    type: string;
    typeOther: string | null;
    location: string | null;
    organiserId: string;
    /** Everyone invited, and what they said. The organiser is not in it. */
    answers: { userId: string; status: PlanAnswer }[];
  } | null;
}

export type SendCardInput = { clientId?: string } & (
  | { kind: 'album-photos'; albumId: string; keys: string[] }
  | { kind: 'booking'; bookingId: string }
  | { kind: 'job-post'; postId: string }
  | { kind: 'post'; showcaseId: string }
  | { kind: 'package'; packageId: string }
  | {
      kind: 'date-plan';
      type: PlanType;
      /** Empty is fine: the date is then called by its type. */
      title: string;
      /** YYYY-MM-DD. */
      date: string;
      /** HH:MM. */
      time?: string;
      place?: string;
      /** Everyone else in the chat you are connected with. */
      inviteEveryone: boolean;
    }
);

function utcDay(date: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '');
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
}

/** "Sat, Dec 6" from "2026-12-06": the day as written, wherever the phone is. */
export function planDayLabel(date: string | null | undefined): string | null {
  const day = utcDay(date);
  return day
    ? day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
    : null;
}

/** "4:00 PM" from "16:00". */
export function planTimeLabel(time: string | null | undefined): string | null {
  const m = /^(\d{2}):(\d{2})/.exec(time ?? '');
  if (!m) return null;
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** The date's badge: "DEC" over "6". */
export function planBadge(date: string | null | undefined): { month: string; day: string } | null {
  const day = utcDay(date);
  if (!day) return null;
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return { month: months[day.getUTCMonth()], day: String(day.getUTCDate()) };
}

/** "Sat · 4:00 PM · Sirao Garden, Cebu". */
export function planWhenLine(plan: NonNullable<DatePlanCardContext['plan']>): string {
  const day = utcDay(plan.date);
  const weekday = day ? day.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }) : null;
  return [weekday, planTimeLabel(plan.time) ?? 'All day', plan.location].filter(Boolean).join(' · ');
}

/** Who is going, who can't, and who hasn't said, as account ids. */
export function planTally(plan: NonNullable<DatePlanCardContext['plan']>): {
  going: string[];
  cant: string[];
  waiting: string[];
} {
  const of = (status: PlanAnswer) => plan.answers.filter((a) => a.status === status).map((a) => a.userId);
  return { going: of('accepted'), cant: of('declined'), waiting: of('pending') };
}

/** Your answer, or null when you were not invited (the organiser, or not connected to them). */
export function myPlanAnswer(
  plan: DatePlanCardContext['plan'] | undefined,
  myId: string | null | undefined,
): PlanAnswer | null {
  if (!plan || !myId) return null;
  return plan.answers.find((a) => a.userId === myId)?.status ?? null;
}

/** "₱8,000 – ₱12,000", one amount, or null when the post names no budget. */
export function budgetRangeLabel(min: number | null | undefined, max: number | null | undefined): string | null {
  if (min && max && min !== max) return `${formatMoney(min)} – ${formatMoney(max)}`;
  const one = min || max;
  return one ? formatMoney(one) : null;
}

/** "12 photos", "12 photos and 2 films". */
export function albumCardCount(album: NonNullable<AlbumCardContext['album']>): string {
  return album.total > 0 ? describeAlbumCount(album.counts) : 'Nothing left in it';
}

/**
 * A line for any shared card where only a line fits: the held copy, a
 * reply's quote. The kind's name, and what it is.
 */
export function cardSummary(
  message: Pick<ConversationMessage, 'kind' | 'context' | 'body'>,
): { label: string; title: string } | null {
  const fallback = message.body.split('\n')[0] ?? '';
  switch (message.kind) {
    case 'album-photos': {
      const album = (message.context as AlbumCardContext | null)?.album;
      return { label: 'Album photos', title: album ? `${albumCardCount(album)} · ${album.name}` : fallback };
    }
    case 'booking': {
      const b = (message.context as BookingCardContext | null)?.booking;
      return { label: 'Booking', title: b ? [b.role, b.postTitle].filter(Boolean).join(' · ') : fallback };
    }
    case 'job-post':
      return { label: 'Job post', title: (message.context as JobPostCardContext | null)?.job?.title ?? fallback };
    case 'post':
      return {
        label: 'Post',
        title: (message.context as PostCardContext | null)?.post?.title?.trim() || fallback,
      };
    case 'package':
      return { label: 'Package', title: (message.context as PackageCardContext | null)?.package?.title ?? fallback };
    case 'date-plan': {
      const p = (message.context as DatePlanCardContext | null)?.plan;
      return { label: 'Date', title: p ? [p.title, planDayLabel(p.date)].filter(Boolean).join(' · ') : fallback };
    }
    default:
      return null;
  }
}

export interface SendMessageInput {
  body: string;
  replyToId?: string;
  mentionIds?: string[];
  /**
   * A v4 uuid the app makes once per message and keeps across retries. The
   * server stores a message once per id, so a retry after a lost response
   * cannot send it twice.
   */
  clientId?: string;
}

/** A page of the conversation list. Leaving both out is the newest 100. */
export interface ConversationPage {
  limit?: number;
  offset?: number;
  /** The archived chats instead of the list. */
  archived?: boolean;
}

export interface ConversationList {
  data: Conversation[];
  total: number;
  /**
   * How many chats wait in Archived. Only on the list's first page, and
   * absent from an older API.
   */
  archivedCount?: number;
}

export interface Participant {
  id: string;
  name: string;
  avatar_url: string | null;
  /** Whether they had a socket open when this was fetched. */
  online?: boolean;
  /** What to show once `online` is false. */
  last_seen_at: string | null;
  /**
   * How far this person has read. Your own message counts as read once
   * someone else's `last_read_at` is at or past the moment you sent it.
   */
  last_read_at: string | null;
  /** How far messages have reached this person's device. */
  last_delivered_at: string | null;
  /*
   * The three below are optional, like `online`, so a response from an API
   * that predates blocking still type-checks. Absent reads as "not blocked".
   */
  /** Their public profile address, only when they have published one. */
  handle?: string | null;
  /** Whether you have blocked this person. */
  blocked_by_me?: boolean;
  /** Your block on them, which is what unblocking takes. Null when there is none. */
  block_id?: string | null;
}

export interface Thread {
  data: ConversationMessage[];
  total: number;
  /** Where you had read up to before this request, for the unread divider. */
  lastReadAt: string | null;
  /**
   * False once a block has frozen the conversation: either way round in a
   * direct chat, or with everyone else in a group.
   * Optional so an older API's response still type-checks; read a missing
   * value as true, because the older API never refuses a send for this.
   */
  canSend?: boolean;
  /** Whether it is frozen because you blocked them, which you can undo. */
  blockedByMe?: boolean;
  blockId?: string | null;
}

/**
 * Chat, direct and group.
 *
 * Mounted at `/messages` rather than `/chat`: the services controller already
 * owns `POST /chat` for the AI proxy.
 */
export const chatApi = {
  /**
   * `q` matches a group name, a participant's name, or a message body.
   *
   * Paging parameters are only sent when asked for, so the first page reads
   * the same on an API that predates them.
   */
  conversations(q?: string, page: ConversationPage = {}): Promise<ConversationList> {
    const query = {
      ...(q ? { q } : {}),
      ...(page.limit !== undefined ? { limit: page.limit } : {}),
      ...(page.offset ? { offset: page.offset } : {}),
      ...(page.archived ? { archived: 'true' } : {}),
    };
    return api.get('/messages/conversations', {
      query: Object.keys(query).length > 0 ? query : undefined,
    });
  },

  /** One conversation, as its row in the list. */
  conversation(id: string): Promise<Conversation> {
    return api.get(`/messages/${id}`);
  },

  unread(): Promise<{ count: number }> {
    return api.get('/messages/unread');
  },

  /** Opens or reuses the one-to-one chat with this person. */
  openDirect(userId: string): Promise<{ id: string }> {
    return api.post('/messages/direct', { body: { userId } });
  },

  createGroup(title: string, memberIds: string[]): Promise<{ id: string }> {
    return api.post('/messages/groups', { body: { title, memberIds } });
  },

  /**
   * The newest `limit`; with `before` (a message id) the ones older than it;
   * with `after` (a message id) only the ones newer than it — catching up
   * without downloading the page again. Newest first in every case. An
   * `after` answer that fills `limit` may have a gap behind it: fetch the
   * newest page instead.
   */
  messages(
    id: string,
    limit = 100,
    before?: string,
    after?: string,
  ): Promise<Thread> {
    return api.get(`/messages/${id}/messages`, { query: { limit, before, after } });
  },

  participants(id: string): Promise<{ data: Participant[]; total: number }> {
    return api.get(`/messages/${id}/participants`);
  },

  send(id: string, input: SendMessageInput): Promise<ConversationMessage> {
    return api.post(`/messages/${id}/messages`, { body: input });
  },

  /** Shares a Virgo thing as a card: album photos, a booking, a job post, a post, a package or a date. */
  sendCard(id: string, input: SendCardInput): Promise<ConversationMessage> {
    return api.post(`/messages/${id}/cards`, { body: input });
  },

  /** Going, or can't go, to a date planned in the chat. Answers with the card as it now stands. */
  answerDate(id: string, messageId: string, going: boolean): Promise<ConversationMessage> {
    return api.post(`/messages/${id}/messages/${messageId}/answer`, { body: { going } });
  },

  /** Sends one of your ways to pay as a card, optionally for one of your packages. */
  sendPayCard(
    id: string,
    input: { payMethodId: string; packageId?: string; clientId?: string },
  ): Promise<ConversationMessage> {
    return api.post(`/messages/${id}/pay-card`, { body: input });
  },

  /**
   * Removes one message.
   *
   * 'me' hides it from your own view only; 'everyone' clears the text for all
   * participants and is limited to your own messages.
   */
  deleteMessage(
    id: string,
    messageId: string,
    scope: 'me' | 'everyone',
  ): Promise<{ deleted: boolean; scope: 'me' | 'everyone' }> {
    return api.delete(`/messages/${id}/messages/${messageId}`, { query: { scope } });
  },

  /** Changes the words of your own message, within EDIT_WINDOW_MINUTES of sending. */
  edit(
    id: string,
    messageId: string,
    body: string,
    mentionIds?: string[],
  ): Promise<ConversationMessage> {
    return api.patch(`/messages/${id}/messages/${messageId}`, {
      body: { body, ...(mentionIds ? { mentionIds } : {}) },
    });
  },

  /** Your reaction: set, changed, or `null` to take it back. */
  react(
    id: string,
    messageId: string,
    reaction: ReactionKey | null,
  ): Promise<{ reactions: MessageReaction[] }> {
    return api.post(`/messages/${id}/messages/${messageId}/reaction`, { body: { reaction } });
  },

  /** Sends a message on to up to five other chats, marked Forwarded. */
  forward(
    id: string,
    messageId: string,
    conversationIds: string[],
  ): Promise<{ sent: number; skipped: number }> {
    return api.post(`/messages/${id}/messages/${messageId}/forward`, {
      body: { conversationIds },
    });
  },

  /** Pins, archives or marks unread, in your own list only. */
  setListState(
    id: string,
    patch: ListStatePatch,
  ): Promise<{ pinned: boolean; archived: boolean; markedUnread: boolean }> {
    return api.post(`/messages/${id}/list-state`, { body: patch });
  },

  markRead(id: string): Promise<{ read: boolean }> {
    return api.post(`/messages/${id}/read`);
  },

  addMember(id: string, userId: string): Promise<{ added: boolean }> {
    return api.post(`/messages/${id}/members`, { body: { userId } });
  },

  leave(id: string): Promise<{ left: boolean }> {
    return api.delete(`/messages/${id}/members/me`);
  },

  /** Silences push for this conversation. `minutes: 0` unmutes. */
  mute(id: string, minutes: number): Promise<{ muted: boolean; mutedUntil: string | null }> {
    return api.post(`/messages/${id}/mute`, { body: { minutes } });
  },

  /** Groups only — a direct chat is titled from the other person. */
  rename(id: string, title: string): Promise<{ id: string; title: string }> {
    return api.patch(`/messages/${id}`, { body: { title } });
  },

  /**
   * Removes the conversation from your view. A group is left as well; a direct
   * chat stays open so the other person can still reach you.
   */
  remove(id: string): Promise<{ deleted: boolean; left: boolean }> {
    return api.delete(`/messages/${id}`);
  },
};

/** Saved replies, for the composer. Yours only. */
export const savedRepliesApi = {
  list(): Promise<{ data: SavedReply[]; total: number }> {
    return api.get('/saved-replies');
  },

  create(title: string, body: string): Promise<SavedReply> {
    return api.post('/saved-replies', { body: { title, body } });
  },

  update(id: string, patch: { title?: string; body?: string }): Promise<SavedReply> {
    return api.patch(`/saved-replies/${id}`, { body: patch });
  },

  remove(id: string): Promise<{ deleted: boolean }> {
    return api.delete(`/saved-replies/${id}`);
  },
};

/**
 * Previews for Virgo links. A link that is not one of Virgo's pages, or no
 * longer works, answers 404 and is shown as the plain link.
 */
export const linkPreviewsApi = {
  get(url: string): Promise<LinkPreview> {
    return api.get('/link-previews', { query: { url } });
  },
};
