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
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender_name?: string;
}

export interface Participant {
  id: string;
  name: string;
  avatar_url: string | null;
}

/**
 * Chat, direct and group.
 *
 * Mounted at `/messages` rather than `/chat`: the services controller already
 * owns `POST /chat` for the AI proxy.
 */
export const chatApi = {
  conversations(): Promise<{ data: Conversation[]; total: number }> {
    return api.get('/messages/conversations');
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

  messages(id: string, limit = 100): Promise<{ data: ConversationMessage[]; total: number }> {
    return api.get(`/messages/${id}/messages`, { query: { limit } });
  },

  participants(id: string): Promise<{ data: Participant[]; total: number }> {
    return api.get(`/messages/${id}/participants`);
  },

  send(id: string, body: string): Promise<ConversationMessage> {
    return api.post(`/messages/${id}/messages`, { body: { body } });
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
};
