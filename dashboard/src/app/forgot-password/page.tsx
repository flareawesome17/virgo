'use client';

import Link from 'next/link';
import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { API_BASE_URL } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Ask for a reset link.
 *
 * The success message is the same whether or not the address has an account,
 * matching what the server does — a form that says "no such account" is a
 * directory of who holds console access.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  // Rendered from the server's own wording, including how long the link
  // lasts. A copy here would be wrong the first time that changes.
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    // Deliberately no error branch: a failure here and a success look the
    // same to the person asking, and the server has already logged the real
    // outcome. Showing a network error would only tell somebody probing
    // addresses that they hit a live one.
    const body = await fetch(`${API_BASE_URL}/admin/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    })
      .then((r) => r.json() as Promise<{ message?: string }>)
      .catch(() => null);
    setMessage(body?.message ?? null);
    setSent(true);
    setBusy(false);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="mb-4 grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
            <KeyRound className="size-5" />
          </span>
          <h1 className="text-xl font-bold tracking-tight">Reset your password</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            We will email a link that works once.
          </p>
        </div>

        {sent ? (
          <div className="rounded-lg border p-5 text-center">
            <p className="text-sm font-medium">Check your email</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {message ??
                'If that address has a console account, a reset link is on its way.'}
            </p>
            <Link
              href="/sign-in"
              className="mt-4 inline-block text-sm text-primary underline underline-offset-4"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Console email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Sending…' : 'Send reset link'}
            </Button>
            <Link
              href="/sign-in"
              className="block text-center text-sm text-muted-foreground hover:text-foreground"
            >
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}
