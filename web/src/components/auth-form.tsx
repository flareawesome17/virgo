'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authApi } from '@/api';
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
  const [roles, setRoles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);


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

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (isSignUp && roles.length === 0) {
      setError('Choose at least one role so collaborators know what you do.');
      return;
    }

    const payload = isSignUp
      ? {
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
          roles,
        }
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

                {isSignUp && (
                  <div className="grid gap-2">
                    <Label>
                      What do you do?{' '}
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
                  </div>
                )}

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
