'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { API_BASE_URL } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Redeem a reset link.
 *
 * `useSearchParams` needs a Suspense boundary in the app router, or the whole
 * route opts into dynamic rendering — so the form is split out and wrapped.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const ready = token && next.length >= 12 && next === confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const m = body?.message;
        throw new Error(
          (Array.isArray(m) ? m[0] : m) ?? 'That did not work',
        );
      }
      router.replace('/sign-in');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work');
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="mb-4 grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
            <KeyRound className="size-5" />
          </span>
          <h1 className="text-xl font-bold tracking-tight">Choose a password</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            For your Virgo Console account.
          </p>
        </div>

        {!token ? (
          <div className="rounded-lg border p-5 text-center">
            <p className="text-sm font-medium">This link is incomplete</p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Open the link from the email exactly as it was sent, or ask for a
              new one.
            </p>
            <Link
              href="/forgot-password"
              className="mt-4 inline-block text-sm text-primary underline underline-offset-4"
            >
              Send a new link
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="next">New password</Label>
              <Input
                id="next"
                type="password"
                autoComplete="new-password"
                required
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                At least 12 characters.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              {mismatch && (
                <p className="text-xs text-destructive">These do not match.</p>
              )}
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}{' '}
                <Link href="/forgot-password" className="underline">
                  Send a new link
                </Link>
              </p>
            )}

            <Button type="submit" className="w-full" disabled={busy || !ready}>
              {busy ? 'Saving…' : 'Set password'}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Every session signed in as this account will be ended.
        </p>
      </div>
    </main>
  );
}
