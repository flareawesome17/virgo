import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { TwoFactorService } from './two-factor.service';
import { UsersRepository } from './users.repository';

/** What a delete carries to show the account holder is the one asking. */
export interface DeleteProof {
  /** The account password, when two-factor is off. */
  password?: string;
  /** With two-factor on: the challenge from POST /auth/2fa/security-code (action 'delete')… */
  challengeToken?: string;
  /** …and the code that was emailed for it, or a recovery code. */
  code?: string;
}

/**
 * Asks again who is there before something hard to undo.
 *
 * On 2026-10-25 a workspace was deleted by someone who had signed in with the
 * owner's password, with one tap on a confirmation. A session proves only
 * that somebody signed in once; deleting a workspace or an album now asks for
 * the password, or, with two-factor on, a code sent to the account's email —
 * the same two steps as turning two-factor off, so a stolen password alone is
 * not enough there either.
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

  async confirmDelete(userId: string, proof: DeleteProof = {}): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();

    const { password, challengeToken, code } = proof;
    if (!password && !challengeToken && !code) {
      throw refusal(
        'REAUTH_REQUIRED',
        'Deleting now asks for your password. Update Virgo to the latest version, then try again.',
      );
    }

    if (user.two_factor_enabled_at) {
      if (!challengeToken || !code) {
        throw refusal(
          'TWO_FACTOR_REQUIRED',
          'Two-factor authentication is on, so deleting needs the code we email you.',
        );
      }
      await this.twoFactor.confirmDelete(userId, challengeToken, code);
      return;
    }

    if (!password) {
      throw refusal('PASSWORD_REQUIRED', 'Enter your password to delete this.');
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
