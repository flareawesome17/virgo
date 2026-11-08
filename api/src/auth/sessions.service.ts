import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MailConfig } from '../mail/mail.config';
import { MailService } from '../mail/mail.service';
import { newSignIn } from '../mail/mail.templates';
import { AccountFlowsService } from './account-flows.service';
import { describeDevice, type SessionClient } from './device-label';
import { SessionsRepository, type SessionRow } from './sessions.repository';
import { UsersRepository, type UserRow } from './users.repository';

/** One signed-in device, as Settings → Devices shows it. */
export interface SessionView {
  /** The device: its refresh-token family. What signing it out takes. */
  id: string;
  device: string;
  app: string;
  client: SessionClient | null;
  signedInAt: string;
  lastActiveAt: string;
  /** The device asking. It signs itself out with Sign out, not from here. */
  current: boolean;
}

/** What a sign-in alert's link is about, before anyone presses anything. */
export interface SignInAlertView {
  device: string;
  app: string;
  signedInAt: string;
  /** Already ended, by this link or any other way. */
  signedOut: boolean;
}

/** What the request a session started with said about itself. */
export interface SignInContext {
  userAgent?: string;
  /** The request's Origin header, which tells the desktop app from a browser. */
  origin?: string;
  /** Cloudflare's CF-IPCountry: an ISO country code, or XX / T1. */
  country?: string;
  /** Cloudflare's CF-Connecting-IP. Written to the audit log only, never stored on a session. */
  ip?: string;
}

/** A week: long enough to read the email late, short enough to not linger. */
const ALERT_TTL_MS = 7 * 86_400_000;

/**
 * The account owner's view of where they are signed in, and the email that
 * tells them when that changes.
 */
