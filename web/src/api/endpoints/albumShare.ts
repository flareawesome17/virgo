import { api } from '../client';

/** Media a link exposes. Matches the leading part of the content type. */
export type ShareMediaKind = 'image' | 'video' | 'audio';

export const ALL_SHARE_KINDS: ShareMediaKind[] = ['image', 'video', 'audio'];

export interface ShareLink {
  token: string;
  /** The URL to hand to a client. Opens a read-only gallery, no account needed. */
  url: string;
  createdAt: string;
  /** What the link shows. A subset means the rest is not served at all. */
  kinds: ShareMediaKind[];
  /**
   * When the client last pressed "Send picks", or null if they have not.
   * Picks are saved as they are made; this is the client saying they are done.
   */
  picksSentAt: string | null;
}

/**
 * Public client links for an album.
 *
 * Creating is idempotent — asking twice returns the link already issued rather
 * than invalidating a URL a client may already have.
 */
export const albumShareApi = {
  get(albumId: string): Promise<ShareLink | null> {
    return api.get<ShareLink | null>(`/albums/${albumId}/share`);
  },

  /**
   * Issues the album's link, scoped to the given media kinds.
   *
   * If an active link already exists its scope is updated in place and the
   * same URL comes back — a link already sent to a client keeps working and
   * simply shows more or less.
   */
  create(
    albumId: string,
    kinds: ShareMediaKind[] = ALL_SHARE_KINDS,
  ): Promise<ShareLink> {
    return api.post<ShareLink>(`/albums/${albumId}/share`, { body: { kinds } });
  },

  revoke(albumId: string): Promise<{ revoked: boolean }> {
    return api.delete<{ revoked: boolean }>(`/albums/${albumId}/share`);
  },
};
