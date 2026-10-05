import { api } from '../client';

/**
 * Showcases, the feed, and the shelves people keep other people's work on.
 *
 * A showcase is a post: up to ten photographs, the first of them the cover, and
 * a note on how it was made. Distinct from the portfolio, which is one image or
 * one album per row and points only at your own files — that still exists and
 * still serves every profile.
 */

/** Matches MAX_SHOWCASE_ITEMS on the server. */
export const MAX_SHOWCASE_ITEMS = 10;
/** Matches MAX_CRAFT_TAGS. */
export const MAX_CRAFT_TAGS = 6;

export interface ShowcasePiece {
  fileKey: string;
  /** A photograph, or a film. */
  kind: 'image' | 'video';
  /** The still: a photograph's web copy, or a film's poster frame. */
  url: string;
  /**
   * Where a film plays from — an HLS ladder when one has been built, the 720p
   * proxy until then. Absent or null on a photograph, and null on a film that
   * has neither, which is a film with nothing to play.
   */
  playbackUrl?: string | null;
  durationMs?: number | null;
  /** Empty on a film: a still has no rendition ladder. */
  displaySources: { width: number; url: string }[];
  /** Only sent to the owner; false when this piece has no web copy. */
  publiclyShown?: boolean;
  /**
   * The piece's size, upright. Absent from an older API and on a file whose
   * size was never read; draw those at a default shape.
   */
  width?: number | null;
  height?: number | null;
}

/** Width over height, or null when the size is not known. */
export function pieceAspect(piece: Pick<ShowcasePiece, 'width' | 'height'>): number | null {
  return piece.width && piece.height ? piece.width / piece.height : null;
}

/**
 * The still to draw at a given size, in device pixels.
 *
 * The smallest display copy at least that wide, or the widest there is. The
 * feed drew the 640 px thumbnail full width — two or three times upscaled on
 * a modern phone, which photographers notice first. `url` (the thumbnail, or
 * a film's poster) is the fallback, and the placeholder while this loads.
 */
export function pieceSource(piece: ShowcasePiece, pixelWidth: number): string {
  const sources = piece.displaySources ?? [];
  const fit = sources.find((s) => s.width >= pixelWidth) ?? sources[sources.length - 1];
  return fit?.url ?? piece.url;
}

export interface Showcase {
  id: string;
  userId: string;
  title: string | null;
  caption: string | null;
  craftNote: string | null;
  craftTags: string[];
  category: string | null;
  location: string | null;
  visibility: 'public' | 'connections';
  allowDownloads: boolean;
  allowComments: boolean;
  showHire: boolean;
  publishedAt: string | null;
  /**
   * Set while the author has it taken down. publishedAt survives a take-down,
   * so this is what tells a live post from one that is down.
   */
  unpublishedAt: string | null;
  /** Set when Virgo has taken it down. Only its author ever sees this. */
  hiddenAt: string | null;
  keptCount: number;
  likeCount: number;
  commentCount: number;
  pieces: ShowcasePiece[];
  createdAt: string;
}

/**
 * Where a showcase stands, as its author needs to know it.
 *
 * Visitors only ever receive live ones; the owner's own list carries the rest,
 * and each needs saying differently — a draft was never out, a take-down can
 * be undone by its author, and a moderation take-down cannot.
 */
export type ShowcaseStatus = 'live' | 'draft' | 'down' | 'removed';

export function showcaseStatus(
  s: Pick<Showcase, 'publishedAt' | 'unpublishedAt' | 'hiddenAt'>,
): ShowcaseStatus {
  if (s.hiddenAt) return 'removed';
  if (!s.publishedAt) return 'draft';
  // Absent, not null, on a payload cached before the field existed: read as
  // live, which is what every showcase a visitor can see is.
  if (s.unpublishedAt) return 'down';
  return 'live';
}

export interface FeedMaker {
  id: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  title: string | null;
}

export interface FeedItem extends Showcase {
  maker: FeedMaker;
  keptByMe: boolean;
  likedByMe: boolean;
}

/**
 * One showcase, opened on its own.
 *
 * The same shape a feed card has. The list form carries no maker — a list of
 * your own work needs no byline — but a showcase somebody opened cannot offer
 * to keep it without being able to credit whoever made it.
 */
export type ShowcaseDetail = FeedItem;

