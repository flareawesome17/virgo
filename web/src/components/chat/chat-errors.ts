import { ApiError, chatRefusal, MAX_CARD_FILES, MAX_PINNED_CHATS, type CardKind } from '@/api';

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

/** What a share-in-chat card is, for saying what went wrong with sending one. */
export type CardSendKind = CardKind | 'pay-card';

/**
 * Why a card did not go, in words.
 *
 * Not chatProblem: its 404 says "That message or chat is no longer here",
 * which is wrong for a booking that was deleted, and its 400 passes the
 * server's text through, which for a card is a validator's field name
 * ("time must be HH:MM") rather than something to read.
 */
export function cardProblem(err: unknown, kind: CardSendKind): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return "You're offline. Try again when you're connected.";
    if (err.status === 429) return "You've done this a lot in a short time. Try again later.";
    if (chatRefusal(err)) return "You can't do that in this conversation.";
    if (err.status === 403) {
      return kind === 'album-photos'
        ? 'You can only share from albums you own or manage.'
        : "You can't share that here.";
    }
    if (err.status === 404) {
      return kind === 'pay-card'
        ? 'That way to pay was removed. Choose another.'
        : "It isn't there any more. It may have been deleted.";
    }
    if (err.status === 400) {
      if (kind === 'album-photos') return `Choose up to ${MAX_CARD_FILES} at a time, all from this album.`;
      if (kind === 'date-plan') return 'Check the date, time and place, then try again.';
    }
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
