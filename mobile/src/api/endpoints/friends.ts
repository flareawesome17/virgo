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

/**
 * Only the denormalised display fields.
 *
 * `status` is not editable: answering a request is friendsApi.accept() or
 * .decline(), which updates both sides of the friendship. Sending it here
 * used to let the requester approve their own request.
 */
export type UpdateFriendInput = Partial<
  Omit<CreateFriendInput, 'id' | 'requested_by' | 'status'>
>;

export interface PersonResult {
  id: string;
  name: string;
  /**
   * Only when the search was this account's exact address — the one thing the
   * searcher already knew. Returning it for a name match is how a two-letter
   * query used to read out everyone's email.
   */
  email: string | null;
  avatarUrl: string | null;
  /**
   * Their public profile address, when they have published one. Optional so a
   * response from an older API still type-checks.
   */
  handle?: string | null;
  /** The caller's relationship to this account. */
  relationship: 'none' | 'pending_out' | 'pending_in' | 'accepted';
}

/** Who a request is for: exactly one of these, which the server resolves. */
export type FriendRequestTarget =
  | { handle: string }
  | { userId: string }
  | { email: string };

export interface SendRequestResult {
  status: string;
  friend: Friend;
}

export const friendsApi = {

  /**
   * Who among your accepted friends is connected right now.
   *
   * The socket only pushes changes, so this is the starting picture the
   * presence store is seeded from.
   */
  presence(): Promise<{
    data: { userId: string; online: boolean; lastSeenAt: string | null }[];
    total: number;
  }> {
    return api.get('/friends/presence');
  },
  /** People matching a name prefix or an exact email address. */
  searchPeople(q: string): Promise<{ data: PersonResult[]; total: number }> {
    return api.get('/friends/search/people', { query: { q } });
  },

  /**
   * Sends a request to an account picked from search.
   *
   * Replaces creating a friend row directly: that only described someone and
   * never reached them. The server writes both sides and pushes the recipient.
   */
  sendRequestToUser(userId: string): Promise<SendRequestResult> {
    return api.post<SendRequestResult>('/friends/request', { body: { userId } });
  },

  /** Adding by exact address, for someone hard to find by name. */
  sendRequest(email: string): Promise<SendRequestResult> {
    return api.post<SendRequestResult>('/friends/request', { body: { email } });
  },

  /**
   * Any of the three ways of naming someone, posted as it is.
   *
   * The two methods above are kept so nothing that names them breaks; the
   * body is the same either way. `{ handle }` is only understood by an API
   * from P2 on — an older one refuses the unknown key with a 400 — so nothing
   * sends it until the Connect button, which ships after that API is settled.
   */
  request(target: FriendRequestTarget): Promise<SendRequestResult> {
    return api.post<SendRequestResult>('/friends/request', { body: target });
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
