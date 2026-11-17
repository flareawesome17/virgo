import AsyncStorage from '@react-native-async-storage/async-storage';
import { hashKey, type QueryClient } from '@tanstack/react-query';
import { queryKeys, type AuthUser } from '@/src/api';

/**
 * Who is signed in on this phone, as the server last said, kept until they
 * sign out.
 *
 * The session is not in the saved query cache: it is asked of the server on
 * every launch. So a phone opened with no connection could not say who was
 * signed in, and stopped on "Can't reach the server" with the tokens and the
 * saved screens sitting right there on it. The same phone losing its
 * connection while open carried on as if nothing had happened, so offline only
 * worked if the app had never been closed.
 *
 * With this, a launch opens on the account at once and asks the server behind
 * it (useAuth). Its own row, next to the tokens rather than in the query
 * cache, so it lasts as long as they do (past the cache's age limit, past a
 * cache version bump) and goes the moment the session does.
 */
const KEY = 'virgo.auth.lastAccount';
const SESSION = hashKey(queryKeys.auth.session);

/** What is on disk now, so the same account is not written again each check. */
let written: string | null | undefined;

export async function readLastAccount(): Promise<AuthUser | null> {
  try {
    const text = await AsyncStorage.getItem(KEY);
    if (!text) return null;
    const account = JSON.parse(text) as AuthUser | null;
    return account && typeof account.id === 'string' ? account : null;
  } catch {
    return null;
  }
}

function remember(account: AuthUser | null) {
  const text = account ? JSON.stringify(account) : null;
  if (text === written) return;
  written = text;
  const work = text === null ? AsyncStorage.removeItem(KEY) : AsyncStorage.setItem(KEY, text);
  work.catch(() => {
    written = undefined;
  });
}

/**
 * Keeps the saved account in step with the session, whatever changed it: the
 * launch check, signing in, a profile edit, and every way of signing out
 * (they all set the session to null, see forgetSession in useAuth).
 *
 * Watching the cache rather than writing from each of those, so a way of
 * signing in added later cannot forget to.
 */
export function wireLastAccount(client: QueryClient): () => void {
  return client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return;
    if (event.query.queryHash !== SESSION) return;
    remember((event.query.state.data as AuthUser | null | undefined) ?? null);
  });
}
