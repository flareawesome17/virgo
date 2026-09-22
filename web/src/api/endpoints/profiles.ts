import { api } from '../client';

/** A single photograph on a profile. */
export interface PortfolioImage {
  id: string;
  kind: 'image';
  /**
   * A 640 px WebP copy, never the original: the camera file carries its EXIF,
   * GPS included, and a public profile is the last place it belongs.
   *
   * The one exception is the owner's own editor (`GET /me/portfolio`), which
   * falls back to the original for a photo that has no copy yet — so it can
   * still be recognised and removed. `publiclyShown` says which those are.
   */
  url: string;
  caption: string | null;
  /**
   * Larger copies on the media host, 1024 and 2048 wide, when they exist.
   * Possibly empty, and optional because an older API never sent them.
   *
   * Never for next/image: the media host is not in its allow-list, and the
   * optimiser would only re-encode a file that is already the right size.
   */
  displaySources?: { width: number; url: string }[];
  /**
   * The object key behind `url`. Present on `GET /me/portfolio` only — the
   * editor needs it to know which uploads are already on the profile. The
   * public payload omits it.
   */
  fileKey?: string;
  /**
   * Owner's list only. False for a photo the public page leaves out because
   * no web copy could be made of it, so the editor can say so.
   */
  publiclyShown?: boolean;
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

/** Where the viewer stands with the person whose profile it is. */
export type ViewerConnection = 'none' | 'pending_out' | 'pending_in' | 'accepted';

export interface ProfileStats {
  /** Accepted connections, counted once per pair. */
  connections: number;
  /** Confirmed bookings, not cancelled, whose day has passed in Manila. */
  jobsDone: number;
}

/**
 * The viewer's side of a profile. Only ever about the person looking: it
 * carries their own friends row, never the owner's account id.
 */
export interface ProfileViewer {
  isSelf: boolean;
  connection: ViewerConnection;
  /**
   * The VIEWER's own friends row with this person — what accept takes, and
   * what GET /friends/:id reads the other account from to open a chat. Null
   * when `connection` is 'none'.
   */
  friendId: string | null;
}

/**
 * What another user sees on somebody's profile.
 *
 * Mirrors PublicProfile on the server, which is an explicit allow-list rather
 * than a user row — so this type is the whole contract, not a subset of one.
 *
 * Everything from `coverUrl` down is optional: an older API never sent it, and
 * a profile persisted by the previous release comes back off disk without it.
 * Screens read it through withProfileDefaults rather than guessing.
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
  /** The CDN address of their cover, a WebP the server re-encoded itself. */
  coverUrl?: string | null;
  /** Only when they chose to show it, and it is not blank. */
  studioName?: string | null;
  /** A badge. Hiring is open either way. */
  availableForBookings?: boolean;
  stats?: ProfileStats;
  /** 0 on your own profile. */
  mutualConnections?: number;
  viewer?: ProfileViewer;
}

/** A PublicProfile with every optional field settled to a definite value. */
export interface ProfileView
  extends Omit<
    PublicProfile,
    'coverUrl' | 'studioName' | 'availableForBookings' | 'stats' | 'mutualConnections' | 'viewer'
  > {
  coverUrl: string | null;
  studioName: string | null;
  availableForBookings: boolean;
  /** Null when the API did not send them, which hides the line. */
  stats: ProfileStats | null;
  mutualConnections: number;
  /** Null when unknown, which hides Connect and Message and keeps Hire. */
  viewer: ProfileViewer | null;
}

/**
 * The caller's own page, published or not.
 *
 * The public presentation of the account — the same studio rule, the same
 * portfolio a visitor gets — plus what only the owner needs. No viewer, no
 * mutuals, no email: it is persisted on the phone, and nothing private should
 * sit on disk because of it.
 */
export interface ProfilePage {
  handle: string | null;
  /** On, and with a handle to be found at. */
  published: boolean;
  displayName: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  title: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  studioName: string | null;
  roles: string[];
  memberSince: number;
  availableForBookings: boolean;
  stats: ProfileStats;
  portfolio: PortfolioItem[];
  /** Photos the public page leaves out because no web copy could be made. */
  portfolioHidden: number;
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

  /**
   * The caller's own page, including while it is unpublished or has no
   * handle. A previous API answers 404, which the screen shows as a failed
   * load rather than an empty portfolio.
   */
  page(): Promise<ProfilePage> {
    return api.get<ProfilePage>('/me/profile/page');
  },

  /**
   * Makes an uploaded object the cover.
   *
   * Takes the key from a 'covers' upload that has been confirmed, never a URL:
   * the server builds the address itself from an object it re-encoded, so
   * nothing a client names ends up on a public profile.
   */
  setCover(key: string): Promise<{ coverUrl: string }> {
    return api.patch('/me/profile/cover', { body: { key } });
  },

  removeCover(): Promise<{ coverUrl: null }> {
    return api.delete('/me/profile/cover');
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

/** The public address of a profile, for sharing and for canonical tags. */
export function profileUrl(handle: string, origin = 'https://virgo.ph'): string {
  return `${origin}/@${handle}`;
}
