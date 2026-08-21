'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Eye, EyeOff, Loader2, MailWarning } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authApi, type TwoFactorLoginRequired } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth, type AuthError } from '@/hooks/useAuth';
import { ThemeToggle } from '@/components/theme-toggle';
import { TwoFactorChallenge } from '@/components/two-factor-challenge';

/**
 * Sign in and sign up.
 *
 * One component for both because they differ by one field and one endpoint;
 * two near-identical files would drift.
 */
export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn, signUp, isAuthenticated } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Set when the API refuses the session because the address is unconfirmed.
   * A generic error would leave the user with nothing to act on; this swaps
   * the form for the one thing that helps.
   */
  const [unverified, setUnverified] = useState<string | null>(null);
  /**
   * Set when the password was right but the account carries a second factor.
   * No tokens came back with that response, so this is the rest of the
   * sign-in rather than a confirmation of it.
   */
  const [challenge, setChallenge] = useState<TwoFactorLoginRequired | null>(
    null,
  );

  const resend = useMutation({
    mutationFn: (address: string) => authApi.requestVerification(address),
  });


  const isSignUp = mode === 'sign-up';
  const mutation = isSignUp ? signUp : signIn;

  /**
   * The roles come from the server, not a copy in this file — the same list
   * the register endpoint validates against, so the form cannot offer
   * something that will be rejected.
   */
  const { data: roleList } = useQuery({
    queryKey: ['auth', 'roles'],
    queryFn: () => authApi.listRoles(),
    enabled: isSignUp,
    staleTime: Infinity,
  });


  // Where the guard wanted to go before it bounced here.
  const next = searchParams.get('next') || '/';

  useEffect(() => {
    if (isAuthenticated) router.replace(next);
  }, [isAuthenticated, next, router]);

  /**
   * Everything sign-up requires. Kept as a list so the button can be disabled
   * *and* the reason can be named — a greyed-out button with no explanation is
   * the worst version of a required field.
   */
  const missing = isSignUp
    ? [
        !email.trim() && 'an email address',
        password.length < 8 && 'a password of at least 8 characters',
        roles.length === 0 && 'at least one role',
        !acceptedTerms && 'the Terms and Privacy Policy',
      ].filter(Boolean as unknown as (v: unknown) => v is string)
    : [];
  const canSubmit = isSignUp
    ? missing.length === 0
    : !!email.trim() && password.length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);


    const payload = isSignUp
      ? {
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
          roles,
        }
      : { email: email.trim(), password };

    mutation.mutate(payload as never, {
      onSuccess: (result: unknown) => {
        // Signing in does not always end in a session: an account with
        // two-factor authentication gets a challenge here instead, and is
        // only signed in once the code clears.
        if (
          result &&
          typeof result === 'object' &&
          'twoFactorRequired' in result
        ) {
          setChallenge(result as TwoFactorLoginRequired);
          return;
        }
        router.replace(next);
      },
      onError: (err: Error) => {
        const authError = err as AuthError;
        if (authError.code === 'EMAIL_NOT_VERIFIED') {
          setUnverified(authError.email ?? email.trim());
          return;
        }
        setError(err.message);
      },
    });
  };

  // The password step is done and correct; the form has nothing left to ask.
  if (challenge) {
    return (
      <TwoFactorChallenge
        challengeToken={challenge.challengeToken}
        email={challenge.email}
        onSuccess={() => router.replace(next)}
        onCancel={() => {
          setChallenge(null);
          setPassword('');
          signIn.reset();
        }}
      />
    );
  }

  // Signing in is blocked until the address is confirmed, so the form is not
  // the useful thing to show — the resend is.
  if (unverified) {
    return (
      <div className="flex min-h-full flex-col">
        <div className="flex justify-end p-4">
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-16">
          <div className="w-full max-w-sm text-center">
            <MailWarning className="mx-auto size-10 text-warning" />
            <h1 className="mt-5 text-2xl font-bold tracking-tight">
              Confirm your email
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              We sent a link to <span className="font-semibold text-foreground">{unverified}</span>.
              Click it to finish setting up, then sign in.
            </p>

            <Card className="mt-6">
              <CardContent className="pt-6">
                {resend.isSuccess ? (
                  <p className="text-sm text-muted-foreground">
                    A new link is on its way. Check your spam folder too.
                  </p>
                ) : (
                  <Button
                    className="w-full"
                    disabled={resend.isPending}
                    onClick={() => resend.mutate(unverified)}
                  >
                    {resend.isPending && <Loader2 className="size-4 animate-spin" />}
                    Resend the link
                  </Button>
                )}
              </CardContent>
            </Card>

            <button
              onClick={() => {
                setUnverified(null);
                resend.reset();
              }}
              className="mt-6 text-sm font-semibold text-primary hover:underline"
            >
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

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
            <h1 className="mt-5 text-2xl font-bold tracking-tight">
              {isSignUp ? 'Create your account' : 'Welcome back'}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {isSignUp
                ? 'A private workspace for your shoots and your clients.'
                : 'Sign in to your Virgo workspace.'}
            </p>
          </div>

          <Card>
            <CardContent className="pt-6">
              <form onSubmit={submit} className="flex flex-col gap-4">
                {isSignUp && (
                  <div className="grid gap-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name"
                      autoComplete="name"
                    />
                  </div>
                )}

                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@studio.com"
                    autoComplete="email"
                    autoFocus
                  />
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {!isSignUp && (
                      <Link
                        href="/forgot-password"
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Forgot password?
                      </Link>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={isSignUp ? 'At least 8 characters' : 'Your password'}
                      autoComplete={isSignUp ? 'new-password' : 'current-password'}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      // Skipped by Tab: a convenience, not a step in the form.
                      tabIndex={-1}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                {isSignUp && (
                  <div className="grid gap-2">
                    <Label>
                      What do you do? <span className="text-destructive">*</span>{' '}
                      <span className="font-normal text-muted-foreground">
                        Pick every one that applies
                      </span>
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {(roleList?.data ?? []).map((role) => {
                        const on = roles.includes(role);
                        return (
                          <button
                            key={role}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              setRoles((prev) =>
                                prev.includes(role)
                                  ? prev.filter((r) => r !== role)
                                  : [...prev, role],
                              )
                            }
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                              on
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-card hover:bg-accent',
                            )}
                          >
                            {on && <Check className="size-3" />}
                            {role}
                          </button>
                        );
                      })}
                    </div>
                    <p
                      className={cn(
                        'text-xs',
                        roles.length === 0 ? 'text-destructive' : 'text-muted-foreground',
                      )}
                    >
                      {roles.length === 0
                        ? 'Required — choose at least one.'
                        : `${roles.length} selected`}
                    </p>
                  </div>
                )}

                {isSignUp && (
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3">
                    <Checkbox
                      checked={acceptedTerms}
                      onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                      className="mt-0.5"
                    />
                    <span className="text-xs leading-relaxed text-muted-foreground">
                      I have read and agree to the{' '}
                      {/* target=_blank so ticking the box is not lost to a
                          navigation away from a half-filled form. */}
                      <Link
                        href="/legal"
                        target="_blank"
                        className="font-semibold text-primary hover:underline"
                      >
                        Terms of Service
                      </Link>{' '}
                      and{' '}
                      <Link
                        href="/legal?tab=privacy"
                        target="_blank"
                        className="font-semibold text-primary hover:underline"
                      >
                        Privacy Policy
                      </Link>
                      . <span className="text-destructive">*</span>
                    </span>
                  </label>
                )}

                {error && (
                  <p
                    role="alert"
                    className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={mutation.isPending || !canSubmit}
                  className="mt-1"
                >
                  {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                  {isSignUp ? 'Create account' : 'Sign in'}
                </Button>

                {/* Says what is still missing rather than leaving a dead
                    button to be puzzled over. */}
                {isSignUp && missing.length > 0 && (
                  <p className="text-center text-xs text-muted-foreground">
                    Still needed: {missing.join(', ')}.
                  </p>
                )}
              </form>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {isSignUp ? 'Already have an account?' : 'New to Virgo?'}{' '}
            <Link
              href={isSignUp ? '/sign-in' : '/sign-up'}
              className="font-semibold text-primary hover:underline"
            >
              {isSignUp ? 'Sign in' : 'Create an account'}
            </Link>
          </p>

          <p className="mt-8 text-center text-xs leading-relaxed text-muted-foreground">
            By continuing you agree to Virgo&rsquo;s{' '}
            <Link href="/legal" className="text-primary hover:underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/legal?tab=privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
