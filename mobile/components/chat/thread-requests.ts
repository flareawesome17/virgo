/**
 * What a chat should open on, asked for from another screen: search (from
 * group info's tile, or the list's search with the match it found), or the
 * Pinned sheet.
 *
 * Handed over here rather than in the route: the thread is usually already
 * open under group info, going back to it carries no params, and a search
 * term has no business in a link. The thread takes the request when it gets
 * focus, once.
 */
export type ThreadRequest =
  | { kind: 'search'; q?: string; matchId?: string | null }
  | { kind: 'pins' };

const pending = new Map<string, ThreadRequest>();

export function requestInThread(conversationId: string, request: ThreadRequest): void {
  pending.set(conversationId, request);
}

/** The request waiting for this chat, if any, taken so it runs once. */
export function takeThreadRequest(conversationId: string): ThreadRequest | null {
  const request = pending.get(conversationId) ?? null;
  pending.delete(conversationId);
  return request;
}
