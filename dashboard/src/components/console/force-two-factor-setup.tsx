'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { signOut } from '@/api/client';
import { TwoFactorSetup } from './two-factor';

/**
 * Holds the console until an account whose role requires two-factor has it.
 *
 * Rendered instead of the console, like the forced password change, and for
 * the same reason: the API refuses everything else until this is done, so a
 * console behind a dismissible prompt would be a console of errors.
 */
export function ForceTwoFactorSetup({ email, roleLabel }: { email: string; roleLabel: string }) {
  const qc = useQueryClient();

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-4 grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="size-5" />
          </span>
          <h1 className="text-xl font-bold tracking-tight">Set up two-factor sign-in</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            The {roleLabel} role signs in with a code from an authenticator app as well as a
            password. It takes a minute.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{email}</p>
        </div>

        {/* Once the recovery codes are saved, re-reading `me` lifts this screen. */}
        <TwoFactorSetup onDone={() => void qc.invalidateQueries({ queryKey: ['me'] })} />

        <button
          type="button"
          onClick={async () => {
            await signOut();
            window.location.href = '/sign-in';
          }}
          className="mt-6 block w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          Sign out and do this later
        </button>
      </div>
    </main>
  );
}
