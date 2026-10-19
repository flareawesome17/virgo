import { ApiError } from '@/api';

/**
 * What a failed action on somebody's showcase says. Never the error's own
 * message.
 *
 * The phone's profileActionMessage, cut down to the actions the web offers:
 * now posting and editing your own as well as keeping and commenting on
 * somebody else's.
 * Fixed copy rather than the server's text, because the text an older API
 * answers with is written for developers ("property note should not exist"),
 * and the codes that mean something the person can act on get a line of
 * their own.
 */
export type ShowcaseAction =
  | 'keep'
  | 'unkeep'
  | 'shelf'
  | 'report'
  | 'comment'
  | 'uncomment'
  | 'post'
  | 'edit'
  | 'takedown'
  | 'delete'
  | 'cover';

const ACTION_COPY: Record<ShowcaseAction, string> = {
  keep: "Couldn't keep it. Try again.",
  unkeep: "Couldn't take it off that shelf. Try again.",
  shelf: "Couldn't make that shelf. Try again.",
  report: "Couldn't send the report. Try again.",
  comment: "Couldn't post your comment. Try again.",
  uncomment: "Couldn't remove that comment. Try again.",
  post: "Couldn't post that. Try again.",
  edit: "Couldn't save your changes. Try again.",
  takedown: "Couldn't change that. Try again.",
  delete: "Couldn't delete it. Try again.",
  cover: "Couldn't change your cover. Try again.",
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
  // Posting, said for what actually went wrong: "Try again" for a photograph
  // that can never be posted would never come true.
  if (code === 'SHOWCASE_FILM_NOT_READY') {
    return 'That film is still being prepared. Give it a minute, then post again.';
  }
  if (code === 'SHOWCASE_TOO_LARGE') {
    return 'That photo is too large to post. Take it out, or choose one under 40 MB.';
  }
  if (code === 'SHOWCASE_NO_WEB_COPY') {
    return "That photo can't be posted. Take it out, or try a JPEG or PNG copy of it.";
  }
  // A film and photographs together, which an older form (or another tab)
  // could still send: the rule, and what to do about it.
  if (code === 'SHOWCASE_FILM_ALONE') {
    return 'A film is posted on its own. Take out the photos, or the film, and post again.';
  }
  if (code === 'SHOWCASE_LIMIT') {
    return 'You have 100 showcases, which is the most there can be. Delete one to post another.';
  }
  if (code === 'COVER_UNUSABLE') return "That photo couldn't be used as a cover. Try a different one.";
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

/**
 * The piece a posting refusal is about, when the server named one, so the
 * form can mark that photograph rather than leave somebody guessing which of
 * ten it was.
 */
export function faultyPiece(err: unknown): string | null {
  if (err instanceof ApiError && err.body && typeof err.body === 'object') {
    const key = (err.body as { fileKey?: unknown }).fileKey;
    return typeof key === 'string' ? key : null;
  }
  return null;
}
