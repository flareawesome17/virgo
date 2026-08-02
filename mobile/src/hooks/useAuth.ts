/**
 * useAuth Hook
 *
 * Authentication against the NestJS REST API. The public shape is unchanged
 * from the Supabase version — `user`, `session`, `isAuthenticated`,
 * `isLoading`, and the `signIn` / `signUp` / `signOut` mutations — so screens
 * consuming it did not need to change.
 */

import { clearReminderNotifications } from '@/src/lib/notifications';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  clearTokens,
  authApi,
  getAccessToken,
  hydrateTokens,
  queryKeys,
  setAuthFailureHandler,
  type AuthUser,
  type UpdateProfileInput,
} from '@/src/api';

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
  /**
   * Kept because screens read `err.reason` first. It must stay human-readable:
   * putting the status code here made the sign-in screen display "401".
   */
  reason?: string;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.reason = message;
  }
}

/** Kept for backwards compatibility with screens importing it. */
export const authKeys = {
  session: queryKeys.auth.session,
  user: queryKeys.auth.user,
};

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

export function useAuth() {
  const queryClient = useQueryClient();

  // A 401 that survives a refresh attempt means the session is unrecoverable.
  // Handling it centrally flips the app to the signed-out UI once, instead of
  // every screen separately discovering that its queries now fail.
  useEffect(() => {
    setAuthFailureHandler(() => {
      queryClient.setQueryData(queryKeys.auth.session, null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
    });
    return () => setAuthFailureHandler(null);
  }, [queryClient]);

  const sessionQuery = useQuery<AuthUser | null>({
    queryKey: queryKeys.auth.session,
    queryFn: async () => {
      // Tokens live in AsyncStorage, so the first call after a cold start has
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
        // dumping someone to the login screen over a dropped connection.
        throw err;
      }
    },
    staleTime: 0,
    // One retry covers a transient blip; more would stall the splash screen.
    retry: 1,
  });

  const authUser = sessionQuery.data ?? null;
  const user: User | null = authUser
    ? { id: authUser.id, email: authUser.email }
    : null;

  const signIn = useMutation({
    mutationFn: async ({
      email,
      password,
    }: {
      email: string;
      password: string;
    }) => {
      try {
        return await authApi.login({ email, password });
      } catch (err) {
        throw toAuthError(err);
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.auth.session, result.user);
    },
  });

  const signUp = useMutation({
    mutationFn: async ({
      email,
      password,
      displayName,
      roles,
    }: {
      email: string;
      password: string;
      displayName?: string;
      roles: string[];
    }) => {
      try {
        return await authApi.register({ email, password, displayName, roles });
      } catch (err) {
        throw toAuthError(err);
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.auth.session, result.user);
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
      // Write straight into the session cache so every screen reading `user`
      // reflects the change immediately, without a refetch round-trip.
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
      // Otherwise this account's alarms keep firing on the device after
      // signing out, including for whoever signs in next.
      void clearReminderNotifications();
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
    /** Kept for shape compatibility; there is no Supabase session object now. */
    session: authUser ? { user: authUser } : null,
    isAuthenticated: !!authUser,
    isLoading: sessionQuery.isLoading,
    /**
     * True when the session could not be resolved for a reason other than a
     * 401 — almost always the network. Distinct from "signed out": the guard
     * offers a retry instead of redirecting to login.
     */
    isSessionError: sessionQuery.isError,
    retrySession: sessionQuery.refetch,
    /** Full profile from /auth/me — includes displayName / avatarUrl. */
    profile: authUser,
    updateProfile,
    disableAccount,
    deleteAccount,
    signIn,
    signUp,
    signOut,
  };
}
