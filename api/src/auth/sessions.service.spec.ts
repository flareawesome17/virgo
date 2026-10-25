import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { MailConfig } from '../mail/mail.config';
import type { MailService } from '../mail/mail.service';
import type { RenderedEmail } from '../mail/mail.templates';
import type { AccountFlowsService } from './account-flows.service';
import type { SessionRow, SessionsRepository, SignInAlertRow } from './sessions.repository';
import { countryName, manilaTime, SessionsService } from './sessions.service';
import type { UserRow, UsersRepository } from './users.repository';

/**
 * The owner's side of where they are signed in: the list, signing a device
 * out, and the email — with its one button — when a new device signs in.
 */

const USER = { id: 'user-1', email: 'mika@example.com', two_factor_enabled_at: null } as UserRow;

const IPHONE: SessionRow = {
  family_id: 'family-phone',
  signed_in_at: new Date('2026-10-25T01:23:37Z'),
  last_active_at: new Date('2026-10-25T01:23:37Z'),
  user_agent: 'Virgo/9 CFNetwork/3896.100.1.2.1 Darwin/27.0.0',
  client: 'ios',
};

const DESKTOP: SessionRow = {
  family_id: 'family-desktop',
  signed_in_at: new Date('2026-10-22T06:44:05Z'),
  last_active_at: new Date('2026-10-25T03:58:16Z'),
  user_agent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/155 Edg/155',
  client: 'desktop',
};

const ALERT: SignInAlertRow = {
  id: 'alert-1',
  user_id: 'user-1',
  family_id: 'family-phone',
  created_at: new Date('2026-10-25T01:23:38Z'),
  used_at: null,
};

function setup() {
  const sessions = {
    listLive: jest.fn(async () => [DESKTOP, IPHONE]),
    hasOtherSessions: jest.fn(async () => true),
    revoke: jest.fn(async () => 1),
    revokeAllExcept: jest.fn(async () => 2),
    findSession: jest.fn(async () => IPHONE as SessionRow | null),
    isLive: jest.fn(async () => true),
    createAlert: jest.fn(async () => undefined),
    findAlert: jest.fn(async () => ALERT as SignInAlertRow | null),
    useAlert: jest.fn(async () => true),
  };
  const users = { findById: jest.fn(async () => USER) };
  const accountFlows = { requestPasswordReset: jest.fn(async () => undefined) };
  const mail = { send: jest.fn(async (_to: string, _email: RenderedEmail) => true) };
  const mailConfig = { appUrl: 'https://web.virgo.ph' };

  const service = new SessionsService(
    sessions as unknown as SessionsRepository,
    users as unknown as UsersRepository,
    accountFlows as unknown as AccountFlowsService,
    mail as unknown as MailService,
    mailConfig as unknown as MailConfig,
  );
  return { service, sessions, users, accountFlows, mail };
}

describe('SessionsService.list', () => {
  it('names each device and puts the one asking first', async () => {
    const { service } = setup();
    const { data, total } = await service.list('user-1', 'family-phone');
    expect(total).toBe(2);
    expect(data[0]).toMatchObject({
      id: 'family-phone',
      device: 'iPhone or iPad',
      app: 'Virgo app',
      current: true,
    });
    expect(data[1]).toMatchObject({
      id: 'family-desktop',
      device: 'Windows',
      app: 'Virgo desktop app',
      current: false,
      lastActiveAt: '2026-10-25T03:58:16.000Z',
    });
  });

  it('marks nothing current for a token that does not name its session', async () => {
    const { service } = setup();
    const { data } = await service.list('user-1', undefined);
    expect(data.every((s) => !s.current)).toBe(true);
  });
});

