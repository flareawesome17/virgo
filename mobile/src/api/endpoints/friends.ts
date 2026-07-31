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

export interface SendRequestResult {
  status: string;
  friend: Friend;
}

export const friendsApi = {
  /**
   * Sends a request to the account using this email.
   *
   * Replaces creating a friend row directly: that only described someone and
   * never reached them. The server writes both sides and pushes the recipient.
   */
  sendRequest(email: string): Promise<SendRequestResult> {
    return api.post<SendRequestResult>('/friends/request', { body: { email } });
  },

  /** Only an incoming request can be accepted; the server enforces that. */
  accept(id: string): Promise<Friend> {
    return api.post<Friend>(`/friends/${id}/accept`);
  },

  decline(id: string): Promise<Friend> {
    return api.post<Friend>(`/friends/${id}/decline`);
  },

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
