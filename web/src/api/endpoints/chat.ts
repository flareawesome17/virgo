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
  /*
   * Crew chats (phase 3). Optional so an older API's response still
   * type-checks; absent reads as an ordinary chat where you are not an admin.
   */
  /** The message a search matched: what the list opens the chat at. */
  matchId?: string | null;
  /** Groups: the one line at the top of group info. */
  about?: string | null;
  /** Whether you are one of the group's admins. */
  isAdmin?: boolean;
  /** Who can add people. Absent reads as 'everyone'. */
  addPolicy?: GroupAddPolicy;
  /** A workspace's team chat, or a job's crew chat. Null on anything else. */
  origin?: GroupOrigin | null;
  /** The workspace's id, or the job post's. */
  originId?: string | null;
  /** The workspace's name, or the job's title, as they are now. */
  originTitle?: string | null;
}

/** Who can add people to a group. */
export type GroupAddPolicy = 'everyone' | 'admins';

/** What made a group: a workspace's team, or the people hired on a job. */
export type GroupOrigin = 'workspace' | 'crew';

/** Pinned messages one chat can hold, the same for everyone in it. */
export const MAX_PINNED_MESSAGES = 3;

/** How long a group's About can be. */
export const GROUP_ABOUT_MAX = 200;

/** People hired on a job before its poster can start a crew chat. */
export const MIN_CREW = 2;

/** "Team chat · 6 people", "5 people · From the Santos Wedding job": the line under a group's name. */
export function groupSubtitle(
  c: Pick<Conversation, 'isGroup' | 'participantCount' | 'origin' | 'originTitle'>,
): string | null {
  if (!c.isGroup) return null;
  const people = `${c.participantCount} ${c.participantCount === 1 ? 'person' : 'people'}`;
  if (c.origin === 'workspace') return `Team chat · ${people}`;
  if (c.origin === 'crew') {
    return c.originTitle ? `${people} · From the ${c.originTitle} job` : `Crew chat · ${people}`;
  }
  return people;
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
  kind?: 'text' | 'job-accepted' | 'pay-card' | 'notice' | 'photos' | 'file' | 'voice' | CardKind;
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
    | NoticeContext
    | FilesContext
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
  /** When somebody pinned it for the chat. Null or absent when it is not pinned. */
  pinned_at?: string | null;
  /** Who pinned it. Only on the pins list. */
  pinned_by_name?: string | null;
  /**
   * Photos, a file or a voice note from somebody's device, in order: on
   * 'photos', 'file' and 'voice' messages only. One can still be uploading (the words go first on a weak
   * signal); it turns ready through a `message-edited` frame. Empty once
   * unsent. Absent from an older API.
   */
  attachments?: ChatAttachment[];
}

/**
 * A notice: the chat saying who joined, left, was added or removed. Drawn as
 * a small centred line from `body`, never as a bubble, and nobody replies to,
 * reacts to, pins or forwards one. Never unread.
 */
export interface NoticeContext {
  event: 'team-chat' | 'crew-chat' | 'joined' | 'left' | 'added' | 'removed';
  /** What a join or a leave followed: the workspace, or being hired on the job. */
  via?: 'workspace' | 'crew';
  actorId?: string;
  subjectId?: string;
  workspaceId?: string;
  postId?: string;
}

export function isNotice(m: Pick<ConversationMessage, 'kind'>): boolean {
  return m.kind === 'notice';
}

// ─── Photos and files from your device (phase 4) ────────────────────────────

/**
 * What a photo may be sent as: what both apps make of it once shrunk. The
 * phone turns HEIC into JPEG first; the server can't read HEIC.
 */
export const CHAT_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** A file is a PDF: a call sheet, a contract, a mood board. */
export const CHAT_FILE_TYPES = ['application/pdf'] as const;
export const MAX_CHAT_PHOTOS = 10;
export const MAX_CHAT_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_CHAT_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_CHAT_CAPTION = 1000;

