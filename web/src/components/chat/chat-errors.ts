import { ApiError, chatRefusal, MAX_PINNED_CHATS } from '@/api';

/**
 * What went wrong with something done in a chat, in words.
 *
 * Worded here, like the safety menu's errors, rather than passing the
 * server's text through. A 400 is the API's own copy for something the
 * person did — "Messages can be edited for 15 minutes after sending" — and is
 * kept; a block is said without the word, as the thread's notice says it.
 */
export function chatProblem(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return "You're offline. Try again when you're connected.";
    if (err.status === 429) return "You've done this a lot in a short time. Try again later.";
    if (chatRefusal(err)) return "You can't do that in this conversation.";
    if (err.status === 404) return 'That message or chat is no longer here.';
    if (err.status === 400 && err.message) return err.message;
  }
  return 'Something went wrong. Please try again.';
}

/**
 * Why a pin did not go through.
 *
 * The limit is the one refusal pinning has, and the server's copy for it
 * says what but not what to do, so it is said here in full.
 */
export function pinProblem(err: unknown): string {
  if (err instanceof ApiError && err.status === 400) {
    return `You can pin up to ${MAX_PINNED_CHATS} chats. Unpin one to make room.`;
  }
  return chatProblem(err);
}
