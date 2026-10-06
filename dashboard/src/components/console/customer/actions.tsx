'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { CustomerDetail } from '@/api/console';
import {
  useDeleteCustomer,
  useMarkVerified,
  useMe,
  useResetCustomerTwoFactor,
  useSendPasswordReset,
  useSendVerification,
  useSignOutCustomer,
} from '@/hooks/useConsole';
import { useRecordTabs } from '@/components/console/record-tabs';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

/**
 * What staff can do to an account, each behind the permission the API checks.
 *
 * The email actions send the customer exactly what the app would; the
 * security ones change the account and say so on its timeline. Nothing here
 * is offered to a role that would be refused.
 */
export function CustomerActions({ customer }: { customer: CustomerDetail }) {
  const { can } = useMe();
  const id = customer.user.id;
  const reset = useSendPasswordReset(id);
  const verifyEmail = useSendVerification(id);
  const markVerified = useMarkVerified(id);
  const resetTwoFactor = useResetCustomerTwoFactor(id);
  const signOut = useSignOutCustomer(id);
  const [deleting, setDeleting] = useState(false);

  const unverified = !customer.user.email_verified_at;
  const assist = can('users.assist');
  const security = can('users.security');
  const remove = can('users.delete');
  if (!assist && !security && !remove) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Actions
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {assist && (
            <>
              <DropdownMenuLabel className="caption">Email them</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => reset.mutate(undefined)}>
                Send a password reset link
              </DropdownMenuItem>
              {unverified && (
                <DropdownMenuItem onSelect={() => verifyEmail.mutate(undefined)}>
                  Send a new verification link
                </DropdownMenuItem>
              )}
            </>
          )}
          {security && (
            <>
              {assist && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="caption">Account security</DropdownMenuLabel>
              {unverified && (
                <DropdownMenuItem
                  onSelect={() => {
                    if (confirm(`Mark ${customer.user.email} as confirmed without the link? Do this only when you are sure the address is theirs.`)) {
                      markVerified.mutate(undefined);
                    }
                  }}
                >
                  Mark email as confirmed
                </DropdownMenuItem>
              )}
              {customer.user.two_factor && (
                <DropdownMenuItem
                  onSelect={() => {
                    if (confirm('Remove their two-factor? They are signed out everywhere and sign in next with the password alone. Do this only after confirming who they are.')) {
                      resetTwoFactor.mutate(undefined);
                    }
                  }}
                >
                  Remove two-factor
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() => {
                  if (confirm('Sign them out on every device? Nothing else changes; they can sign straight back in.')) {
                    signOut.mutate(undefined);
                  }
                }}
              >
                Sign out everywhere
              </DropdownMenuItem>
            </>
          )}
          {remove && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                Delete account…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {deleting && <DeleteDialog customer={customer} onClose={() => setDeleting(false)} />}
    </>
  );
}

/**
 * Deleting is the one thing here that cannot be undone, so the address has
 * to be typed back — the API checks it too.
 */
function DeleteDialog({ customer, onClose }: { customer: CustomerDetail; onClose: () => void }) {
  const router = useRouter();
  const { close } = useRecordTabs();
  const remove = useDeleteCustomer(customer.user.id);
  const [typed, setTyped] = useState('');
  const matches = typed.trim().toLowerCase() === customer.user.email.toLowerCase();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this account?</DialogTitle>
          <DialogDescription>
            Their plan is cancelled, every file is erased from storage, they are emailed, and the
            account is removed — {customer.storage.files.toLocaleString()} files across{' '}
            {customer.albums.length} albums. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-sm">
            Type <strong className="font-mono">{customer.user.email}</strong> to confirm.
          </p>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            disabled={!matches || remove.isPending}
            onClick={() =>
              remove.mutate(typed.trim(), {
                onSuccess: () => {
                  close(`/virgo-users/${customer.user.id}`);
                  router.replace('/virgo-users');
                },
              })
            }
          >
            {remove.isPending ? 'Deleting…' : 'Delete everything'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
