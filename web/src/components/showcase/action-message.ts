import { ApiError } from '@/api';

/**
 * What a failed action on somebody's showcase says. Never the error's own
 * message.
 *
 * The phone's profileActionMessage, cut down to the actions the web offers.
 * Fixed copy rather than the server's text, because the text an older API
 * answers with is written for developers ("property note should not exist"),
 * and the codes that mean something the person can act on get a line of
 * their own.
 */
export type ShowcaseAction = 'keep' | 'unkeep' | 'shelf' | 'report' | 'comment' | 'uncomment';

const ACTION_COPY: Record<ShowcaseAction, string> = {
  keep: "Couldn't keep it. Try again.",
  unkeep: "Couldn't take it off that shelf. Try again.",
  shelf: "Couldn't make that shelf. Try again.",
  report: "Couldn't send the report. Try again.",
  comment: "Couldn't post your comment. Try again.",
  uncomment: "Couldn't remove that comment. Try again.",
};

const OFFLINE = 'Check your connection and try again.';

function codeOf(err: ApiError): string | undefined {
  if (!err.body || typeof err.body !== 'object') return undefined;
  const code = (err.body as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

export function showcaseActionMessage(err: unknown, action: ShowcaseAction): string {
  if (!(err instanceof ApiError)) return ACTION_COPY[action];
  // Status 0 is only the connection when a request actually failed to get
  // out — the client attaches what fetch threw. Without a body it is
  // something that went wrong here, and blaming the connection sends
  // somebody off to fix the wrong thing.
  if (err.status === 0) return err.body !== undefined ? OFFLINE : ACTION_COPY[action];

  const code = codeOf(err);
  if (code === 'COMMENTS_OFF') return 'Comments are off for this post.';
  if (code === 'SHELF_NAME_TAKEN' || (action === 'shelf' && err.status === 409)) {
    return 'You already have a shelf with that name. Choose another, or keep it there.';
  }
  if (code === 'SHELF_LIMIT') return "You're at the most shelves you can have. Delete one first.";
  if (code === 'EMAIL_NOT_VERIFIED') {
    return 'Confirm your email address first. The link is in your inbox.';
  }
  if (err.status === 429) return "You're doing that a lot. Wait a moment and try again.";
  // A shelf or a comment that has gone is not the post having gone, so those
  // two keep their own line.
  if (err.status === 404 && action !== 'shelf' && action !== 'uncomment') {
    return "This showcase isn't available any more.";
  }
  return ACTION_COPY[action];
}
