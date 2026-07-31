import { api } from '../client';
import type {
  Friend,
  FriendStatus,
  ListParams,
  ListResponse,
  RequestedBy,
} from '../types';

export interface ListFriendsParams extends ListParams {
  status?: FriendStatus;
  requested_by?: RequestedBy;
}

export interface CreateFriendInput {
  id?: string;
  friend_name: string;
  friend_email?: string | null;
  friend_avatar_url?: string | null;
  status?: FriendStatus;
  requested_by: RequestedBy;
}

export type UpdateFriendInput = Partial<
  Omit<CreateFriendInput, 'id' | 'requested_by'>
>;

export const friendsApi = {
  list(params: ListFriendsParams = {}): Promise<ListResponse<Friend>> {
    return api.get<ListResponse<Friend>>('/friends', { query: params });
  },

  get(id: string): Promise<Friend> {
    return api.get<Friend>(`/friends/${id}`);
  },

  create(input: CreateFriendInput): Promise<Friend> {
    return api.post<Friend>('/friends', { body: input });
  },

  update(id: string, input: UpdateFriendInput): Promise<Friend> {
    return api.patch<Friend>(`/friends/${id}`, { body: input });
  },

  remove(id: string): Promise<void> {
    return api.delete<void>(`/friends/${id}`);
  },
};