/**
 * Somebody to name when the payload has no maker on it.
 *
 * The query cache is persisted, so a showcase saved before the byline existed
 * comes back off disk without one and is rendered before the refetch that
 * would replace it lands. `CACHE_VERSION` is what stops that happening, and
 * this is what stops it being fatal when it does: a byline reading "Someone"
 * for a moment is a blemish, and the alternative was the screen throwing.
 */
export const UNKNOWN_MAKER: FeedMaker = {
  id: '',
  displayName: 'Someone',
  handle: null,
  avatarUrl: null,
  title: null,
};

/**
 * The maker of a showcase, or somebody to name in their place.
 *
 * Generic over the maker, because a shelf entry carries a narrower one than a
 * feed item does and both want the same guard. What comes back always has an
 * id, a name and a handle, which is every field a caller reads without first
 * knowing which of the two it has.
 */
export function makerOf<M extends { id: string; displayName: string; handle: string | null }>(
  item: { maker?: M | null } | null | undefined,
): M | FeedMaker {
  return item?.maker ?? UNKNOWN_MAKER;
}

export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
}

/** One page of a profile's work. `nextCursor` is absent from an older API. */
export interface ProfileWorkPage {
  data: Showcase[];
  total: number;
  nextCursor?: string | null;
}

export interface ShelfSummary {
  id: string;
  name: string;
  isPublic: boolean;
  count: number;
  coverUrl: string | null;
  /** Only when asked about a showcase (mine(holding)): whether this shelf holds it. */
  holds?: boolean;
}

export interface ShelfEntry {
  showcaseId: string;
  note: string | null;
  keptAt: string;
  maker: { id: string; displayName: string; handle: string | null };
  title: string | null;
  craftTags: string[];
  url: string;
}

export interface NewShowcase {
  fileKeys: string[];
  title?: string;
  caption?: string;
  craftNote?: string;
  craftTags?: string[];
  category?: string;
  location?: string;
  visibility?: 'public' | 'connections';
  allowDownloads?: boolean;
  allowComments?: boolean;
  showHire?: boolean;
  publish?: boolean;
}

export const feedApi = {
  /**
   * One page. `cursor` is the previous page's `nextCursor`, opaque on purpose —
   * it is a keyset, so a feed posted to mid-scroll does not repeat or skip.
   */
  page(opts: { scope?: 'everyone' | 'connections'; cursor?: string } = {}): Promise<FeedPage> {
    const params = new URLSearchParams();
    if (opts.scope) params.set('scope', opts.scope);
    if (opts.cursor) params.set('cursor', opts.cursor);
    const qs = params.toString();
    return api.get(`/feed${qs ? `?${qs}` : ''}`);
  },
};

/** See showcasesApi.create. */
const POSTING_TIMEOUT_MS = 90_000;

export const showcasesApi = {
  mine(): Promise<{ data: Showcase[]; total: number }> {
    return api.get('/me/showcases');
  },

  one(id: string): Promise<ShowcaseDetail> {
    return api.get(`/showcases/${id}`);
  },

  /**
   * Posting can encode a web copy of every piece before it answers, which on
   * a slow connection outran the usual timeout — and the retry posted it a
   * second time. Given a minute and a half.
   */
  create(body: NewShowcase): Promise<Showcase> {
    return api.post('/me/showcases', { body, timeoutMs: POSTING_TIMEOUT_MS });
  },

  update(id: string, body: Partial<NewShowcase>): Promise<Showcase> {
    return api.patch(`/me/showcases/${id}`, { body, timeoutMs: POSTING_TIMEOUT_MS });
  },

  publish(id: string): Promise<Showcase> {
    return api.post(`/me/showcases/${id}/publish`);
  },

  /** Takes it down without losing when it first went out. */
  unpublish(id: string): Promise<Showcase> {
    return api.delete(`/me/showcases/${id}/publish`);
  },

  remove(id: string): Promise<void> {
    return api.delete(`/me/showcases/${id}`);
  },
};

