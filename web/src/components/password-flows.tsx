'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Loader2, MailCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';
import { authApi, ApiError } from '@/api';

function message(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/** The shared frame: logo, heading, card. */
function AuthShell({
  heading,
  intro,
  children,
  footer,
}: {
  heading: string;
  intro: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
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
            <h1 className="mt-5 text-2xl font-bold tracking-tight">{heading}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{intro}</p>
          </div>
          <Card>
            <CardContent className="pt-6">{children}</CardContent>
          </Card>
          {footer}
        </div>
      </div>
    </div>
  );
}

/**
 * Asks for a reset link.
 *
 * The confirmation is deliberately the same whether or not the address has an
 * account — the API answers identically, and a UI that said "no such account"
 * would undo that.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const request = useMutation({
    mutationFn: (address: string) => authApi.forgotPassword(address),
    onSuccess: () => setSent(true),
  });

  if (sent) {
    return (
      <AuthShell
        heading="Check your inbox"
        intro="If that address has an account, a reset link is on its way."
        footer={
          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link href="/sign-in" className="font-semibold text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        }
      >
        <div className="py-2 text-center">
          <MailCheck className="mx-auto size-9 text-primary" />
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            The link lasts an hour and can be used once. If nothing arrives,
            check your spam folder, then try again.
          </p>
          <Button
            variant="outline"
            className="mt-5 w-full"
            onClick={() => setSent(false)}
          >
            Use a different address
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading="Reset your password"
      intro="We will email you a link to choose a new one."
      footer={
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/sign-in" className="font-semibold text-primary hover:underline">
            <ArrowLeft className="mr-1 inline size-3" />
            Back to sign in
          </Link>
        </p>
      }
    >
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          request.mutate(email.trim());
        }}
        className="flex flex-col gap-4"
      >
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@studio.com"
          />
        </div>

        {request.isError && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {message(request.error, 'Could not send the email. Please try again.')}
          </p>
        )}

        <Button type="submit" disabled={request.isPending || !email.trim()}>
          {request.isPending && <Loader2 className="size-4 animate-spin" />}
          Send reset link
        </Button>
      </form>
    </AuthShell>
  );
}

/** Consumes a reset link and sets the new password. */
export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = useMutation({
    mutationFn: () => authApi.resetPassword(token, password),
  });

  if (!token) {
    return (
      <AuthShell
        heading="Link is incomplete"
        intro="That link is missing its token."
        footer={
          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link href="/forgot-password" className="font-semibold text-primary hover:underline">
              Request a new link
            </Link>
          </p>
        }
      >
        <div className="py-2 text-center">
          <XCircle className="mx-auto size-9 text-destructive" />
          <p className="mt-4 text-sm text-muted-foreground">
            Copy the whole link out of the email, including everything after
            the question mark.
          </p>
        </div>
      </AuthShell>
    );
  }

  if (reset.isSuccess) {
    return (
      <AuthShell heading="Password changed" intro="You can sign in with it now.">
        <div className="py-2 text-center">
          <CheckCircle2 className="mx-auto size-9 text-success" />
          <p className="mt-4 text-sm text-muted-foreground">
            Every other device has been signed out.
          </p>
          <Button className="mt-5 w-full" onClick={() => router.replace('/sign-in')}>
            Sign in
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell heading="Choose a new password" intro="Make it one you have not used here before.">
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setError(null);
          if (password.length < 8) {
            setError('Use at least 8 characters.');
            return;
          }
          // Checked here rather than only on the server: retyping is the whole
          // point of the second field, and a round trip to learn they differ
          // is a slower way to say so.
          if (password !== confirm) {
            setError('Those two passwords do not match.');
            return;
          }
          reset.mutate();
        }}
        className="flex flex-col gap-4"
      >
        <div className="grid gap-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            required
            autoFocus
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Type it again"
          />
        </div>

        {(error || reset.isError) && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error ?? message(reset.error, 'Could not reset the password.')}
          </p>
        )}

        <Button type="submit" disabled={reset.isPending}>
          {reset.isPending && <Loader2 className="size-4 animate-spin" />}
          Set new password
        </Button>
      </form>
    </AuthShell>
  );
}

/** Consumes a verification link. Runs on load — the click was the consent. */
export function VerifyEmailView() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const verify = useMutation({ mutationFn: () => authApi.verifyEmail(token) });
  const { mutate } = verify;

  useEffect(() => {
    if (token) mutate();
  }, [token, mutate]);

  const heading = !token
    ? 'Link is incomplete'
    : verify.isPending
      ? 'Confirming…'
      : verify.isSuccess
        ? 'Email confirmed'
        : verify.isError
          ? 'That link did not work'
          : 'Confirming…';

  return (
    <AuthShell
      heading={heading}
      intro={
        verify.isSuccess
          ? 'Thanks — your address is verified.'
          : 'One moment while we check the link.'
      }
      footer={
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/" className="font-semibold text-primary hover:underline">
            Go to Virgo
          </Link>
        </p>
      }
    >
      <div className="py-2 text-center">
        {!token || verify.isError ? (
          <>
            <XCircle className="mx-auto size-9 text-destructive" />
            <p className="mt-4 text-sm text-muted-foreground">
              {!token
                ? 'That link is missing its token. Copy the whole thing out of the email.'
                : message(verify.error, 'The link may have expired or already been used.')}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Sign in and ask for a new link from Settings.
            </p>
          </>
        ) : verify.isSuccess ? (
          <>
            <CheckCircle2 className="mx-auto size-9 text-success" />
            <p className="mt-4 text-sm text-muted-foreground">
              Nothing else to do — carry on where you left off.
            </p>
          </>
        ) : (
          <Loader2 className="mx-auto size-9 animate-spin text-primary" />
        )}
      </div>
    </AuthShell>
  );
}
