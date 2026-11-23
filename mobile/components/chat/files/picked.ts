import type { ImagePickerAsset } from 'expo-image-picker';
import type { ConversationMessage } from '@/src/api';
import type { LocalChatFile } from '@/src/lib/chat-files';

/**
 * What was just picked from the phone, handed from the chat to the check
 * screen (board 141). Here rather than in the route: ten photos' URIs have
 * no business in a link, and the reply being written goes with them.
 */
export type PickedForChat =
  | { kind: 'photos'; assets: ImagePickerAsset[]; replyTo: ConversationMessage | null }
  | { kind: 'file'; file: LocalChatFile; replyTo: ConversationMessage | null };

const pending = new Map<string, PickedForChat>();

export function handOffPicked(conversationId: string, picked: PickedForChat): void {
  pending.set(conversationId, picked);
}

/** What is waiting for this chat's check screen, taken so it is used once. */
export function takePicked(conversationId: string): PickedForChat | null {
  const picked = pending.get(conversationId) ?? null;
  pending.delete(conversationId);
  return picked;
}