export const shelvesApi = {
  /** With `holding`, each shelf also says whether it holds that showcase. */
  mine(holding?: string): Promise<{ data: ShelfSummary[]; total: number }> {
    return api.get('/me/shelves', holding ? { query: { holding } } : undefined);
  },

  create(name: string, isPublic?: boolean): Promise<{ data: ShelfSummary[] }> {
    return api.post('/me/shelves', { body: { name, isPublic } });
  },

  update(id: string, body: { name?: string; isPublic?: boolean }): Promise<{ data: ShelfSummary[] }> {
    return api.patch(`/me/shelves/${id}`, { body });
  },

  remove(id: string): Promise<{ data: ShelfSummary[] }> {
    return api.delete(`/me/shelves/${id}`);
  },

  entries(id: string): Promise<{ data: ShelfEntry[]; total: number }> {
    return api.get(`/me/shelves/${id}/items`);
  },

  /** Somebody else's shelf, by id. Public ones only. */
  publicEntries(id: string): Promise<{ data: ShelfEntry[]; total: number }> {
    return api.get(`/shelves/${id}/items`);
  },

  keep(shelfId: string, showcaseId: string, note?: string): Promise<{ data: ShelfEntry[] }> {
    return api.post(`/me/shelves/${shelfId}/items`, { body: { showcaseId, note } });
  },

  unkeep(shelfId: string, showcaseId: string): Promise<{ data: ShelfEntry[] }> {
    return api.delete(`/me/shelves/${shelfId}/items/${showcaseId}`);
  },
};

/** Somebody's profile, in its two halves. */
export const profileWorkApi = {
  /**
   * What they have posted, newest first, as this viewer may see it, a page at
   * a time. A visitor saw the newest 24 and nothing older.
   */
  showcases(handle: string, cursor?: string): Promise<ProfileWorkPage> {
    return api.get(
      `/profiles/${encodeURIComponent(handle)}/showcases`,
      cursor ? { query: { cursor } } : undefined,
    );
  },

  /** Their public shelves. Private ones are never returned to a visitor. */
  shelves(handle: string): Promise<{ data: ShelfSummary[]; total: number }> {
    return api.get(`/profiles/${encodeURIComponent(handle)}/shelves`);
  },
};

/** Liking. Light, one tap, and distinct from keeping. */
export const likesApi = {
  like(showcaseId: string): Promise<{ likeCount: number; liked: boolean }> {
    return api.post(`/showcases/${showcaseId}/like`);
  },

  unlike(showcaseId: string): Promise<{ likeCount: number; liked: boolean }> {
    return api.delete(`/showcases/${showcaseId}/like`);
  },
};

/** Why somebody is reporting a post. Matches the server's list. */
export const SHOWCASE_REPORT_REASONS = [
  { value: 'inappropriate', label: 'Inappropriate or explicit' },
  { value: 'stolen_work', label: 'This is not their work' },
  { value: 'wrong_credit', label: 'Credited to the wrong person' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'spam', label: 'Spam' },
  { value: 'scam', label: 'Scam or fraud' },
  { value: 'other', label: 'Something else' },
] as const;

export type ShowcaseReportReason = (typeof SHOWCASE_REPORT_REASONS)[number]['value'];

export const showcaseReportsApi = {
  report(
    showcaseId: string,
    reason: ShowcaseReportReason,
    note?: string,
  ): Promise<{ reported: true }> {
    return api.post(`/showcases/${showcaseId}/report`, { body: { reason, note } });
  },
};

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; displayName: string; handle: string | null; avatarUrl: string | null };
  /** Your own, or anything on a showcase of yours. */
  canRemove: boolean;
}

/**
 * A page of a thread, read oldest first.
 *
 * The first page is the newest; `earlier` is where the one before it starts,
 * or null at the beginning. An older API sends only `data` (the oldest 30),
 * which reads here as a thread with nothing earlier.
 */
export interface CommentPage {
  data: Comment[];
  /** False when the author has turned commenting off. Absent after an add. */
  allowed?: boolean;
  earlier?: string | null;
}

export const commentsApi = {
  /**
   * The thread: the newest page, or with `before` (a page's `earlier`) the
   * page before that.
   *
   * `allowed` is false when the author has turned commenting off — the thread
   * is hidden rather than deleted, and they still see it themselves.
   */
  list(showcaseId: string, before?: string): Promise<CommentPage> {
    return api.get(
      `/showcases/${showcaseId}/comments`,
      before ? { query: { before } } : undefined,
    );
  },

  /** Answers with the newest page, the new comment last in it. */
  add(showcaseId: string, body: string): Promise<CommentPage> {
    return api.post(`/showcases/${showcaseId}/comments`, { body: { body } });
  },

  remove(showcaseId: string, commentId: string): Promise<CommentPage> {
    return api.delete(`/showcases/${showcaseId}/comments/${commentId}`);
  },
};
