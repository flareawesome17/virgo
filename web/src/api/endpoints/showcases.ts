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
  url: string;
  displaySources: { width: number; url: string }[];
  /** Only sent to the owner; false when this piece has no web copy. */
  publiclyShown?: boolean;
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
  /** Set when Virgo has taken it down. Only its author ever sees this. */
  hiddenAt: string | null;
  keptCount: number;
  likeCount: number;
  pieces: ShowcasePiece[];
  createdAt: string;
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

export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
}

export interface ShelfSummary {
  id: string;
  name: string;
  isPublic: boolean;
  count: number;
  coverUrl: string | null;
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

export const showcasesApi = {
  mine(): Promise<{ data: Showcase[]; total: number }> {
    return api.get('/me/showcases');
  },

  one(id: string): Promise<Showcase> {
    return api.get(`/showcases/${id}`);
  },

  create(body: NewShowcase): Promise<Showcase> {
    return api.post('/me/showcases', { body });
  },

  update(id: string, body: Partial<NewShowcase>): Promise<Showcase> {
    return api.patch(`/me/showcases/${id}`, { body });
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
  mine(): Promise<{ data: ShelfSummary[]; total: number }> {
    return api.get('/me/shelves');
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
  /** What they have posted, newest first, as this viewer may see it. */
  showcases(handle: string): Promise<{ data: Showcase[]; total: number }> {
    return api.get(`/profiles/${encodeURIComponent(handle)}/showcases`);
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
