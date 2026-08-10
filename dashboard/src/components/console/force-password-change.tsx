'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { api, signOut } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Blocks the console until a seeded password is replaced.
 *
 * The first owner is created by the server with a password it generated and
 * printed to its own log, because there is no console account yet to email and
 * a fixed default baked into the image would be worse. That makes the first
 * credential single-use by design — this is what enforces it.
 *
 * Rendered instead of the console, not over it: a dismissible dialog is a
 * dialog somebody dismisses, and the whole point is that the generated
 * password does not survive first sign-in.
 */
export function ForcePasswordChange({ email }: { email: string }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < 12;
  const ready = current && next.length >= 12 && next === confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/admin/me/password', {
        currentPassword: current,
        newPassword: next,
      });
      // The server revoked every session, this one included. Clearing the
      // tokens and reloading is the honest way back — anything else would be
      // holding a token the server no longer accepts.
      await signOut();
      window.location.href = '/sign-in';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change it');
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
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            This account was set up with a password the server generated and
            wrote to its log. Replace it before going any further.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{email}</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current">Current password</Label>
            <Input
              id="current"
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>

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
            <p
              className={
                tooShort ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'
              }
            >
              At least 12 characters.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm new password</Label>
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
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={busy || !ready}>
            {busy ? 'Saving…' : 'Set password and sign in again'}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Every other session signed in as this account will be ended.
        </p>
      </div>
    </main>
  );
}
