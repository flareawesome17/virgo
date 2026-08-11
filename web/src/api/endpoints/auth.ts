import { api } from '../client';
import { clearTokens, getRefreshToken, setTokens } from '../tokens';
import type {
  AuthResult,
  AuthUser,
  RegisterResult,
  UpdateProfileInput,
} from '../types';

export interface Credentials {
  email: string;
  password: string;
}

/**
 * Auth endpoints.
 *
 * register/login/refresh are `anonymous` — they must not carry a stale
 * Authorization header, and a 401 from them means "bad credentials", not
 * "token expired", so the refresh-retry would be wrong.
 */
/**
 * Everything signup collects beyond the credentials.
 *
 * Gathered across three steps — credentials, then what they do, then where
 * they are — and sent once at the end. The wizard is progressive disclosure
 * of a single form, not three saves: abandoning it halfway should leave no
 * half-made account behind.
 *
 * The address is required, as it is on both forms and in RegisterDto. Line
 * two and the postal code are not: plenty of Philippine addresses have
 * neither, and rejecting somebody for having no ZIP is rejecting them for
 * where they live.
 *
 * This type tightened last, after both clients had the form. A required
 * field in a shared type is a compile error in whichever client has not
 * caught up yet, which is the useful direction for that error to point.
 */
export interface SignupProfile {
  displayName?: string;
  roles: string[];
  addressLine1: string;
  addressLine2?: string;
  addressCity: string;
  addressProvince: string;
  addressPostal?: string;
  /** Two letters, ISO 3166-1. */
  addressCountry: string;
  /** What they trade as, if that is not their own name. */
  studioName?: string;
  /** A handle, a page or a URL — whatever they actually use. */
  socialHandle?: string;
}

export const authApi = {
  /**
   * Creates the account. Does NOT sign in.
   *
   * No tokens come back and none are stored: the address has to be confirmed
   * first, and `login` refuses an unverified account. Registering used to
   * return a session, which meant the verification link was decorative —
   * anybody could use the app by typing an address they did not own.
   */
  async register(
    credentials: Credentials & SignupProfile,
  ): Promise<RegisterResult> {
    return api.post<RegisterResult>('/auth/register', {
      body: credentials,
      anonymous: true,
    });
  },

  /** The roles a sign-up may choose from, as the server defines them. */
  listRoles(): Promise<{ data: string[]; total: number }> {
    return api.get('/auth/roles', { anonymous: true });
  },

  /**
   * Starts a password reset.
   *
   * Always resolves, whether or not the address has an account — the server
   * deliberately gives the same answer either way, so the UI must not imply
   * otherwise.
   */
  forgotPassword(email: string): Promise<{ accepted: boolean; message: string }> {
    return api.post('/auth/forgot-password', { body: { email }, anonymous: true });
  },

  resetPassword(token: string, password: string): Promise<{ reset: boolean }> {
    return api.post('/auth/reset-password', {
      body: { token, password },
      anonymous: true,
    });
  },

  verifyEmail(token: string): Promise<{ verified: boolean }> {
    return api.post('/auth/verify-email', { body: { token }, anonymous: true });
  },

  /** Re-sends the confirmation link to the signed-in user's own address. */
  resendVerification(): Promise<{ accepted: boolean }> {
    return api.post('/auth/resend-verification');
  },

  /**
   * Re-sends the confirmation link to an address, with no session.
   *
   * The authenticated version above is unreachable once verification blocks
   * sign-in — which is exactly when someone needs it. Always resolves, whether
   * or not the address exists.
   */
  requestVerification(email: string): Promise<{ accepted: boolean; message: string }> {
    return api.post('/auth/request-verification', { body: { email }, anonymous: true });
  },

  async login(credentials: Credentials): Promise<AuthResult> {
    const result = await api.post<AuthResult>('/auth/login', {
      body: credentials,
      anonymous: true,
    });
    await setTokens(result.accessToken, result.refreshToken);
    return result;
  },

  async logout(): Promise<void> {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) {
        await api.post<void>('/auth/logout', {
          body: { refreshToken },
          anonymous: true,
        });
      }
    } finally {
      // Local sign-out must succeed even if the server call fails; otherwise a
      // network blip would strand the user in a signed-in UI they cannot use.
      await clearTokens();
    }
  },

  me(): Promise<AuthUser> {
    return api.get<AuthUser>('/auth/me');
  },

  /**
   * Updates the signed-in user's own profile. The server takes the id from the
   * JWT, so there is no user id to pass. Pass `null` to clear a field.
   */
  updateMe(input: UpdateProfileInput): Promise<AuthUser> {
    return api.patch<AuthUser>('/auth/me', { body: input });
  },

  // ─── Closing the account ───────────────────────────────────────────────────

  /**
   * Pauses the account for a number of days.
   *
   * Every session is revoked server-side, including this one, so the caller
   * must clear its own tokens afterwards rather than waiting for the next
   * request to fail.
   */
  disableAccount(
    password: string,
    days: number,
  ): Promise<{ disabledUntil: string }> {
    return api.post('/auth/me/disable', { body: { password, days } });
  },

  /** Lifts a pause early, while a session is still valid. */
  enableAccount(): Promise<AuthUser> {
    return api.post('/auth/me/enable');
  },

  /**
   * Deletes the account, its data and its uploaded files. Irreversible.
   *
   * `confirm` is the literal word DELETE; the server rejects anything else.
   */
  deleteAccount(
    password: string,
  ): Promise<{ deleted: true; filesDeleted: number }> {
    return api.delete('/auth/me', { body: { password, confirm: 'DELETE' } });
  },
};
