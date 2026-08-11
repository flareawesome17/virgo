'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MailCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { authApi } from '@/api';
import { Button } from '@/components/ui/button';

/**
 * "We sent you a link."
 *
 * The address comes through the query string rather than a session, because
 * there is no session at this point — that is the whole change. Without it the
 * page could only say "check your email" and leave somebody wondering which
 * address they typed.
 */
export function CheckInbox() {
  const email = useSearchParams().get('email') ?? '';
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const resend = async () => {
    if (!email) return;
    setSending(true);
    try {
      // The anonymous variant. The authenticated one is unreachable here by
      // definition: nobody can sign in until they have followed the link.
      await authApi.requestVerification(email);
      setSent(true);
      toast.success('Sent again', { description: `Another link is on its way to ${email}.` });
    } catch {
      // The server answers the same way whether or not the address exists, so
      // there is nothing useful to report beyond "try again".
      toast.error('Could not send', { description: 'Try again in a moment.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md px-6 py-12 text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10">
        <MailCheck className="size-7 text-primary" />
      </div>

      <h1 className="mt-6 text-xl font-bold tracking-tight">Check your inbox</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {email ? (
          <>
            We sent a confirmation link to{' '}
            <span className="font-medium text-foreground">{email}</span>. Open it
            to finish setting up your account.
          </>
        ) : (
          <>
            We sent you a confirmation link. Open it to finish setting up your
            account.
          </>
        )}
      </p>

      <p className="mt-4 rounded-lg bg-muted/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        You need to confirm the address before you can sign in. It keeps
        somebody else from signing up with an address that is yours.
      </p>

      {email && (
        <Button
          variant="outline"
          className="mt-6 w-full"
          onClick={resend}
          disabled={sending || sent}
        >
          {sending && <Loader2 className="size-4 animate-spin" />}
          {sent ? 'Link sent' : 'Send it again'}
        </Button>
      )}

      <p className="mt-6 text-sm text-muted-foreground">
        Already confirmed?{' '}
        <Link href="/sign-in" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
