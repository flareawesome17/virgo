import { generateKeyPairSync } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { AppleTokensService, appleKeyPem } from './apple-tokens.service';

/**
 * Ending the Apple sign-in of a deleted account: the client secret Apple's
 * token endpoints want, the code traded for a token, and that token revoked.
 * Never in the way of the delete itself.
 */

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();
/** Only the base64 between BEGIN and END, on one line. */
const BODY = PEM.split('\n')
  .filter((line) => line && !line.startsWith('-----'))
  .join('');

function serviceWith(env: Record<string, string | undefined>) {
  const config = { get: (name: string) => env[name] } as unknown as ConfigService;
  return new AppleTokensService(config);
}

const CONFIGURED = {
  APPLE_TEAM_ID: 'TEAM123456',
  APPLE_SIGNIN_KEY_ID: 'KEY1234567',
  APPLE_SIGNIN_KEY: BODY,
};

function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** The form a call to Apple carried. */
function formOf(call: unknown[]): Record<string, string> {
  const init = call[1] as { body: string };
  return Object.fromEntries(new URLSearchParams(init.body));
}

describe('appleKeyPem', () => {
  it('takes the .p8 file as it is', () => {
    expect(appleKeyPem(PEM)).toBe(PEM.trim() + '\n');
  });

  it('takes the file with its line breaks written as \\n, as an env file holds it', () => {
    expect(appleKeyPem(PEM.trim().split('\n').join('\\n'))).toBe(PEM.trim() + '\n');
  });

  it('takes only the base64 body, joined onto one line, and in quotes', () => {
    expect(appleKeyPem(`"${BODY}"`)).toBe(PEM.trim() + '\n');
  });
});

describe('AppleTokensService', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());

  it('signs a client secret Apple can check: ES256, its key id, made out to Apple, for the app', async () => {
    fetchMock
      .mockResolvedValueOnce(answer(200, { refresh_token: 'refresh-1', access_token: 'access-1' }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    await serviceWith(CONFIGURED).revokeWithCode('code-1', 'user-1');

    const secret = formOf(fetchMock.mock.calls[0]).client_secret;
    const decoded = jwt.verify(secret, PUBLIC_PEM, {
      algorithms: ['ES256'],
      audience: 'https://appleid.apple.com',
      issuer: 'TEAM123456',
      subject: 'com.virgo.app',
      complete: true,
    }) as jwt.Jwt;
    expect(decoded.header).toEqual(expect.objectContaining({ alg: 'ES256', kid: 'KEY1234567' }));
    const claims = decoded.payload as jwt.JwtPayload;
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBeLessThanOrEqual(300);
  });

  it('trades the code for a token and revokes the refresh token', async () => {
    fetchMock
      .mockResolvedValueOnce(answer(200, { refresh_token: 'refresh-1', access_token: 'access-1' }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await expect(serviceWith(CONFIGURED).revokeWithCode('code-1', 'user-1')).resolves.toBe('revoked');

    expect(fetchMock.mock.calls[0][0]).toBe('https://appleid.apple.com/auth/token');
    expect(formOf(fetchMock.mock.calls[0])).toEqual(
      expect.objectContaining({
        client_id: 'com.virgo.app',
        code: 'code-1',
        grant_type: 'authorization_code',
      }),
    );
    expect(fetchMock.mock.calls[1][0]).toBe('https://appleid.apple.com/auth/revoke');
    expect(formOf(fetchMock.mock.calls[1])).toEqual(
      expect.objectContaining({
        client_id: 'com.virgo.app',
        token: 'refresh-1',
        token_type_hint: 'refresh_token',
      }),
    );
  });

  it('revokes the access token when Apple gives no refresh token', async () => {
    fetchMock
      .mockResolvedValueOnce(answer(200, { access_token: 'access-1' }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(serviceWith(CONFIGURED).revokeWithCode('code-1', 'user-1')).resolves.toBe('revoked');
    expect(formOf(fetchMock.mock.calls[1])).toEqual(
      expect.objectContaining({ token: 'access-1', token_type_hint: 'access_token' }),
    );
  });

  it('does nothing without a key, and says so in the log', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn');
    await expect(
      serviceWith({ APPLE_TEAM_ID: 'TEAM123456' }).revokeWithCode('code-1', 'user-1'),
    ).resolves.toBe('not-configured');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no Sign in with Apple key'));
  });

  it('reports a spent code without throwing, and revokes nothing', async () => {
    const error = jest.spyOn(Logger.prototype, 'error');
    fetchMock.mockResolvedValueOnce(answer(400, { error: 'invalid_grant' }));
    await expect(serviceWith(CONFIGURED).revokeWithCode('code-1', 'user-1')).resolves.toBe('failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('400 invalid_grant'));
    // Neither the code nor any token is written to the log.
    expect(error).not.toHaveBeenCalledWith(expect.stringContaining('code-1'));
  });

  it('reports Apple being out of reach without throwing', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(serviceWith(CONFIGURED).revokeWithCode('code-1', 'user-1')).resolves.toBe('failed');
  });

  it('reports a key it cannot read without throwing', async () => {
    await expect(
      serviceWith({ ...CONFIGURED, APPLE_SIGNIN_KEY: 'not a key' }).revokeWithCode('code-1', 'user-1'),
    ).resolves.toBe('failed');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
