import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  authApi,
  getAccessToken,
  hydrateTokens,
  queryKeys,
  setAuthFailureHandler,
  watchTokensAcrossTabs,
  type AuthUser,
  type UpdateProfileInput,
} from '@/api';

export interface User {
  id: string;
  email: string;
}

export class AuthError extends Error {
  /** HTTP status, when the failure came from the API. 0 means transport. */
  status?: number;

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
    return new AuthError(err.message, err.status);
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
    },
  });

  const signUp = useMutation({
    mutationFn: async (input: {
      email: string;
      password: string;
      displayName?: string;
    }) => {
      try {
        return await authApi.register(input);
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
  };
}