/**
 * The long edge photos are shrunk to before they go: about 2,000 px (around
 * 0.5 MB), or 1,280 px on a slow line (around 200 KB). Full size goes
 * through an album. The server keeps at most 2,048 px either way.
 */
export const CHAT_PHOTO_EDGE = 2000;
export const CHAT_PHOTO_EDGE_SLOW = 1280;
export function chatPhotoEdge(quality: ConnectionQuality): number {
  return quality === 'slow' ? CHAT_PHOTO_EDGE_SLOW : CHAT_PHOTO_EDGE;
}

export type ChatAttachmentKind = 'photo' | 'file' | 'voice';
export type ChatAttachmentStatus = 'uploading' | 'ready' | 'failed';

/** A photo or a file on a message. */
export interface ChatAttachment {
  id: string;
  kind: ChatAttachmentKind;
  /**
   * 'uploading' until its bytes arrive and are checked; 'failed' if they
   * never did (a day on) or could not be read. Only 'ready' has links.
   */
  status: ChatAttachmentStatus;
  /** A file's name, and what either saves as. */
  name: string;
  contentType: string;
  sizeBytes: number;
  /** A photo's size in pixels, for drawing its box before it loads. */
  width: number | null;
  height: number | null;
  /** A PDF's page count, when it could be read. */
  pages: number | null;
  /**
   * A voice note's length: what its recorder said until it arrives, then
   * what the server measured. Null on photos and files; absent from an
   * older API.
   */
  durationMs?: number | null;
  /** A voice note's shape: 48 levels from 0 to 100. Null until it arrives. */
  waveform?: number[] | null;
  /** About 300 bytes: paint it first, and instead of the photo on a slow line. */
  blur: string | null;
  /** The photo's 640 px copy, for the thread. Signed for half a day. */
  thumbUrl: string | null;
  /** The photo or PDF itself, signed for half a day. */
  url: string | null;
}

/** A photos or file message's own words, drawn under the photos or the file. */
export interface FilesContext {
  caption: string | null;
}

export function isFilesMessage(m: Pick<ConversationMessage, 'kind'>): boolean {
  return m.kind === 'photos' || m.kind === 'file' || m.kind === 'voice';
}

/** The caption the sender typed, or null. */
export function filesCaption(m: Pick<ConversationMessage, 'kind' | 'context'>): string | null {
  if (!isFilesMessage(m)) return null;
  const caption = (m.context as FilesContext | null | undefined)?.caption;
  return typeof caption === 'string' && caption.trim() ? caption : null;
}

/** "4 photos", "Photo". */
export function photoCountLabel(count: number): string {
  return count === 1 ? 'Photo' : `${count} photos`;
}

/** "1.2 MB", "340 KB", "12 KB": what a file or a set of photos costs to load. */
export function chatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** The line under a file's name: "3 pages · 1.2 MB", or "PDF · 1.2 MB". */
export function fileDetailLine(a: Pick<ChatAttachment, 'pages' | 'sizeBytes'>): string {
  const pages = a.pages ? (a.pages === 1 ? '1 page' : `${a.pages} pages`) : 'PDF';
  return `${pages} · ${chatFileSize(a.sizeBytes)}`;
}

/**
 * Whether an attachment's picture loads on its own. A photo's small copy is
 * well under AUTO_DOWNLOAD_MAX_BYTES, so it follows the setting; the full
 * photo and a PDF only ever load when tapped.
 */
export function shouldAutoLoadThumb(setting: MediaAutoLoad, quality: ConnectionQuality): boolean {
  return shouldAutoLoadMedia(setting, quality);
}

/** What an upload link is for: one photo or one file of a message. */
export interface ChatUploadTicket {
  /** The attachment's id: what the message names, and what is finished. */
  id: string;
  uploadUrl: string;
  /** Send exactly these with the PUT: the type and size are signed in. */
  requiredHeaders: Record<string, string>;
  expiresAt: string;
}

