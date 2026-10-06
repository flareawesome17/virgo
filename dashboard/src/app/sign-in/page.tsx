'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, ShieldCheck, Smartphone } from 'lucide-react';
import { completeSignIn, signIn } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Console sign-in: a password, then — for an account with two-factor — a code.
 *
 * Deliberately says almost nothing. No product marketing and no "create an
 * account": console accounts are created by an owner from inside. A forgotten
 * password is reset by email; a lost phone is a recovery code, or another
 * owner resetting two-factor from the console.
 */
export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Replace, not push: the back button should not return to a login form that
  // would immediately bounce forward again.
  const enter = () => router.replace('/');

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await signIn(email.trim(), password);
      if (result.challenge) {
        setChallenge(result.challenge);
        setBusy(false);
      } else {
        enter();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in');
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      await completeSignIn(challenge, code.trim());
      enter();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not sign in';
      // The challenge lasts five minutes. Past that, the only way on is to
      // start again, so the form goes back rather than refusing every code.
      if (/took too long|Start the sign-in again/.test(message)) {
        setChallenge(null);
        setCode('');
      }
      setError(message);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
            {challenge ? <Smartphone className="size-5" /> : <ShieldCheck className="size-5" />}
          </span>
          <h1 className="text-xl font-bold tracking-tight">
            {challenge ? 'Two-factor sign-in' : 'Virgo Console'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {challenge
              ? recovery
                ? 'Enter one of the recovery codes you saved when you set this up.'
                : 'Enter the six-digit code from your authenticator app.'
              : 'Management access. Not the Virgo app.'}
          </p>
        </div>

        {challenge ? (
          <form onSubmit={submitCode} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">{recovery ? 'Recovery code' : 'Code'}</Label>
              <Input
                id="code"
                autoFocus
                required
                inputMode={recovery ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={recovery ? 'abcde-fghjk' : '123 456'}
                className="text-center font-mono text-lg tracking-[0.2em]"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={busy || !code.trim()}>
              {busy ? 'Checking…' : 'Sign in'}
            </Button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => {
                  setChallenge(null);
                  setCode('');
                  setError(null);
                  setRecovery(false);
                }}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" />
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  setRecovery((v) => !v);
                  setCode('');
                  setError(null);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                {recovery ? 'Use the app instead' : 'Lost your phone?'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={submitPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <p
                // Announced, because a failed sign-in that only changes colour
                // is invisible to a screen reader.
                role="alert"
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>

            <Link
              href="/forgot-password"
              className="block text-center text-sm text-muted-foreground hover:text-foreground"
            >
              Forgot your password?
            </Link>
          </form>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          {challenge
            ? 'No phone and no codes? Another owner can reset your two-factor.'
            : 'Console accounts are created by an owner. There is no sign-up.'}
        </p>
      </div>
    </main>
  );
}
