import type { ConversationMessage } from '@/src/api';

/**
 * The message a chat photo was opened from, handed to the viewer. The viewer
 * reads the live copy from the thread's cache when it is there; this is for
 * when it isn't (a window of history, a page since dropped).
 */
const shown = new Map<string, ConversationMessage>();

export function showChatPhoto(message: ConversationMessage): void {
  shown.set(message.id, message);
}

export function shownChatPhoto(messageId: string): ConversationMessage | null {
  return shown.get(messageId) ?? null;
}

export function forgetChatPhoto(messageId: string): void {
  shown.delete(messageId);
}
