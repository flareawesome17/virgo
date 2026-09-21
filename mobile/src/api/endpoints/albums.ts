import { api } from '../client';
import type { Album, AlbumStatus, ListParams, ListResponse } from '../types';

export interface ListAlbumsParams extends ListParams {
  workspace_id?: string;
  status?: AlbumStatus;
  /** Matches the album's name, description, or its workspace's name. */
  search?: string;
}

export interface CreateAlbumInput {
  id?: string;
  workspace_id: string;
  name: string;
  description?: string | null;
  cover_url?: string | null;
  item_count?: number;
  status?: AlbumStatus;
  retention_days?: number | null;
}

export type UpdateAlbumInput = Partial<Omit<CreateAlbumInput, 'id'>> & {
  /** A photograph already in the album, or null for the newest image. */
  cover_key?: string | null;
};

export const albumsApi = {
  list(params: ListAlbumsParams = {}): Promise<ListResponse<Album>> {
    return api.get<ListResponse<Album>>('/albums', { query: params });
  },

  get(id: string): Promise<Album> {
    return api.get<Album>(`/albums/${id}`);
  },

  create(input: CreateAlbumInput): Promise<Album> {
    return api.post<Album>('/albums', { body: input });
  },

  update(id: string, input: UpdateAlbumInput): Promise<Album> {
    return api.patch<Album>(`/albums/${id}`, { body: input });
  },

  remove(id: string): Promise<void> {
    return api.delete<void>(`/albums/${id}`);
  },
};
