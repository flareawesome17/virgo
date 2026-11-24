import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import type { AppleConfirmation } from '@/src/api';

/**
 * Sign in with Apple, the phone's half.
 *
 * Apple shows its own sheet, the person confirms with Face ID or a passcode,
 * and Apple hands back a signed token. The server proves that token; nothing
 * here is trusted. See api/src/auth/apple-identity.service.ts.
 */

/** What the server needs to prove a sign-in. */
export interface AppleProof {
  identityToken: string;
  /** The one-time value in the clear. Apple was given only its SHA-256. */
  nonce: string;
  /** Apple passes a name on the first sign-in only, and never again. */
  displayName?: string;
}

/** iPhone only for now. Android and the web would need Apple's web flow and a key. */
export async function appleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Asks Apple who this is. Null when the person closed Apple's sheet, which is
 * a change of mind and not an error.
 *
 * The nonce ties the token to this one attempt: a made-up value, hashed for
 * Apple, sent in the clear to the server, which hashes it again and compares.
 * A token lifted from some other sign-in does not answer it.
 */
export async function askApple(): Promise<AppleProof | null> {
  const asked = await sheet([
    AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
    AppleAuthentication.AppleAuthenticationScope.EMAIL,
  ]);
  if (!asked) return null;
  const { credential, nonce } = asked;
  if (!credential.identityToken) {
    throw new Error('Apple did not finish that sign-in. Try again.');
  }
  const name = [credential.fullName?.givenName, credential.fullName?.familyName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  return { identityToken: credential.identityToken, nonce, ...(name ? { displayName: name } : {}) };
}

/**
 * Asks Apple to confirm it is the person on this account, before pausing or
 * deleting it. Null when they closed Apple's sheet.
 *
 * An account Apple made has a password nobody was ever told, so Apple's sheet
 * stands where the password would. No name or email is asked for: the server
 * only compares who Apple says this is with the Apple ID on the account. The
 * one-time code from the same sheet is what lets the server end the Apple
 * sign-in when the account is deleted, which Apple requires.
 */
export async function confirmWithApple(): Promise<AppleConfirmation | null> {
  const asked = await sheet([]);
  if (!asked) return null;
  const { credential, nonce } = asked;
  if (!credential.identityToken) {
    throw new Error('Apple did not finish confirming. Try again.');
  }
  return {
    identityToken: credential.identityToken,
    nonce,
    ...(credential.authorizationCode ? { authorizationCode: credential.authorizationCode } : {}),
  };
}

/**
 * Apple's sheet, tied to a fresh one-time value. Null when it was closed,
 * which is a change of mind and not an error.
 */
async function sheet(
  requestedScopes: AppleAuthentication.AppleAuthenticationScope[],
): Promise<{ credential: AppleAuthentication.AppleAuthenticationCredential; nonce: string } | null> {
  const nonce = `${Crypto.randomUUID()}${Crypto.randomUUID()}`;
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  try {
    const credential = await AppleAuthentication.signInAsync({ requestedScopes, nonce: hashed });
    return { credential, nonce };
  } catch (error) {
    if ((error as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return null;
    throw error;
  }
}

/*
 * An account Apple has just made still owes what every sign-up is asked:
 * what they do and where they work. This remembers that, for as long as the
 * app stays open, so the signed-in layout can send them to the "Almost there"
 * steps. Not kept on disk: if the app is closed halfway, the roles prompt
 * every account without roles already gets takes over.
 */
let finishing = false;
const listeners = new Set<() => void>();

export function setAppleFinishing(value: boolean) {
  if (finishing === value) return;
  finishing = value;
  listeners.forEach((listener) => listener());
}

export function useAppleFinishing(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => finishing,
    () => false,
  );
}
