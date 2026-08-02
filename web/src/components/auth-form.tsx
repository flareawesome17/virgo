'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { ThemeToggle } from '@/components/theme-toggle';

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
  const [error, setError] = useState<string | null>(null);

  const isSignUp = mode === 'sign-up';
  const mutation = isSignUp ? signUp : signIn;

  // Where the guard wanted to go before it bounced here.
  const next = searchParams.get('next') || '/';

  useEffect(() => {
    if (isAuthenticated) router.replace(next);
  }, [isAuthenticated, next, router]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const payload = isSignUp
      ? { email: email.trim(), password, displayName: displayName.trim() || undefined }
      : { email: email.trim(), password };

    mutation.mutate(payload as never, {
      onSuccess: () => router.replace(next),
      onError: (err: Error) => setError(err.message),
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
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isSignUp ? 'At least 8 characters' : 'Your password'}
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
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

                <Button type="submit" disabled={mutation.isPending} className="mt-1">
                  {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                  {isSignUp ? 'Create account' : 'Sign in'}
                </Button>
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