/** One photo, file or voice note about to be sent: what it is, and how big. */
export interface NewChatFile {
  contentType: string;
  contentLength: number;
  name?: string;
  /** A voice note's length as recorded, so the chat list can say it before it arrives. */
  durationMs?: number;
}

export interface SendFilesInput {
  /** The uploads, in the order they show. */
  attachmentIds: string[];
  caption?: string;
  /** As on a typed message: the same one again returns what was stored. */
  clientId?: string;
  replyToId?: string;
}

/** What your chat photos and files use, and where, for the storage screen. */
export interface ChatFilesUsage {
  bytes: number;
  files: number;
  /** Largest first, up to twenty. Includes chats you have left. */
  chats: {
    conversationId: string;
    title: string;
    isGroup: boolean;
    /** False for a chat you have left: what you sent there still counts. */
    member: boolean;
    bytes: number;
    files: number;
  }[];
}

/** Whether an upload link is about to lapse, and should be asked for again. */
export function uploadTicketExpired(ticket: Pick<ChatUploadTicket, 'expiresAt'>, now = Date.now()): boolean {
  const at = Date.parse(ticket.expiresAt);
  return !Number.isFinite(at) || at - now < 60_000;
}

// ─── Voice notes (phase 5) ──────────────────────────────────────────────────

/** Hold to record, up to two minutes. The recording screen stops and sends there. */
export const MAX_VOICE_MS = 120_000;
/**
 * Shorter than this is a slip of the thumb, not a voice note: nothing is
 * sent, and the composer says to hold.
 */
export const MIN_VOICE_MS = 1_000;
/**
 * How a voice note is recorded: one channel, 22.05 kHz, 24 kbps. About
 * 180 KB a minute, so two minutes is about 360 KB on a weak signal. The
 * server re-encodes whatever arrives to the same.
 */
export const VOICE_SAMPLE_RATE = 22_050;
export const VOICE_BIT_RATE = 24_000;

/** The speeds a voice note plays at: one tap moves to the next. */
export const VOICE_RATES = [1, 1.5, 2] as const;
export type VoiceRate = (typeof VOICE_RATES)[number];

export function nextVoiceRate(rate: VoiceRate): VoiceRate {
  return VOICE_RATES[(VOICE_RATES.indexOf(rate) + 1) % VOICE_RATES.length];
}

/** "1×", "1.5×", "2×". */
export function voiceRateLabel(rate: VoiceRate): string {
  return `${rate}×`;
}

