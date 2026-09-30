import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { BillingService } from '../billing/billing.service';
import { MailConfig } from '../mail/mail.config';
import { MailService } from '../mail/mail.service';
import { accountDisabled, accountDeleted } from '../mail/mail.templates';
import { StorageService } from '../storage/storage.service';
import { UsersRepository, type PublicUser } from './users.repository';
import { toPublicUser } from './users.repository';

/** The longest pause on offer. */
export const MAX_DISABLE_DAYS = 365;

/**
 * Closing an account, temporarily or for good.
 *
 * Both actions require the current password. They are the two operations that
 * cannot be undone by signing in again, so a borrowed unlocked phone should
 * not be enough to perform either — an access token is proof of a session, not
 * of the person.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly storage: StorageService,
    private readonly mail: MailService,
    private readonly mailConfig: MailConfig,
    private readonly billing: BillingService,
  ) {}

  private async assertPassword(userId: string, password: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('Account not found');

    // 403, not 401: a 401 reads to the client as an expired session, which it
    // refreshes and resends — two of the throttle's five tries for one typo.
    if (!(await bcrypt.compare(password, user.password_hash))) {
      throw new ForbiddenException({
        message: 'That password is not correct',
        code: 'WRONG_PASSWORD',
        statusCode: 403,
      });
    }
    return user;
  }

  /**
   * Pauses the account for a number of days.
   *
   * Every session is revoked, so the pause takes effect on the device that
   * asked for it as well as everywhere else — a pause that leaves you signed
   * in on the phone in your hand has not really started.
   *
   * Nothing is deleted, hidden or unshared. The account is unreachable, and
   * comes back exactly as it was.
   */
  async disable(
    userId: string,
    password: string,
    days: number,
  ): Promise<{ disabledUntil: string }> {
    const user = await this.assertPassword(userId, password);

    if (!Number.isInteger(days) || days < 1 || days > MAX_DISABLE_DAYS) {
      throw new BadRequestException(
        `Choose between 1 and ${MAX_DISABLE_DAYS} days`,
      );
    }

    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await this.users.disable(userId, until);
    await this.users.revokeAllForUser(userId);

    // Best-effort, and sent to the address on file: if somebody else did this,
    // the email is how the owner finds out.
    void this.mail.send(
      user.email,
      accountDisabled({
        name: user.display_name ?? user.email.split('@')[0],
        until: until.toISOString().slice(0, 10),
        days,
        url: `${this.mailConfig.appUrl}/login`,
      }),
    );

    this.logger.log(`Account ${userId} paused until ${until.toISOString()}`);
    return { disabledUntil: until.toISOString() };
  }

  /**
   * Lifts a pause early.
   *
   * Reachable only with a valid session, which a paused account cannot get —
   * so in practice this is for someone who changed their mind before their
   * last access token expired. Signing in after that requires waiting out the
   * date, which is the point of choosing one.
   */
  async enable(userId: string): Promise<PublicUser> {
    const user = await this.users.enable(userId);
    if (!user) throw new NotFoundException('Account not found');
    return toPublicUser(user);
  }

  /**
   * Deletes the account and everything in it.
   *
   * Any auto-renewing plan is cancelled first, for the same reason files go
   * before the row: afterwards there is nothing left to do it from.
   *
   * Storage next, then the row. The order matters: the keys to the uploaded
   * objects are derived from data in Postgres, so deleting the row first would
   * strand every file in the bucket with nothing left pointing at it — paid
   * for, unreachable, and impossible to find again.
   *
   * A storage failure therefore aborts the delete rather than proceeding. Half
   * a deletion is worse than none: the user believes their photos are gone and
   * they are not.
   */
  async remove(
    userId: string,
    password: string,
  ): Promise<{ deleted: true; filesDeleted: number }> {
    const user = await this.assertPassword(userId, password);

    // Before anything is deleted: once the account is gone there is nothing
    // left to cancel a plan from, and PayMongo would keep charging the card.
    try {
      await this.billing.cancelBeforeDeletion(userId);
    } catch (err) {
      this.logger.error(`Delete aborted for ${userId}, plan not cancelled: ${String(err)}`);
      throw new BadRequestException(
        'Your paid plan could not be cancelled, so the account was left untouched. Try again in a few minutes.',
      );
    }

    let filesDeleted = 0;
    try {
      const wiped = await this.storage.wipeAll(userId);
      filesDeleted = wiped.deleted;
      if (wiped.failed > 0) {
        throw new Error(`${wiped.failed} object(s) could not be deleted`);
      }
    } catch (err) {
      this.logger.error(`Delete aborted for ${userId}: ${String(err)}`);
      throw new BadRequestException(
        'Your files could not be deleted, so the account was left untouched. Try again in a few minutes.',
      );
    }

    // The email goes out before the row disappears — afterwards there is no
    // address left to send it to.
    await this.mail.send(
      user.email,
      accountDeleted({ name: user.display_name ?? user.email.split('@')[0] }),
    );

    const removed = await this.users.remove(userId);
    if (!removed) throw new NotFoundException('Account not found');

    this.logger.log(`Account ${userId} deleted (${filesDeleted} file(s))`);
    return { deleted: true, filesDeleted };
  }
}
