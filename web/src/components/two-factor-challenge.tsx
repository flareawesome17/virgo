'use client';

import Image from 'next/image';
import { useState, type FormEvent } from 'react';
import { ArrowLeft, KeyRound, Loader2, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * The second half of a sign-in that came back as a challenge.
 *
 * `/auth/login` answers with either a session or `twoFactorRequired`, and no
 * tokens are issued until this step succeeds — so this is not an optional
 * extra screen. Without it a 2FA account can enter the right password on the
 * web and still never get in.
 *
 * The API takes the emailed six digits and a saved recovery code at the same
 * endpoint, in the same field. The toggle here is presentation: it sets the
 * keyboard, the placeholder and the validation, and sends the same string
 * either way.
 */
export function TwoFactorChallenge({
  challengeToken,
  email,
  onSuccess,
  onCancel,
}: {
  challengeToken: string;
  email?: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { completeTwoFactorSignIn, resendTwoFactorCode } = useAuth();

  const [code, setCode] = useState('');
  const [usingRecovery, setUsingRecovery] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const normalized = code.trim();
  // Recovery codes are base32 and printed with separators, so the length is
  // counted over the alphabet rather than the raw string.
  const canSubmit = usingRecovery
    ? normalized.replace(/[^A-Za-z2-7]/g, '').length >= 10
    : /^\d{6}$/.test(normalized);

  const clearMessages = () => {
    setError(null);
    setNotice(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || completeTwoFactorSignIn.isPending) return;
    clearMessages();
    completeTwoFactorSignIn.mutate(
      { challengeToken, code: normalized },
      {
        onSuccess,
        onError: (err: Error) =>
          setError(err.message || 'That code could not be verified.'),
      },
    );
  };

  const resend = () => {
    clearMessages();
    resendTwoFactorCode.mutate(challengeToken, {
      onSuccess: () => setNotice('A fresh code is on its way.'),
      onError: (err: Error) =>
        setError(err.message || 'That code could not be sent.'),
    });
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <Image
              src="/logo.png"
              alt="Virgo"
              width={72}
              height={72}
              className="mx-auto size-18 object-contain"
              priority
            />
            <div className="mx-auto mt-5 grid size-12 place-items-center rounded-2xl bg-primary/10">
              {usingRecovery ? (
                <KeyRound className="size-6 text-primary" />
              ) : (
                <Mail className="size-6 text-primary" />
              )}
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">
              {usingRecovery ? 'Use a recovery code' : 'Check your email'}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {usingRecovery ? (
                'Enter one of the single-use codes you saved when you turned on two-factor authentication.'
              ) : (
                <>
                  We sent a six-digit code
                  {email ? (
                    <>
                      {' '}
                      to <span className="font-semibold text-foreground">{email}</span>
                    </>
                  ) : (
                    ' to your account email'
                  )}
                  . It expires in ten minutes.
                </>
              )}
            </p>
          </div>

          <Card>
            <CardContent className="pt-6">
              <form onSubmit={submit} className="flex flex-col gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="code">
                    {usingRecovery ? 'Recovery code' : 'Verification code'}
                  </Label>
                  <Input
                    id="code"
                    value={code}
                    onChange={(e) => {
                      setCode(
                        usingRecovery
                          ? e.target.value.toUpperCase()
                          : e.target.value.replace(/\D/g, '').slice(0, 6),
                      );
                      clearMessages();
                    }}
                    placeholder={usingRecovery ? 'XXXX-XXXX-XXXX' : '000000'}
                    // Lets a browser or phone hand over the emailed code.
                    autoComplete="one-time-code"
                    inputMode={usingRecovery ? 'text' : 'numeric'}
                    autoCapitalize={usingRecovery ? 'characters' : 'none'}
                    autoCorrect="off"
                    spellCheck={false}
                    autoFocus
                    className={cn(
                      'font-semibold',
                      !usingRecovery && 'text-center text-xl tracking-[0.5em]',
                    )}
                  />
                </div>

                {error && (
                  <p
                    role="alert"
                    className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {error}
                  </p>
                )}

                {notice && (
                  <p className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
                    {notice}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={!canSubmit || completeTwoFactorSignIn.isPending}
                  className="mt-1"
                >
                  {completeTwoFactorSignIn.isPending && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  Continue
                </Button>

                <div className="flex flex-col items-center gap-2">
                  {!usingRecovery && (
                    <button
                      type="button"
                      onClick={resend}
                      disabled={resendTwoFactorCode.isPending}
                      className="text-sm font-semibold text-primary hover:underline disabled:opacity-60"
                    >
                      {resendTwoFactorCode.isPending
                        ? 'Sending…'
                        : 'Send a new code'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setUsingRecovery((value) => !value);
                      setCode('');
                      clearMessages();
                    }}
                    className="text-sm font-semibold text-primary hover:underline"
                  >
                    {usingRecovery
                      ? 'Use an email code instead'
                      : 'Use a recovery code'}
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>

          <button
            onClick={onCancel}
            className="mx-auto mt-6 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to sign in
          </button>
        </div>
      </div>
    </div>
  );
}