describe('SessionsService signing devices out', () => {
  it('signs out another device', async () => {
    const { service, sessions } = setup();
    await service.signOut('user-1', 'family-phone', 'family-desktop');
    expect(sessions.revoke).toHaveBeenCalledWith('user-1', 'family-phone');
  });

  it('will not sign out the device asking, which has a Sign out of its own', async () => {
    const { service, sessions } = setup();
    await expect(service.signOut('user-1', 'family-desktop', 'family-desktop')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(sessions.revoke).not.toHaveBeenCalled();
  });

  it('says so when the device was already gone', async () => {
    const { service, sessions } = setup();
    sessions.revoke.mockResolvedValueOnce(0);
    await expect(service.signOut('user-1', 'family-phone', 'family-desktop')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('signs out everything but this device', async () => {
    const { service, sessions } = setup();
    await expect(service.signOutOthers('user-1', 'family-desktop')).resolves.toEqual({ signedOut: 2 });
    expect(sessions.revokeAllExcept).toHaveBeenCalledWith('user-1', 'family-desktop');
  });

  it('refuses to guess which device is asking', async () => {
    const { service, sessions } = setup();
    await expect(service.signOutOthers('user-1', undefined)).rejects.toBeInstanceOf(ConflictException);
    expect(sessions.revokeAllExcept).not.toHaveBeenCalled();
  });
});

describe('SessionsService.alertNewSignIn', () => {
  it('emails the owner what signed in, when, from where, and a way to end it', async () => {
    const { service, sessions, mail } = setup();
    await service.alertNewSignIn(USER, 'family-phone', { country: 'US' });

    expect(sessions.createAlert).toHaveBeenCalledWith(
      'user-1',
      'family-phone',
      expect.stringMatching(/^[0-9a-f]{64}$/),
      expect.any(Date),
    );
    const [to, email] = mail.send.mock.calls[0];
    expect(to).toBe('mika@example.com');
    expect(email.subject).toBe('New sign-in to your Virgo account on iPhone or iPad');
    expect(email.text).toContain('Virgo app · iPhone or iPad');
    expect(email.text).toContain('October 25, 2026 at 9:23 AM, Philippine time');
    expect(email.text).toContain('From United States');
    expect(email.text).toMatch(/https:\/\/web\.virgo\.ph\/not-me\?token=[\w-]{20,}/);
    expect(email.text).toContain('https://web.virgo.ph/settings/devices');
    // Two-factor is off, so the email says to turn it on.
    expect(email.text).toContain('Turn on two-factor authentication');
  });

  it('keeps the link secret out of the database', async () => {
    const { service, sessions, mail } = setup();
    await service.alertNewSignIn(USER, 'family-phone', {});
    const stored = (sessions.createAlert.mock.calls[0] as unknown as [string, string, string])[2];
    const token = /token=([\w-]+)/.exec(mail.send.mock.calls[0][1].text)?.[1];
    expect(token).toBeTruthy();
    expect(stored).not.toContain(token);
  });

  it('says nothing about an account’s first ever sign-in', async () => {
    const { service, sessions, mail } = setup();
    sessions.hasOtherSessions.mockResolvedValueOnce(false);
    await service.alertNewSignIn(USER, 'family-phone', {});
    expect(sessions.createAlert).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('never fails the sign-in it is about', async () => {
    const { service, mail } = setup();
    mail.send.mockRejectedValueOnce(new Error('SMTP down'));
    await expect(service.alertNewSignIn(USER, 'family-phone', {})).resolves.toBeUndefined();
  });
});

describe('SessionsService and the "This wasn\'t me" link', () => {
  it('shows what the link is about without changing anything', async () => {
    const { service, sessions, accountFlows } = setup();
    await expect(service.lookupAlert('token')).resolves.toEqual({
      device: 'iPhone or iPad',
      app: 'Virgo app',
      signedInAt: '2026-10-25T01:23:37.000Z',
      signedOut: false,
    });
    expect(sessions.revoke).not.toHaveBeenCalled();
    expect(accountFlows.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('signs that device out and sends a reset link', async () => {
    const { service, sessions, accountFlows } = setup();
    await expect(service.reportAlert('token')).resolves.toMatchObject({ signedOut: true });
    expect(sessions.revoke).toHaveBeenCalledWith('user-1', 'family-phone');
    expect(accountFlows.requestPasswordReset).toHaveBeenCalledWith('mika@example.com');
  });

  it('does it once, however many times the button is pressed', async () => {
    const { service, sessions, accountFlows } = setup();
    sessions.useAlert.mockResolvedValueOnce(false);
    await expect(service.reportAlert('token')).resolves.toMatchObject({ signedOut: true });
    expect(sessions.revoke).not.toHaveBeenCalled();
    expect(accountFlows.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('refuses a link that has expired or never existed', async () => {
    const { service, sessions } = setup();
    sessions.findAlert.mockResolvedValueOnce(null);
    await expect(service.reportAlert('token')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.lookupAlert('')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('the alert’s words', () => {
  it('gives the time in the Philippines', () => {
    expect(manilaTime(new Date('2026-10-25T01:25:57Z'))).toBe(
      'October 25, 2026 at 9:25 AM, Philippine time',
    );
  });

  it('names a country from Cloudflare’s code, and nothing it does not know', () => {
    expect(countryName('US')).toBe('United States');
    expect(countryName('ph')).toBe('Philippines');
    expect(countryName('T1')).toBe('the Tor network');
    expect(countryName('XX')).toBeNull();
    expect(countryName(undefined)).toBeNull();
    expect(countryName('<script>')).toBeNull();
  });
});
