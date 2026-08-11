import { useEffect } from 'react';
import { track } from '@/lib/analytics';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
    setAuthFailureHandler(() => {
      queryClient.setQueryData(queryKeys.auth.session, null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
    });
    return () => setAuthFailureHandler(null);
  }, [queryClient]);

  useEffect(
    () =>
      watchTokensAcrossTabs(() => {
        queryClient.setQueryData(queryKeys.auth.session, null);
        queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
      }),
    [queryClient],
  );

  const sessionQuery = useQuery<AuthUser | null>({
    queryKey: queryKeys.auth.session,
    queryFn: async () => {
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
    },
    staleTime: 0,
    retry: 1,
  });

  const authUser = sessionQuery.data ?? null;
  const user: User | null = authUser
    ? { id: authUser.id, email: authUser.email }
    : null;

  const signIn = useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      try {
        return await authApi.login(input);
      } catch (err) {
        throw toAuthError(err);
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.auth.session, result.user);
      track('signed_in');
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
    },
  });

  const signOut = useMutation({
    mutationFn: async () => {
      await authApi.logout();
    },
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.auth.session, null);
      // Drop every non-auth query: the next user must not see the previous
      // user's cached workspaces flash on screen before their own load.
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
    },
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
      queryClient.setQueryData(queryKeys.auth.session, null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
    },
  });

  /** Deletes the account for good, then signs out. */
  const deleteAccount = useMutation({
    mutationFn: (password: string) => authApi.deleteAccount(password),
    onSuccess: async () => {
      await clearTokens();
      queryClient.setQueryData(queryKeys.auth.session, null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
    },
  });

  return {
    user,
    profile: authUser,
    isAuthenticated: !!authUser,
    isLoading: sessionQuery.isLoading,
    /**
     * True when the session could not be resolved for a reason other than a
     * 401 — almost always the network. Distinct from "signed out": the guard
     * offers a retry instead of redirecting to the login page.
     */
    isSessionError: sessionQuery.isError,
    retrySession: sessionQuery.refetch,
    signIn,
    signUp,
    signOut,
    updateProfile,
    disableAccount,
    deleteAccount,
  };
}
