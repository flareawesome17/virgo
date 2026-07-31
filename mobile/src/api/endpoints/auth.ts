import { api } from '../client';
import { clearTokens, getRefreshToken, setTokens } from '../tokens';
import type { AuthResult, AuthUser, UpdateProfileInput } from '../types';

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
export const authApi = {
  async register(
    credentials: Credentials & { displayName?: string },
  ): Promise<AuthResult> {
    const result = await api.post<AuthResult>('/auth/register', {
      body: credentials,
      anonymous: true,
    });
    await setTokens(result.accessToken, result.refreshToken);
    return result;
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
};
