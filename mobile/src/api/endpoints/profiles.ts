import { api } from '../client';

/** A single photograph on a profile. */
export interface PortfolioImage {
  id: string;
  kind: 'image';
  url: string;
  caption: string | null;
  /**
   * The object key behind `url`. Present on `GET /me/portfolio` only — the
   * editor needs it to know which uploads are already on the profile. The
   * public payload omits it.
   */
  fileKey?: string;
}

/**
 * A whole gallery, shown as one card.
 *
 * `url` points at a share link created specifically for the portfolio — never
 * the one the album's client was sent.
 */
export interface PortfolioAlbum {
  id: string;
  kind: 'album';
  name: string;
  caption: string | null;
  coverUrl: string | null;
  /** The photographs in the album, which are all its gallery at `url` shows. */
  itemCount: number;
  url: string | null;
  /** Owner's list only, so the picker can hide albums already showcased. */
  albumId?: string;
}

export type PortfolioItem = PortfolioImage | PortfolioAlbum;

/**
 * What another user sees on somebody's profile.
 *
 * Mirrors PublicProfile on the server, which is an explicit allow-list rather
 * than a user row — so this type is the whole contract, not a subset of one.
 */
export interface PublicProfile {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  title: string | null;
  bio: string | null;
  /** The free-text city they typed. Never coordinates. */
  location: string | null;
  website: string | null;
  roles: string[];
  /** Year only. */
  memberSince: number;
  portfolio: PortfolioItem[];
}

export interface ProfileSettings {
  handle: string | null;
  handleChangedAt: string | null;
  published: boolean;
  canPublish: boolean;
  /** Plain sentences naming what is still missing. */
  blockers: string[];
}

/**
 * Profiles and the controls behind them.
 *
 * Every method needs a session. `publicProfile` is named for *whose* profile
 * it fetches — anybody's, subject to their opt-in — not for who may call it.
 */
export const profilesApi = {
  /**
   * A published profile by handle. 404 when missing, private, or paused.
   *
   * Authenticated: reading somebody else's profile needs an account, so the
   * call carries the session like every other read.
   */
  publicProfile(handle: string): Promise<PublicProfile> {
    return api.get<PublicProfile>(`/profiles/${encodeURIComponent(handle)}`);
  },

  /** The caller's own handle and publish state, for the editor. */
  settings(): Promise<ProfileSettings> {
    return api.get<ProfileSettings>('/me/profile');
  },

  checkHandle(handle: string): Promise<{ available: boolean; reason: string | null }> {
    return api.get('/me/profile/handle-available', { query: { handle } });
  },

  setHandle(handle: string): Promise<{ handle: string }> {
    return api.patch('/me/profile/handle', { body: { handle } });
  },

  setPublished(published: boolean): Promise<{ published: boolean; handle: string | null }> {
    return api.patch('/me/profile/publish', { body: { published } });
  },
};

/**
 * The portfolio editor.
 *
 * Every mutation answers with the whole list, so a client never has to guess
 * what the new order or the new caps left behind.
 */
export const portfolioApi = {
  list(): Promise<{ data: PortfolioItem[]; total: number }> {
    return api.get('/me/portfolio');
  },

  addImage(fileKey: string, caption?: string): Promise<{ data: PortfolioItem[] }> {
    return api.post('/me/portfolio', { body: { kind: 'image', fileKey, caption } });
  },

  addAlbum(albumId: string, caption?: string): Promise<{ data: PortfolioItem[] }> {
    return api.post('/me/portfolio', { body: { kind: 'album', albumId, caption } });
  },

  remove(id: string): Promise<{ data: PortfolioItem[] }> {
    return api.delete(`/me/portfolio/${id}`);
  },

  /** Ids in the order they should appear. */
  reorder(ids: string[]): Promise<{ data: PortfolioItem[] }> {
    return api.patch('/me/portfolio/order', { body: { ids } });
  },
};

/** The public address of a profile, for sharing and for canonical tags. */
/**
 * A title made out of the roles somebody picked.
 *
 * "Photographer", "Photographer & Videographer", "Photographer, HMUA & Host".
 *
 * The title field is free text and always was, but leaving it blank is the
 * common case — and a profile with no title reads as unfinished when the
 * person has already said exactly what they do one field below. This is what
 * the form falls back to, so the two never disagree.
 *
 * Order is preserved rather than sorted: it is the order they were chosen in,
 * which puts the thing somebody thinks of first at the front.
 */
export function titleFromRoles(roles: readonly string[] | null | undefined): string {
  const list = (roles ?? []).map((r) => r.trim()).filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')} & ${list[list.length - 1]}`;
}

export function profileUrl(handle: string, origin = 'https://virgo.ph'): string {
  return `${origin}/@${handle}`;
}
