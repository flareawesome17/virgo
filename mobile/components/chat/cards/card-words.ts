import { ApiError, chatRefusal, type CardKind, type Participant } from '@/src/api';
import { firstNameOf } from '../chat-words';

/**
 * Who is in the chat, as the cards need to say it: "Ana can save them",
 * "Bea can't", the initials of who is going. Built once per member list by
 * the thread, so a memoised bubble is not redrawn for it.
 */
export interface ChatPeople {
  isGroup: boolean;
  /** In a direct chat, the other person's first name. */
  otherFirst: string | null;
  byId: ReadonlyMap<string, Participant>;
}

export function firstNameFor(people: ChatPeople, userId: string): string {
  const name = people.byId.get(userId)?.name;
  return name ? firstNameOf(name) : 'Someone';
}

/** "Ana", "Ana and Marco", "Ana, Marco, Jo and Bea". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** What a thing that could not be shared is called, for "That … isn't …". */
const GONE: Record<CardKind | 'pay-card', string> = {
  'album-photos': "That album isn't yours to share any more.",
  booking: "That booking isn't here any more.",
  'job-post': "That job post isn't up any more.",
  post: "That post isn't up any more.",
  package: "That package isn't here any more.",
  'date-plan': "That date isn't on your Schedule any more.",
  'pay-card': "That way to pay isn't saved any more.",
};

/**
 * What a card that would not send says, in plain words. Never the server's
 * own sentence: a refusal there is worded for a developer ("Some of those
 * files are not in this album").
 */
export function cardSendError(err: unknown, kind: CardKind | 'pay-card'): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return "You're offline. Try again when you're connected.";
    if (err.status === 429) return "You've sent a lot in a short time. Try again in a bit.";
    if (chatRefusal(err)) return "This chat isn't taking messages right now.";
    if (err.status === 404) return GONE[kind];
    if (err.status === 400) {
      return kind === 'album-photos'
        ? "Some of those aren't in the album any more. Choose again and send."
        : "That didn't go through. Check it and try again.";
    }
  }
  return "Couldn't send it. Try again.";
}

/** What a date's answer that failed says. */
export function answerError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return "You're offline. Try again when you're connected.";
    if (err.status === 404 || err.status === 400) return 'That date was removed.';
  }
  return "Couldn't save your answer. Try again.";
}
