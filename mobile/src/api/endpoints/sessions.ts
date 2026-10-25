import { api } from '../client';
import type { ListResponse } from '../types';

/** Which Virgo app a session is. Null for one from before the API recorded it. */
export type SessionClient = 'ios' | 'android' | 'desktop' | 'web';

/**
 * One device signed in to your account.
 *
 * `device` and `app` are written by the server, in the same words the
 * new-sign-in email uses, so the device an email warned you about is the one
 * you find here.
 */
export interface DeviceSession {
  /** What signing it out takes. */
  id: string;
  /** "iPhone or iPad", "Windows", "Android phone". */
  device: string;
  /** "Virgo app", "Virgo desktop app", "Chrome, on the web". */
  app: string;
  client: SessionClient | null;
  signedInAt: string;
  lastActiveAt: string;
  /** The device you are holding. */
  current: boolean;
}

/** What a "This wasn't me" link in a sign-in email is about. */
export interface SignInAlert {
  device: string;
  app: string;
  signedInAt: string;
  /** Already ended, by this link or any other way. */
  signedOut: boolean;
}

/** Where you are signed in, and ending the sessions you do not recognise. */
export const sessionsApi = {
  /** This device first, then the rest by when they were last used. */
  list(): Promise<ListResponse<DeviceSession>> {
    return api.get('/auth/sessions');
  },

  /** Another device. This one signs out with Sign out. */
  signOut(id: string): Promise<void> {
    return api.delete<void>(`/auth/sessions/${encodeURIComponent(id)}`);
  },

  /** Every device but this one. */
  signOutOthers(): Promise<{ signedOut: number }> {
    return api.post('/auth/sessions/sign-out-others');
  },

  /** Needs no session: the link is opened from an email, often signed out. */
  lookupSignInAlert(token: string): Promise<SignInAlert> {
    return api.post('/auth/sign-in-alerts/lookup', { body: { token } });
  },

  /** Signs that device out and emails a link to choose a new password. */
  reportSignInAlert(token: string): Promise<SignInAlert> {
    return api.post('/auth/sign-in-alerts/report', { body: { token } });
  },
};
