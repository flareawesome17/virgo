import { useCallback, useState } from 'react';
import { ApiError, authApi, type DeleteProof } from '@/api';
import { useAuth } from '@/hooks/useAuth';

/** Which question a delete is asking. */
export type DeleteProofStep = 'password' | 'code';

/** The `code` on a refusal from the API, if it has one. */
function refusalCode(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const code = (err.body as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : null;
}

function messageOf(err: unknown): string {
  if (err instanceof ApiError && err.status === 429) {
    return 'Too many tries. Wait a minute, then try again.';
  }
  return err instanceof Error && err.message ? err.message : 'Please try again.';
}

/**
 * The questions a workspace or album delete asks before it goes.
 *
 * On 2026-10-25 a workspace was deleted with one tap by someone else who had
 * signed in with the owner's password. Deleting now asks for the password,
 * and with two-factor on, it then asks for the code emailed to the account —
 * the same two steps as turning two-factor off, so the password alone is not
 * enough there.
 *
 * Both apps' delete dialogs draw their fields from this and call `submit`
 * with the delete itself; the steps and what each server refusal means for
 * the form live here once.
 */
export function useDeleteProof() {
  const { profile } = useAuth();
  const twoFactor = !!profile?.twoFactorEnabled;

  const [step, setStep] = useState<DeleteProofStep>('password');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<{ token: string; email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Back to an empty password field, for the next time the dialog opens. */
  const reset = useCallback(() => {
    setStep('password');
    setPassword('');
    setCode('');
    setChallenge(null);
    setError(null);
    setNotice(null);
    setBusy(false);
  }, []);

  const askForCode = async () => {
    const started = await authApi.beginTwoFactorSecurityAction(password, 'delete');
    setChallenge({ token: started.challengeToken, email: started.email });
    setCode('');
    setStep('code');
    setNotice(`We emailed a code to ${started.email}.`);
  };

  /**
   * Takes the form one step on, and runs `perform` — the delete — once it has
   * what the server asks for. True when the delete went through.
   */
  const submit = async (perform: (proof: DeleteProof) => Promise<unknown>): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      if (step === 'password') {
        if (!password) {
          setError('Enter your password.');
          return false;
        }
        if (twoFactor) {
          await askForCode();
          return false;
        }
        await perform({ password });
        return true;
      }
      if (!challenge || !code.trim()) {
        setError('Enter the code from the email.');
        return false;
      }
      await perform({ challengeToken: challenge.token, code: code.trim() });
      return true;
    } catch (err) {
      const refusal = refusalCode(err);
      // Two-factor was turned on, or off, on another device since this one
      // last read the account. Ask what the server asks for instead.
      if (refusal === 'TWO_FACTOR_REQUIRED' && step === 'password') {
        try {
          await askForCode();
        } catch (inner) {
          setError(messageOf(inner));
        }
        return false;
      }
      if (refusal === 'PASSWORD_REQUIRED' || refusal === 'CODE_EXPIRED') {
        setStep('password');
        setChallenge(null);
        setNotice(null);
        setError(
          refusal === 'CODE_EXPIRED'
            ? 'That code expired. Enter your password to get a new one.'
            : 'Enter your password to delete this.',
        );
        return false;
      }
      setError(messageOf(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** Sends the code again, for an email that never arrived. */
  const resend = async () => {
    if (!challenge) return;
    setError(null);
    try {
      await authApi.resendTwoFactorCode(challenge.token);
      setNotice(`We sent a new code to ${challenge.email}.`);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return {
    step,
    /** Whether a code will be asked for after the password. */
    twoFactor,
    password,
    setPassword,
    code,
    setCode,
    error,
    notice,
    busy,
    submit,
    resend,
    reset,
  };
}

export type DeleteProofForm = ReturnType<typeof useDeleteProof>;
