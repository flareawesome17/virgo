import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { BillingService } from '../billing/billing.service';
import { MailConfig } from '../mail/mail.config';
import { MailService } from '../mail/mail.service';
import { accountDisabled, accountDeleted } from '../mail/mail.templates';
import { StorageService } from '../storage/storage.service';
import { SupportFilesService } from '../storage/support-files.service';
import { ReceiptFilesService } from '../storage/receipt-files.service';
import { ChatFilesService } from '../storage/chat-files.service';
import { UsersRepository, type PublicUser, type UserRow } from './users.repository';
import { toPublicUser } from './users.repository';
import { AppleIdentityService } from './apple-identity.service';
import { AppleTokensService } from './apple-tokens.service';

/** The longest pause on offer. */
export const MAX_DISABLE_DAYS = 365;

/** Apple asked again on the phone, for an account that signs in with Apple. */
export interface AppleConfirmation {
  identityToken: string;
  nonce: string;
  /** From the same sheet. Deleting uses it to end the Apple sign-in. */
  authorizationCode?: string;
}

/** How pausing or deleting proves it is the account holder. */
export interface ClosingProof {
  password?: string;
  /** In place of the password, which an account Apple made never had. */
  apple?: AppleConfirmation;
}

function refusal(code: string, message: string): ForbiddenException {
  return new ForbiddenException({ message, code, statusCode: 403 });
}

/**
 * Closing an account, temporarily or for good.
 *
 * Both actions require the current password. They are the two operations that
 * cannot be undone by signing in again, so a borrowed unlocked phone should
 * not be enough to perform either — an access token is proof of a session, not
 * of the person.
 *
 * An account that signs in with Apple may confirm with Apple instead: Face ID
 * or the passcode on Apple's sheet stands where the password would. An account
 * Apple made has a password nobody was ever told, so without this it could be
 * neither paused nor deleted, which Apple's review rules do not allow.
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
    private readonly supportFiles: SupportFilesService,
    private readonly receipts: ReceiptFilesService,
    private readonly chatFiles: ChatFilesService,
    private readonly apple: AppleIdentityService,
    private readonly appleTokens: AppleTokensService,
  ) {}

  /** The password, or Apple's confirmation; the account either way. */
  private assertProof(userId: string, proof: ClosingProof): Promise<UserRow> {
    return proof.apple
      ? this.assertApple(userId, proof.apple)
      : this.assertPassword(userId, proof.password ?? '');
  }

  /**
   * Apple vouches for the Apple ID on this account. Every refusal is a 403:
   * a 401 reads to the apps as an expired session, which they refresh and
   * resend with the same spent token.
   */
  private async assertApple(userId: string, confirmation: AppleConfirmation): Promise<UserRow> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('Account not found');
    if (!user.apple_sub) {
      throw refusal('NOT_APPLE', 'This account does not sign in with Apple. Enter its password instead.');
    }
    let sub: string;
    try {
      sub = (await this.apple.verify(confirmation.identityToken, confirmation.nonce)).sub;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw refusal('APPLE_REFUSED', 'Apple could not confirm it was you. Try again.');
      }
      throw error;
    }
    if (sub !== user.apple_sub) {
      throw refusal(
        'WRONG_APPLE_ID',
        'That Apple ID is not the one this account signs in with.',
      );
    }
    return user;
  }

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
    proof: ClosingProof,
    days: number,
  ): Promise<{ disabledUntil: string }> {
    const user = await this.assertProof(userId, proof);

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
        url: `${this.mailConfig.appUrl}/sign-in`,
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
    proof: ClosingProof,
  ): Promise<{ deleted: true; filesDeleted: number }> {
    const user = await this.assertProof(userId, proof);
    await this.endAppleSignIn(user, proof.apple?.authorizationCode);
    return this.erase(user);
  }

  /**
   * Revokes the Apple sign-in of an account about to be deleted, which Apple
   * requires. Before the erase, because the code from Apple's sheet is good
   * for five minutes and an erase of many files can take longer. Never in the
   * way of the delete: if it fails, it is logged and the account goes anyway.
   * And if the erase fails after a revoke, the account is still there and its
   * Apple ID only has to say yes to Virgo again at the next sign-in.
   *
   * Without a code (the password was used, or the console deleted it) there
   * is nothing to revoke with; the person can still remove Virgo under Sign in
   * with Apple in their Apple ID settings.
   */
  private async endAppleSignIn(user: UserRow, code: string | undefined): Promise<void> {
    if (!user.apple_sub) return;
    if (!code) {
      this.logger.warn(
        `Account ${user.id} signs in with Apple and was deleted without Apple's code, so its Apple sign-in was not revoked`,
      );
      return;
    }
    await this.appleTokens.revokeWithCode(code, user.id);
  }

  /**
   * The console's way in: an owner, who has typed the account's address back
   * to confirm, instead of the account's own password. The same steps in the
   * same order as above — plan, files, email, row — so a deletion from the
   * console is never a lesser one.
   */
  async removeByStaff(userId: string): Promise<{ deleted: true; filesDeleted: number }> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('Account not found');
    await this.endAppleSignIn(user, undefined);
    return this.erase(user);
  }

  private async erase(user: UserRow): Promise<{ deleted: true; filesDeleted: number }> {
    const userId = user.id;

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
      // What they attached to support requests too. The tickets stay, for
      // the record, the way a deleted account's posts leave replies behind;
      // the files are theirs and go with them.
      filesDeleted += await this.supportFiles.eraseFor(userId);
      // Receipts on their money entries. The entries go with the account's
      // row; the photos are objects with nothing else to find them by.
      filesDeleted += await this.receipts.eraseFor(userId);
      // Photos and files they sent in chats, which count toward their storage
      // and would otherwise outlive them: their messages go with the account
      // row, and these are objects nothing else can find.
      filesDeleted += await this.chatFiles.eraseFor(userId);
      // Their showcases' own copies, which have no file rows for the wipe
      // above to find. The posts themselves go with the account's row.
      const copies = await this.storage.deletePrefix(`users/${userId}/showcases/`);
      if (copies.failed > 0) {
        throw new Error(`${copies.failed} showcase copy object(s) could not be deleted`);
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
