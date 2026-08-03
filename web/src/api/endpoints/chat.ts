import { api } from '../client';

export interface Conversation {
  id: string;
  isGroup: boolean;
  /** Group title, or the other person's name for a direct chat. */
  title: string;
  avatarUrl: string | null;
  participantCount: number;
  lastMessage: string | null;
  lastAt: string | null;
  lastSender: string | null;
  unread: number;
  /**
   * The line that matched a search, when the hit was inside the thread rather
   * than on its name. Null outside of search, and null when it would just
   * repeat `lastMessage`.
   */
  matchSnippet: string | null;
  /** Whether you have muted it, and until when. */
  muted: boolean;
  mutedUntil: string | null;
  /**
   * The other person in a direct chat. Null on a group.
   *
   * Presence arrives as a stream of socket events keyed by account id, so the
   * list needs the id to match them against — the title alone is not enough.
   */
  otherUserId: string | null;
  /** Their state when this response was made; the socket keeps it current. */
  otherOnline: boolean | null;
  otherLastSeenAt: string | null;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender_name?: string;
  /** Set when deleted for everyone; `body` is then empty. */
  deleted_at?: string | null;
  /** Account ids named in the body. */
  mentions?: string[];
  reply_to_id?: string | null;
  /** Quoted preview, null when the quoted message was itself deleted. */
  reply_to_body?: string | null;
  reply_to_sender?: string | null;
  reply_to_deleted?: boolean;
}

export interface SendMessageInput {
  body: string;
  replyToId?: string;
  mentionIds?: string[];
}

export interface Participant {
  id: string;
  name: string;
  avatar_url: string | null;
  /** Whether they had a socket open when this was fetched. */
  online?: boolean;
  /** What to show once `online` is false. */
  last_seen_at: string | null;
  /**
   * How far this person has read. Your own message counts as read once
   * someone else's `last_read_at` is at or past the moment you sent it.
   */
  last_read_at: string | null;
  /** How far messages have reached this person's device. */
  last_delivered_at: string | null;
}

export interface Thread {
  data: ConversationMessage[];
  total: number;
  /** Where you had read up to before this request, for the unread divider. */
  lastReadAt: string | null;
}

/**
 * Chat, direct and group.
 *
 * Mounted at `/messages` rather than `/chat`: the services controller already
 * owns `POST /chat` for the AI proxy.
 */
export const chatApi = {
  /** `q` matches a group name, a participant's name, or a message body. */
  conversations(q?: string): Promise<{ data: Conversation[]; total: number }> {
    return api.get('/messages/conversations', { query: q ? { q } : undefined });
  },

  unread(): Promise<{ count: number }> {
    return api.get('/messages/unread');
  },

  /** Opens or reuses the one-to-one chat with this person. */
  openDirect(userId: string): Promise<{ id: string }> {
    return api.post('/messages/direct', { body: { userId } });
  },

  createGroup(title: string, memberIds: string[]): Promise<{ id: string }> {
    return api.post('/messages/groups', { body: { title, memberIds } });
  },

  messages(id: string, limit = 100): Promise<Thread> {
    return api.get(`/messages/${id}/messages`, { query: { limit } });
  },

  participants(id: string): Promise<{ data: Participant[]; total: number }> {
    return api.get(`/messages/${id}/participants`);
  },

  send(id: string, input: SendMessageInput): Promise<ConversationMessage> {
    return api.post(`/messages/${id}/messages`, { body: input });
  },

  /**
   * Removes one message.
   *
   * 'me' hides it from your own view only; 'everyone' clears the text for all
   * participants and is limited to your own messages.
   */
  deleteMessage(
    id: string,
    messageId: string,
    scope: 'me' | 'everyone',
  ): Promise<{ deleted: boolean; scope: 'me' | 'everyone' }> {
    return api.delete(`/messages/${id}/messages/${messageId}`, { query: { scope } });
  },

  markRead(id: string): Promise<{ read: boolean }> {
    return api.post(`/messages/${id}/read`);
  },

  addMember(id: string, userId: string): Promise<{ added: boolean }> {
    return api.post(`/messages/${id}/members`, { body: { userId } });
  },

  leave(id: string): Promise<{ left: boolean }> {
    return api.delete(`/messages/${id}/members/me`);
  },

  /** Silences push for this conversation. `minutes: 0` unmutes. */
  mute(id: string, minutes: number): Promise<{ muted: boolean; mutedUntil: string | null }> {
    return api.post(`/messages/${id}/mute`, { body: { minutes } });
  },

  /** Groups only — a direct chat is titled from the other person. */
  rename(id: string, title: string): Promise<{ id: string; title: string }> {
    return api.patch(`/messages/${id}`, { body: { title } });
  },

  /**
   * Removes the conversation from your view. A group is left as well; a direct
   * chat stays open so the other person can still reach you.
   */
  remove(id: string): Promise<{ deleted: boolean; left: boolean }> {
    return api.delete(`/messages/${id}`);
  },
};
