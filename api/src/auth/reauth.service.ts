import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { TwoFactorService } from './two-factor.service';
import { UsersRepository } from './users.repository';

/** What a delete, or a change to how clients pay, carries to show the account holder is the one asking. */
export interface DeleteProof {
  /** The account password, when two-factor is off. */
  password?: string;
  /**
   * With two-factor on: the challenge from POST /auth/2fa/security-code
   * (action 'delete', or 'pay_details' for a way to pay)…
   */
  challengeToken?: string;
  /** …and the code that was emailed for it, or a recovery code. */
  code?: string;
}

/** What is being confirmed. Each asks the same two steps, in its own words. */
export type ReauthAction = 'delete' | 'pay_details';

const WORDING: Record<ReauthAction, { update: string; twoFactor: string; password: string }> = {
  delete: {
    update: 'Deleting now asks for your password. Update Virgo to the latest version, then try again.',
    twoFactor: 'Two-factor authentication is on, so deleting needs the code we email you.',
    password: 'Enter your password to delete this.',
  },
  pay_details: {
    update:
      'Changing how clients pay you now asks for your password. Update Virgo to the latest version, then try again.',
    twoFactor:
      'Two-factor authentication is on, so changing how clients pay you needs the code we email you.',
    password: 'Enter your password to change how clients pay you.',
  },
};

/**
 * Asks again who is there before something hard to undo.
 *
 * Changing how clients pay you asks for the password, or, with two-factor on,
 * a code sent to the account's email — the same two steps as turning
 * two-factor off, so a stolen password alone is not enough. A way to pay
 * decides where a client's money goes, and the harm there is a swap: someone
 * in the account putting their own QR code in place of the owner's.
 *
 * Deleting a workspace or an album asked the same from 2026-10-25, after one
 * went with a single tap from a session a stranger had signed in to. It no
 * longer does: both only go to Recently deleted, where a restore brings
 * everything back, and the owner chose a plain confirmation. The 'delete'
 * action stays because apps from before that still ask for its emailed code.
 *
 * Every refusal is a 403 with a `code`, never a 401: the session is fine, the
 * proof is not, and a 401 makes the clients refresh and send the same wrong
 * password again. Apps from before this send nothing at all, and are told to
 * update — their own error handling shows the message as it is.
 */
@Injectable()
export class ReauthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly twoFactor: TwoFactorService,
  ) {}

  async confirm(userId: string, proof: DeleteProof, action: ReauthAction): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    const words = WORDING[action];

    const { password, challengeToken, code } = proof;
    if (!password && !challengeToken && !code) {
      throw refusal('REAUTH_REQUIRED', words.update);
    }

    if (user.two_factor_enabled_at) {
      if (!challengeToken || !code) {
        throw refusal('TWO_FACTOR_REQUIRED', words.twoFactor);
      }
      await this.twoFactor.confirmAction(userId, challengeToken, code, action);
      return;
    }

    if (!password) {
      throw refusal('PASSWORD_REQUIRED', words.password);
    }
    if (!(await bcrypt.compare(password, user.password_hash))) {
      // The same answer as the other places that ask for it.
      throw refusal('WRONG_PASSWORD', 'That password is not correct.');
    }
  }
}

function refusal(code: string, message: string): ForbiddenException {
  return new ForbiddenException({ message, code, statusCode: 403 });
}
