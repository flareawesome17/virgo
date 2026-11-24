import { ApiError, chatRefusal } from '@/src/api';

/**
 * What a failed chat action says.
 *
 * Never the raw message, except a 400's, which is the API's own sentence for
 * something the person did — "You can pin up to 5 chats", "Messages can be
 * edited for 15 minutes after sending" — and says more than a generic line.
 * A block's refusal is worded by the server so it never says "blocked".
 */
export function chatError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return "You're offline. Try again when you're connected.";
    if (err.status === 429) return "You've done this a lot in a short time. Try again in a bit.";
    if (err.status === 400 && err.message) return err.message;
    if (chatRefusal(err)) return err.message || "You can't do that in this conversation.";
    if (err.status === 404) return "That isn't here any more. It may have been deleted.";
  }
  return 'Something went wrong. Please try again.';
}

/**
 * What a refused group change says: an admin's control, a name a team chat
 * takes from its workspace, an owner who can't be removed. The server words
 * a 403 from a group as a whole sentence, so that is shown too.
 */
export function groupError(err: unknown): string {
  if (err instanceof ApiError && err.status === 403 && err.message) return err.message;
  return chatError(err);
}

/** Mute durations, in minutes. A year stands in for "until I turn it back on". */
export const MUTE_OPTIONS: { label: string; minutes: number }[] = [
  { label: '1 hour', minutes: 60 },
  { label: '8 hours', minutes: 480 },
  { label: '1 week', minutes: 60 * 24 * 7 },
  { label: 'Until I turn it back on', minutes: 525_600 },
];

/** "Muted until 3:00 PM", "Muted until 24 Nov", or just "Muted". */
export function mutedUntilLabel(iso: string | null): string {
  if (!iso) return '';
  const until = new Date(iso);
  const days = (until.getTime() - Date.now()) / 86_400_000;
  if (days > 300) return 'Muted';
  if (until.toDateString() === new Date().toDateString()) {
    return `Muted until ${until.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  }
  return `Muted until ${until.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`;
}

/** A first name, as a person would say it. */
export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** One or two letters for an avatar with no photograph. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words.length === 1
    ? words[0].charAt(0).toUpperCase()
    : `${words[0].charAt(0)}${words[words.length - 1].charAt(0)}`.toUpperCase();
}

/** "3:04 PM" today, "Mon 3:04 PM" this week, "3 Nov" before that. */
export function momentLabel(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const time = then.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (then.toDateString() === now.toDateString()) return time;
  if (now.getTime() - then.getTime() < 6 * 86_400_000) {
    return `${then.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
  }
  return then.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

/** Minutes left to edit a message, rounded up, never below one. */
export function editMinutesLeft(createdAt: string, windowMinutes: number, now = Date.now()): number {
  const left = new Date(createdAt).getTime() + windowMinutes * 60_000 - now;
  return Math.max(1, Math.ceil(left / 60_000));
}