@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly sessions: SessionsRepository,
    private readonly users: UsersRepository,
    private readonly accountFlows: AccountFlowsService,
    private readonly mail: MailService,
    private readonly mailConfig: MailConfig,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private view(row: SessionRow, currentId?: string): SessionView {
    return {
      id: row.family_id,
      ...describeDevice(row.user_agent, row.client),
      client: row.client,
      signedInAt: new Date(row.signed_in_at).toISOString(),
      lastActiveAt: new Date(row.last_active_at).toISOString(),
      current: !!currentId && row.family_id === currentId,
    };
  }

  /**
   * Every device signed in to the account, the one asking first.
   *
   * `currentId` is the session the access token names (JwtPayload.sid). A
   * token issued before tokens named one marks nothing current, for at most
   * the 15 minutes until it is refreshed.
   */
  async list(userId: string, currentId?: string) {
    const rows = await this.sessions.listLive(userId);
    const data = rows
      .map((row) => this.view(row, currentId))
      .sort((a, b) => Number(b.current) - Number(a.current));
    return { data, total: data.length };
  }

  /** Ends one other device's session. */
  async signOut(userId: string, sessionId: string, currentId?: string): Promise<void> {
    if (sessionId === currentId) {
      throw new BadRequestException(
        'That is the device you are using. Sign out from the menu instead.',
      );
    }
    const ended = await this.sessions.revoke(userId, sessionId);
    if (ended === 0) throw new NotFoundException('That device is already signed out');
  }

  /**
   * Ends every session but the asking one.
   *
   * Refused when the asking session is not known, rather than guessed at: a
   * guess that was wrong would sign the person out of the device they are
   * holding, or leave the one they meant to end.
   */
  async signOutOthers(userId: string, currentId?: string): Promise<{ signedOut: number }> {
    if (!currentId) {
      throw new ConflictException(
        'Virgo is still catching up with this device. Try again in a minute.',
      );
    }
    return { signedOut: await this.sessions.revokeAllExcept(userId, currentId) };
  }

  /**
   * Emails the owner about a device that has just signed in.
   *
   * Only for a sign-in with a password, never for a refresh or the fresh pair
   * a password change hands its own device. Not for the account's first
   * session either: right after signing up there is nobody else to warn
   * about, and the first thing a new account would get is a scare.
   *
   * Never throws. A sign-in that worked is not turned into a failure because
   * the email could not be sent, and the caller does not wait on it.
   */
  async alertNewSignIn(user: UserRow, familyId: string, context: SignInContext): Promise<void> {
    try {
      if (!(await this.sessions.hasOtherSessions(user.id, familyId))) return;

      const session = await this.sessions.findSession(user.id, familyId);
      const label = describeDevice(session?.user_agent ?? context.userAgent, session?.client);

      const token = randomBytes(32).toString('base64url');
      await this.sessions.createAlert(
        user.id,
        familyId,
        this.hash(token),
        new Date(Date.now() + ALERT_TTL_MS),
      );

      const base = this.mailConfig.appUrl;
      await this.mail.send(
        user.email,
        newSignIn({
          ...label,
          when: manilaTime(session?.signed_in_at ?? new Date()),
          country: countryName(context.country),
          notMeUrl: `${base}/not-me?token=${encodeURIComponent(token)}`,
          devicesUrl: `${base}/settings/devices`,
          twoFactorOn: !!user.two_factor_enabled_at,
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Could not send a sign-in alert: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async alertFor(token: string) {
    const alert = token ? await this.sessions.findAlert(this.hash(token)) : null;
    if (!alert) {
      throw new BadRequestException(
        'That link has expired. Open Settings → Devices to see where you are signed in.',
      );
    }
    return alert;
  }

  /** What the link is about, for its page to ask before doing anything. */
  async lookupAlert(token: string): Promise<SignInAlertView> {
    const alert = await this.alertFor(token);
    const session = await this.sessions.findSession(alert.user_id, alert.family_id);
    const live = await this.sessions.isLive(alert.user_id, alert.family_id);
    return {
      ...describeDevice(session?.user_agent, session?.client),
      signedInAt: new Date(session?.signed_in_at ?? alert.created_at).toISOString(),
      signedOut: !!alert.used_at || !live,
    };
  }

  /**
   * "This wasn't me": ends that device's session and emails a reset link.
   *
   * The link proves only that its holder can read the account's email, so it
   * does no more than that holder could do anyway: sign one device out and
   * ask for a reset. The reset is what locks the stranger out for good —
   * choosing a password ends every session — since they know the old one.
   *
   * A second press does nothing more, so a mail scanner that follows the
   * page's request, or an impatient double click, sends one reset, not two.
   */
  async reportAlert(token: string): Promise<SignInAlertView> {
    const alert = await this.alertFor(token);
    if (await this.sessions.useAlert(alert.id)) {
      await this.sessions.revoke(alert.user_id, alert.family_id);
      const user = await this.users.findById(alert.user_id);
      if (user) await this.accountFlows.requestPasswordReset(user.email);
    }
    const session = await this.sessions.findSession(alert.user_id, alert.family_id);
    return {
      ...describeDevice(session?.user_agent, session?.client),
      signedInAt: new Date(session?.signed_in_at ?? alert.created_at).toISOString(),
      signedOut: true,
    };
  }
}

/** "October 25, 2026 at 9:23 AM, Philippine time" — when the owner would read it. */
export function manilaTime(at: Date): string {
  const formatted = new Date(at).toLocaleString('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  });
  return `${formatted}, Philippine time`;
}

/**
 * A country's name from Cloudflare's code, or null.
 *
 * Read from the request and written into the email only — never stored, like
 * the IP address it comes from (see the privacy policy). XX is Cloudflare's
 * "unknown"; T1 is Tor.
 */
export function countryName(code: string | null | undefined): string | null {
  const value = (code ?? '').trim().toUpperCase();
  if (value === 'T1') return 'the Tor network';
  if (!/^[A-Z]{2}$/.test(value) || value === 'XX') return null;
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(value) ?? null;
  } catch {
    return null;
  }
}
