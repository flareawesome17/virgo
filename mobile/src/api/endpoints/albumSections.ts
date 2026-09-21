import { api } from '../client';

/** Files by kind, the way the album screens count them. */
export interface KindCounts {
  image: number;
  video: number;
  audio: number;
}

/** A named group inside one album — "Prep", "Ceremony", "Reception". */
export interface AlbumSection {
  id: string;
  name: string;
  position: number;
  /** Files in this section, of every kind. */
  count: number;
  counts: KindCounts;
}

export interface AlbumSectionList {
  /** In the photographer's order. */
  data: AlbumSection[];
  /** Files in no section. */
  unsorted: number;
  /** Every file in the album. */
  total: number;
  /** The whole album by kind, whichever section is on screen. */
  counts: KindCounts;
  /** Files the client has picked through the delivery link. */
  picked: number;
}

/**
 * An album's sections.
 *
 * Seeing them needs view access to the album; changing them needs manage.
 * The server enforces both — a screen hiding a button is presentation.
 */
export const albumSectionsApi = {
  list(albumId: string): Promise<AlbumSectionList> {
    return api.get<AlbumSectionList>(`/albums/${albumId}/sections`);
  },

  create(albumId: string, name: string): Promise<AlbumSection> {
    return api.post<AlbumSection>(`/albums/${albumId}/sections`, { body: { name } });
  },

  rename(albumId: string, sectionId: string, name: string): Promise<{ id: string; name: string }> {
    return api.patch(`/albums/${albumId}/sections/${sectionId}`, { body: { name } });
  },

  /** The whole order, every section once. */
  reorder(albumId: string, ids: string[]): Promise<{ ids: string[] }> {
    return api.post(`/albums/${albumId}/sections/reorder`, { body: { ids } });
  },

  /** Deletes the section; its files stay in the album, unsorted. */
  remove(albumId: string, sectionId: string): Promise<void> {
    return api.delete<void>(`/albums/${albumId}/sections/${sectionId}`);
  },

  /** Files the keys under a section, or takes them out of one with null. */
  assign(albumId: string, keys: string[], sectionId: string | null): Promise<{ moved: number }> {
    return api.post(`/albums/${albumId}/sections/assign`, { body: { keys, sectionId } });
  },
};
