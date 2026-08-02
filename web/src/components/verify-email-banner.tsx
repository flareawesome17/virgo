'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, MailWarning } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { authApi } from '@/api';
import { useAuth } from '@/hooks/useAuth';

/**
 * Tells an unverified account why nothing will save.
 *
 * The API blocks writes with a 403 the moment verification is enforced, and a
 * permission error with no explanation is the worst version of that. This says
 * what is wrong and offers the one action that fixes it.
 *
 * Dismissable, but it comes back on the next page load — the block is still
 * in force, so pretending otherwise would be a lie.
 */
export function VerifyEmailBanner() {
  const { profile } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  const resend = useMutation({
    mutationFn: () => authApi.resendVerification(),
    onSuccess: () =>
      toast.success('Link sent', {
        description: 'Check your inbox, and your spam folder.',
      }),
    onError: (err: Error) =>
      toast.error('Could not send the link', { description: err.message }),
  });

  // `emailVerified` is absent on responses from an older API; treating that as
  // verified keeps the banner from appearing for everyone during a rollout.
  if (!profile || profile.emailVerified !== false || dismissed) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-warning/30 bg-warning/10 px-6 py-2.5">
      <MailWarning className="size-4 shrink-0 text-warning" />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">Confirm your email to finish setting up.</span>{' '}
        <span className="text-muted-foreground">
          We sent a link to {profile.email}. Until then, changes will not save.
        </span>
      </p>
      <Button
        size="sm"
        variant="outline"
        disabled={resend.isPending}
        onClick={() => resend.mutate()}
      >
        {resend.isPending && <Loader2 className="size-3.5 animate-spin" />}
        Resend link
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
        Dismiss
      </Button>
    </div>
  );
}