/** "0:32", "1:05": a voice note's length, or how far in it is. */
export function voiceClock(ms: number | null | undefined): string {
  const seconds = Math.max(0, Math.floor((ms ?? 0) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** A voice note's length as the bubble says it: rounded, never "0:00". */
export function voiceLength(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return '0:00';
  return voiceClock(Math.max(1000, Math.round(ms / 1000) * 1000));
}

/** "Voice note, 32 seconds": what a screen reader says for a voice note. */
export function voiceSpokenLength(ms: number | null | undefined): string {
  const seconds = Math.max(1, Math.round((ms ?? 0) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const parts = [
    minutes ? `${minutes} minute${minutes === 1 ? '' : 's'}` : '',
    rest ? `${rest} second${rest === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  return parts.join(' ') || '1 second';
}

export function isVoiceMessage(m: Pick<ConversationMessage, 'kind'>): boolean {
  return m.kind === 'voice';
}

/** The voice note on a voice message, or null. */
export function voiceAttachment(
  m: Pick<ConversationMessage, 'kind' | 'attachments'>,
): ChatAttachment | null {
  if (!isVoiceMessage(m)) return null;
  return m.attachments?.find((a) => a.kind === 'voice') ?? null;
}

/**
 * A waveform merged down to the bars a bubble has room for, each from 0 to
 * 1. A note with no waveform yet (still arriving) is a low, even line.
 */
export function voiceBars(waveform: number[] | null | undefined, count: number): number[] {
  if (count <= 0) return [];
  if (!waveform || waveform.length === 0) return new Array<number>(count).fill(0.12);
  const per = waveform.length / count;
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * per);
    const end = Math.max(start + 1, Math.floor((i + 1) * per));
    let peak = 0;
    for (let j = start; j < end && j < waveform.length; j++) peak = Math.max(peak, waveform[j]);
    bars.push(Math.max(0.12, Math.min(1, peak / 100)));
  }
  return bars;
}

/** The type a recording is sent as, from what the recorder or browser made. */
export function voiceContentType(mimeType: string | null | undefined): string {
  const base = (mimeType ?? '').split(';')[0].trim().toLowerCase();
  if (base === 'audio/webm' || base === 'video/webm') return 'audio/webm';
  if (base === 'audio/ogg') return 'audio/ogg';
  if (base === 'audio/aac') return 'audio/aac';
  return 'audio/mp4';
}

/** One line for a pin in the strip and the Pinned sheet: its words, or what the card is. */
export function pinLine(m: ConversationMessage): string {
  if (m.kind && m.kind !== 'text' && m.kind !== 'notice') {
    const card = cardSummary(m);
    if (card) return card.title ? `${card.label}: ${card.title}` : card.label;
  }
  return (m.body ?? '').split('\n')[0] || 'Message';
}

/** What a search inside one chat found: ids and times, newest first. */
export interface ChatSearchMatch {
  id: string;
  createdAt: string;
}

/** A group's settings an admin changes. Each left out stays as it is. */
export interface GroupPatch {
  title?: string;
  about?: string | null;
  /** The public address of a photo you uploaded (scope 'avatars'), or null to take it off. */
  photoUrl?: string | null;
  addPolicy?: GroupAddPolicy;
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
    case 'photos': {
      const count = (message as Pick<ConversationMessage, 'attachments'>).attachments?.length ?? 0;
      const caption = filesCaption(message);
      return { label: count > 0 ? photoCountLabel(count) : 'Photos', title: caption ?? '' };
    }
    case 'file': {
      const file = (message as Pick<ConversationMessage, 'attachments'>).attachments?.[0];
      return { label: 'File', title: file?.name ?? fallback.replace(/^Sent a file: /, '') };
    }
    case 'voice': {
      const note = (message as Pick<ConversationMessage, 'attachments'>).attachments?.[0];
      return { label: 'Voice note', title: note?.durationMs ? voiceLength(note.durationMs) : '' };
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
  /** One of the group's admins. Absent from an older API. */
  is_admin?: boolean;
  /** When they joined this chat: "in this group since Nov 12". */
  joined_at?: string;
  /** What they do, from their profile: role keys, then roles in their own words. */
  roles?: string[];
  custom_roles?: string[];
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
  /**
   * Only on a thread asked for around one message: whether there are newer
   * messages than the newest here. False means it reaches the newest.
   */
  hasNewer?: boolean;
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

  /**
   * The messages around one: a search match or a pin, to open the chat at.
   * Twenty either side, newest first, with `hasNewer`.
   */
  messagesAround(id: string, messageId: string): Promise<Thread> {
    return api.get(`/messages/${id}/messages`, { query: { around: messageId } });
  },

  /** Every message in this chat with these words in it, newest first. */
  search(id: string, q: string): Promise<{ matches: ChatSearchMatch[] }> {
    return api.get(`/messages/${id}/search`, { query: { q } });
  },

  /** The chat's pinned messages, newest pin first. */
  pins(id: string): Promise<{ data: ConversationMessage[]; total: number }> {
    return api.get(`/messages/${id}/pins`);
  },

  /**
   * Pins a message for everyone. With three pinned already it answers 409
   * (isPinsFull) unless `replace` names the pin to take down for it.
   */
  pin(id: string, messageId: string, replace?: string): Promise<{ pins: ConversationMessage[] }> {
    return api.post(`/messages/${id}/messages/${messageId}/pin`, { body: replace ? { replace } : {} });
  },

  unpin(id: string, messageId: string): Promise<{ pins: ConversationMessage[] }> {
    return api.delete(`/messages/${id}/messages/${messageId}/pin`);
  },

  /** An admin takes somebody out of the group. */
  removeMember(id: string, userId: string): Promise<{ removed: boolean }> {
    return api.delete(`/messages/${id}/members/${userId}`);
  },

  /** An admin makes somebody an admin, or stops them being one. */
  setAdmin(id: string, userId: string, admin: boolean): Promise<{ isAdmin: boolean }> {
    return api.post(`/messages/${id}/members/${userId}/admin`, { body: { admin } });
  },

  /** An admin changes the group's name, About, photo, or who can add people. */
  updateGroup(
    id: string,
    patch: GroupPatch,
  ): Promise<{ id: string; title: string; about: string | null; photoUrl: string | null; addPolicy: GroupAddPolicy }> {
    return api.patch(`/messages/${id}`, { body: patch });
  },

  /** Starts the crew chat for one of your job posts, or opens the one it has. */
  startCrew(postId: string): Promise<{ id: string }> {
    return api.post('/messages/crews', { body: { postId } });
  },

  /**
   * Upload links for one message's photos (up to ten) or one PDF, in order.
   * Each ticket's id is the attachment: name it in sendFiles, and finish it
   * once its bytes are up. STORAGE_FULL (isStorageFull) when it won't fit.
   */
  createUploads(id: string, files: NewChatFile[]): Promise<ChatUploadTicket[]> {
    return api.post(`/messages/${id}/uploads`, { body: { files } });
  },

  /** A fresh link for an upload still on its way, after a long drop. */
  resignUpload(id: string, attachmentId: string): Promise<ChatUploadTicket> {
    return api.post(`/messages/${id}/uploads/${attachmentId}/url`);
  },

  /**
   * The bytes are up: checked and made ready, and everyone in the chat gets
   * the message again as an edit frame. 409 NOT_UPLOADED (isNotUploaded)
   * while they are not there yet.
   */
  finishUpload(id: string, attachmentId: string): Promise<ChatAttachment> {
    return api.post(`/messages/${id}/uploads/${attachmentId}/done`);
  },

  /** Sends the uploads as one message, before they finish: the words go first. */
  sendFiles(id: string, input: SendFilesInput): Promise<ConversationMessage> {
    return api.post(`/messages/${id}/files`, { body: input });
  },

  /** An hour's link that saves a photo or file under its own name. */
  attachmentLink(id: string, messageId: string, attachmentId: string): Promise<{ url: string }> {
    return api.get(`/messages/${id}/messages/${messageId}/files/${attachmentId}/link`);
  },

  /** Files a copy of a chat photo or PDF into one of your albums, counted there. */
  addToAlbum(
    id: string,
    messageId: string,
    attachmentId: string,
    albumId: string,
  ): Promise<{ added: boolean }> {
    return api.post(`/messages/${id}/messages/${messageId}/files/${attachmentId}/album`, {
      body: { albumId },
    });
  },

  /** What your chat photos and files use, and in which chats. */
  filesUsage(): Promise<ChatFilesUsage> {
    return api.get('/messages/files/usage');
  },

  /** Your own photo and file messages in one chat, newest first, 60 a page. */
  sentFiles(
    conversationId: string,
    before?: string,
  ): Promise<{ data: ConversationMessage[]; total: number }> {
    return api.get(`/messages/files/sent/${conversationId}`, before ? { query: { before } } : {});
  },

  /** Unsends your own photo and file messages, from the storage screen, even in a chat you left. */
  unsendFiles(messageIds: string[]): Promise<{ unsent: number }> {
    return api.post('/messages/files/unsend', { body: { messageIds } });
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
