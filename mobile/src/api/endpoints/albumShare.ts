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

/** A client link to part of an album: one section, or a chosen set of files. */
export interface PartShareLink {
  id: string;
  scope: 'section' | 'files';
  url: string;
  createdAt: string;
  sectionId: string | null;
  sectionName: string | null;
  /** What it shows now: files deleted or moved out of the album drop out. */
  fileCount: number;
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

  /** Live links to a section or a selection of the album, newest first. */
  parts(albumId: string): Promise<PartShareLink[]> {
    return api.get<PartShareLink[]>(`/albums/${albumId}/share/parts`);
  },

  /**
   * A link to one section, or to a chosen set of files (one file is a set of
   * one). Asking again for the same section or the same set hands back the
   * link already issued; a different set is a new link.
   */
  createPart(
    albumId: string,
    part: { sectionId: string } | { keys: string[] },
  ): Promise<PartShareLink> {
    return api.post<PartShareLink>(`/albums/${albumId}/share/parts`, { body: part });
  },

  revokePart(albumId: string, linkId: string): Promise<{ revoked: boolean }> {
    return api.delete<{ revoked: boolean }>(`/albums/${albumId}/share/parts/${linkId}`);
  },
};
