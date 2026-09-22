/**
 * Error raised by every API call.
 *
 * `message` is safe to surface in UI — the backend's exception filter already
 * strips driver internals, and `fallbackMessage` covers transport failures
 * where there is no server response at all.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  /** True when the session is gone and the user needs to sign in again. */
  get isAuthError(): boolean {
    return this.status === 401;
  }

  /** True when there was no usable response — offline, DNS, timeout. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/**
 * Pulls a human-readable message out of a Nest error payload.
 * ValidationPipe returns `message` as an array of strings.
 */
export function extractMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string' && body.trim()) return body;

  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
    if (Array.isArray(message) && message.length > 0) {
      return message.filter((m) => typeof m === 'string').join(', ') || fallback;
    }
  }

  return fallback;
}

/**
 * Why the server would not let a chat action through because of a block.
 *
 * 'you-blocked': you blocked them, and unblocking is up to you.
 * 'unavailable': they blocked you, or everyone else in the group is blocked
 * with you. Worded by the server so it never says "blocked".
 * 'group': a group would have put a blocked pair together.
 */
export type ChatRefusal = 'you-blocked' | 'unavailable' | 'group';

/**
 * Reads the refusal off a 403, by its code rather than its text.
 *
 * The code is what stays stable: the message is copy and can be reworded, and
 * a 403 without one of these codes — not being friends, say — is a different
 * refusal with its own handling, so it answers null.
 */
export function chatRefusal(err: unknown): ChatRefusal | null {
  if (!(err instanceof ApiError) || err.status !== 403) return null;
  const code =
    err.body && typeof err.body === 'object'
      ? (err.body as { code?: unknown }).code
      : undefined;
  return code === 'YOU_BLOCKED'
    ? 'you-blocked'
    : code === 'CHAT_UNAVAILABLE'
      ? 'unavailable'
      : code === 'GROUP_MEMBER_UNAVAILABLE'
        ? 'group'
        : null;
}
