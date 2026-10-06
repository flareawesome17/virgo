import { useEffect } from 'react';
import { track } from '@/lib/analytics';
import { persister } from '@/lib/queryClient';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  ApiError,
  clearTokens,
  authApi,
  getAccessToken,
  hydrateTokens,
  queryKeys,
  setAuthFailureHandler,
  watchTokensAcrossTabs,
  type AuthUser,
  type UpdateProfileInput,
  type Credentials,
  type SignupProfile,
} from '@/api';

export interface User {
  id: string;
  email: string;
}

export class AuthError extends Error {
  /** HTTP status, when the failure came from the API. 0 means transport. */
  status?: number;
  /**
   * Machine-readable reason, when the API gave one. EMAIL_NOT_VERIFIED is the
   * one that matters: it needs a "confirm your email" prompt, not the generic
   * error banner.
   */
  code?: string;
  /** The address the API named, so a resend needs no second ask. */
  email?: string;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

/**
 * Turns a transport/API failure into a message worth showing a person.
 *
 * The API's own messages are already user-safe ("Invalid email or password",
 * "An account with that email already exists"), so they are passed through
 * rather than replaced with something vaguer.
 */
function toAuthError(err: unknown): AuthError {
  if (err instanceof ApiError) {
    if (err.isNetworkError) {
      return new AuthError(
        'Could not reach the server. Check your connection and try again.',
        0,
      );
    }
    if (err.status >= 500) {
      return new AuthError(
        'The server had a problem. Please try again in a moment.',
        err.status,
      );
    }
    const error = new AuthError(err.message, err.status);
    const body = err.body as { code?: string; email?: string } | undefined;
    if (body && typeof body === 'object') {
      error.code = body.code;
      error.email = body.email;
    }
    return error;
  }
  return new AuthError('Something went wrong. Please try again.');
}

/**
 * Everything a session leaves in the tab, gone. Signing out, pausing,
 * deleting, another tab signing out, and a session the server has stopped
 * honouring all end here.
 */
function forgetSession(queryClient: QueryClient) {
  queryClient.setQueryData(queryKeys.auth.session, null);
  // Drop every non-auth query: the next user must not see the previous
  // user's cached workspaces flash on screen before their own load.
  // Of the auth keys only the session (just set) and the account-free role
  // list stay: the two-factor status kept the last account's, and the next
  // person to sign in here was shown it.
  queryClient.removeQueries({
    predicate: (q) =>
      !(q.queryKey[0] === 'auth' && ['session', 'user', 'roles'].includes(String(q.queryKey[1]))),
  });
  // And off the disk, now. The desktop app keeps the cache in localStorage
  // and writes it on a one-second throttle, but signing out ends in a full
  // page load to the sign-in page, which usually came first: the last
  // account's albums and chats stayed on disk for the next person to sign in
  // on that machine. Null outside the desktop app, which keeps nothing.
  void persister?.removeClient();
}

/**
 * How many mounted useAuth() calls hold the auth-failure handler.
 *
 * The client has one handler slot and many components call useAuth. Each used
 * to empty the slot when it unmounted, so leaving any of them left nobody
 * handling a dead session: the UI stayed signed in while every request failed.
 * Every holder installs the same handler, and the slot is only emptied when
 * the last one goes.
 */
let authFailureHolders = 0;

/**
 * Whether this page load has checked the session with the server yet.
 *
 * The desktop app saves its query cache to disk and restores it on every page
 * load, the session included. Since v1.13 the sign-in pages and the app are
 * separate root layouts, so moving between them is a full page load, and the
 * cache reaches disk a second after it changes — so a load that follows at
 * once restores the session as it was before. Each page acted on that: the
 * app restored "signed out" and went to sign-in, sign-in restored nobody,
 * checked the fresh tokens and went back, and the write that would have ended
 * it never got its second. Signing in on the desktop reloaded for good, and
 * so did a saved session whose tokens were gone.
 *
 * So nothing acts on the session until this load has checked it once: until
 * then it reads as loading. On the web nothing is restored, and that first
 * check is what always decided it anyway.
 */
let checkedThisLoad = false;

/**
 * Authentication against the NestJS API.
 *
 * Mirrors the mobile hook, with one addition the browser needs: signing out in
 * one tab has to sign out the others, since they share an origin's storage and
 * would otherwise carry on holding a revoked token.
 */
export function useAuth() {
  const queryClient = useQueryClient();

  // A 401 that survives a refresh attempt means the session is unrecoverable.
  // Handling it centrally flips the app to the signed-out UI once, instead of
  // every route separately discovering that its queries now fail.
  useEffect(() => {
    authFailureHolders += 1;
    setAuthFailureHandler(() => forgetSession(queryClient));
    return () => {
      authFailureHolders -= 1;
      if (authFailureHolders === 0) setAuthFailureHandler(null);
    };
  }, [queryClient]);

  useEffect(
    () => watchTokensAcrossTabs(() => forgetSession(queryClient)),
    [queryClient],
  );

  const sessionQuery = useQuery<AuthUser | null>({
    queryKey: queryKeys.auth.session,
    queryFn: async () => {
      try {
        // Tokens live in localStorage, so the first call after a page load has
        // to read them before it can know whether a session exists.
        await hydrateTokens();
        if (!getAccessToken()) return null;

        try {
          return await authApi.me();
        } catch (err) {
          // A definitive 401 means the stored tokens are dead -> signed out.
          if (err instanceof ApiError && err.isAuthError) return null;
          // Anything else (offline, DNS, timeout, 5xx) is NOT proof of being
          // signed out. Rethrow so the guard can show a retry instead of
          // dumping someone at the login page over a dropped connection.
          throw err;
        }
      } finally {
        // Before the result lands, so the render it causes reads it.
        checkedThisLoad = true;
      }
    },
    staleTime: 0,
    /*
     * Fails fast offline, so the guard can say so.
     *
     * The default network mode here is 'online', which does not even start a
     * query while the browser reports no connection — it parks it as pending
     * and not fetching. `isLoading` is false for that, and so is `isError`,
     * so the guard read an offline page load as "signed out" and sent a
     * signed-in person to the sign-in page.
     *
     * 'always' runs it and lets it fail. A connection failure is not retried;
     * the guard's screen retries on its own when the connection returns.
     */
    networkMode: 'always',
    retry: (failures, err) =>
      failures < 1 && !(err instanceof ApiError && err.isNetworkError),
  });

  // A session restored from disk is not believed until this load checks it.
  const authUser = checkedThisLoad ? (sessionQuery.data ?? null) : null;
  const user: User | null = authUser
    ? { id: authUser.id, email: authUser.email }
    : null;

  const signIn = useMutation({
    // `unpause` lifts a pause of your own as it signs in, as on the phone.
    mutationFn: async (input: { email: string; password: string; unpause?: boolean }) => {
      try {
        return await authApi.login(input);
      } catch (err) {
        throw toAuthError(err);
      }
    },
    onSuccess: (result) => {
      // A challenge is not a session: the API issued no tokens, and the form
      // still has a step to go. Seeding the cache here would report someone
      // as signed in while holding nothing to sign requests with.
      if ('twoFactorRequired' in result) return;
      queryClient.setQueryData(queryKeys.auth.session, result.user);
      track('signed_in');
    },
  });

  /**
   * Finishes a sign-in that came back as a 2FA challenge.
   *
   * Takes the code from either source the API accepts — the emailed six
   * digits or a saved recovery code — because to this hook they are the same
   * string in the same field.
   */
  const completeTwoFactorSignIn = useMutation({
    mutationFn: async ({
      challengeToken,
      code,
    }: {
      challengeToken: string;
      code: string;
    }) => {
      try {
        return await authApi.completeTwoFactorLogin(challengeToken, code);
      } catch (err) {
        throw toAuthError(err);
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.auth.session, result.user);
      // Counted here rather than at the password step: this is the point a
      // 2FA account actually got in.
      track('signed_in');
    },
  });

  const resendTwoFactorCode = useMutation({
    mutationFn: async (challengeToken: string) => {
      try {
        return await authApi.resendTwoFactorCode(challengeToken);
      } catch (err) {
        throw toAuthError(err);
      }
    },
  });

  const signUp = useMutation({
    mutationFn: async (input: Credentials & SignupProfile) => {
      try {
        return await authApi.register(input);
      } catch (err) {
        throw toAuthError(err);
      }
    },
    onSuccess: (result) => {
      // No session to seed: registering no longer signs anybody in. The form
      // sends them to check their inbox, and they sign in once the address is
      // confirmed.
      //
      // The number that matters most for a pre-release: did anybody finish.
      track('signed_up', { roles: result.user.roles?.length ?? 0 });
    },
  });

  const updateProfile = useMutation({
    mutationFn: async (input: UpdateProfileInput) => {
      try {
        return await authApi.updateMe(input);
      } catch (err) {
        throw toAuthError(err);
      }
    },
    onSuccess: (updated) => {
      // Written straight into the session cache so everything reading `profile`
      // reflects the change immediately, without a refetch round trip.
      queryClient.setQueryData(queryKeys.auth.session, updated);
      // Name, photo, bio and studio are also what your own page and your own
      // public profile show, and those are separate queries.
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.page });
      queryClient.invalidateQueries({ queryKey: queryKeys.publicProfiles.all });
    },
  });

  const signOut = useMutation({
    mutationFn: async () => {
      await authApi.logout();
    },
    // Settled, not success. logout clears the tokens whether or not the
    // server heard it, then rethrows a network failure — so offline, the
    // tokens were gone but the UI stayed signed in until a second click.
    onSettled: () => forgetSession(queryClient),
  });

  /**
   * Pauses the account, then signs out.
   *
   * The server revokes every refresh token, including this session's, so the
   * local sign-out is not a courtesy — the UI would otherwise sit there until
   * its access token expired and every request started failing.
   */
  const disableAccount = useMutation({
    mutationFn: ({ password, days }: { password: string; days: number }) =>
      authApi.disableAccount(password, days),
    onSuccess: async () => {
      await clearTokens();
      forgetSession(queryClient);
    },
  });

  /** Deletes the account for good, then signs out. */
  const deleteAccount = useMutation({
    mutationFn: (password: string) => authApi.deleteAccount(password),
    onSuccess: async () => {
      await clearTokens();
      forgetSession(queryClient);
    },
  });

  return {
    user,
    profile: authUser,
    isAuthenticated: !!authUser,
    isLoading: sessionQuery.isLoading || !checkedThisLoad,
    /**
     * True when the session could not be resolved for a reason other than a
     * 401 — almost always the network. Distinct from "signed out": the guard
     * offers a retry instead of redirecting to the login page.
     */
    isSessionError: sessionQuery.isError,
    /** True while a session check is running, including a retry. */
    isCheckingSession: sessionQuery.isFetching,
    retrySession: sessionQuery.refetch,
    signIn,
    completeTwoFactorSignIn,
    resendTwoFactorCode,
    signUp,
    signOut,
    updateProfile,
    disableAccount,
    deleteAccount,
  };
}
