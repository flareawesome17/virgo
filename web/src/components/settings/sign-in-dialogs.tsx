'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Loader2, MailCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useOpeningKey } from '@/lib/discard-guard';

/** The same floor and bcrypt ceiling the API enforces. */
const MIN_LENGTH = 8;
const MAX_LENGTH = 72;

/** Enough to catch a slip of the fingers. The server has the final say. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/*
 * Neither form asks before it is dismissed. All they hold is a password or
 * two, which is quicker to type again than to be asked about, and better not
 * kept: each opening starts empty.
 */

/**
 * Changing the password of a signed-in account, as the phone does.
 *
 * The server signs every other device out and hands this one a fresh session,
 * so nobody is sent to the sign-in page for doing the right thing.
 */
export function ChangePasswordDialog(props: DialogProps) {
  const opening = useOpeningKey(props.open);
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <ChangePasswordForm key={opening} onDone={() => props.onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');

  // Said before Save is pressed, so the only errors left for the server are
  // the ones it alone can know: a wrong current password, or a reused one.
  const problem = !next
    ? null
    : next.length < MIN_LENGTH
      ? `At least ${MIN_LENGTH} characters.`
      : next.length > MAX_LENGTH
        ? `At most ${MAX_LENGTH} characters.`
        : // Not while the second copy is still a correct start of the first.
          confirm && !next.startsWith(confirm)
          ? 'The two new passwords do not match.'
          : null;
  const ready = !!current && !!next && confirm === next && !problem;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready || changePassword.isPending) return;
    setError('');
    changePassword.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          toast.success('Password changed', {
            description: 'Any other phone or browser signed in to your account has been signed out.',
          });
          onDone();
        },
        onError: (err) => setError(err.message),
      },
    );
  };

  const field = (
    id: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: { placeholder: string; current?: boolean },
  ) => (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setError('');
        }}
        // Tells password managers which field is which: fill the saved one
        // into "current", offer to generate and save into "new".
        autoComplete={options.current ? 'current-password' : 'new-password'}
        placeholder={options.placeholder}
        maxLength={MAX_LENGTH + 1}
        autoFocus={options.current}
      />
    </div>
  );

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Change password</DialogTitle>
        <DialogDescription>
          Other phones and browsers signed in to your account will be signed out. This one stays
          signed in.
        </DialogDescription>
      </DialogHeader>

      {field('current-password', 'Current password', current, setCurrent, {
        placeholder: 'The password you use now',
        current: true,
      })}
      {field('new-password', 'New password', next, setNext, {
        placeholder: `At least ${MIN_LENGTH} characters`,
      })}
      {field('confirm-password', 'Confirm new password', confirm, setConfirm, {
        placeholder: 'Type it again',
      })}

      <div className="flex items-center justify-between gap-3 text-xs">
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide passwords' : 'Show passwords'}
          className="inline-flex items-center gap-1.5 font-semibold text-muted-foreground hover:text-foreground"
        >
          {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {visible ? 'Hide' : 'Show'}
        </button>
        {/* Signed in or not, the reset flow is by email and works the same. */}
        <Link href="/forgot-password" className="font-semibold text-primary hover:underline">
          Forgot your current password?
        </Link>
      </div>

      {(problem || error) && (
        <p role="alert" className="text-sm text-destructive">
          {error || problem}
        </p>
      )}

      <DialogFooter>
        <Button type="submit" disabled={!ready || changePassword.isPending}>
          {changePassword.isPending && <Loader2 className="size-4 animate-spin" />}
          {changePassword.isPending ? 'Changing…' : 'Change password'}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Moving the account to a new email address.
 *
 * Nothing changes here: the new address is sent a link, and the account moves
 * when it is opened. The old address is told, so somebody at an unlocked
 * computer cannot quietly take the account's inbox.
 */
export function ChangeEmailDialog(props: DialogProps) {
  const opening = useOpeningKey(props.open);
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <ChangeEmailForm key={opening} onDone={() => props.onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ChangeEmailForm({ onDone }: { onDone: () => void }) {
  const { profile, requestEmailChange } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);

  const trimmed = email.trim();
  const same = !!profile && trimmed.toLowerCase() === profile.email.toLowerCase();
  const problem = !trimmed
    ? null
    : same
      ? 'That is already your email address.'
      : !LOOKS_LIKE_EMAIL.test(trimmed)
        ? 'Check the address for a typo.'
        : null;
  const ready = !!trimmed && !!password && !problem;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready || requestEmailChange.isPending) return;
    setError('');
    requestEmailChange.mutate(
      { password, newEmail: trimmed },
      {
        onSuccess: (result) => {
          setSentTo(result.pendingEmail);
          setPassword('');
        },
        onError: (err) => setError(err.message),
      },
    );
  };

  if (sentTo) {
    return (
      <div className="grid gap-4">
        <DialogHeader>
          <div className="mb-1 grid size-11 place-items-center rounded-xl bg-primary/10">
            <MailCheck className="size-5 text-primary" />
          </div>
          <DialogTitle>Check your new inbox</DialogTitle>
          <DialogDescription>
            We sent a link to <span className="font-semibold text-foreground">{sentTo}</span>. Your
            account moves to that address when you open it. Until then, keep signing in with{' '}
            {profile?.email ?? 'your current address'}.
          </DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          The link lasts a day. Nothing there? Check spam, or choose Change again to send another.
        </p>
        <DialogFooter>
          <Button onClick={onDone}>Done</Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Change email</DialogTitle>
        <DialogDescription>
          You sign in with{' '}
          <span className="font-semibold text-foreground">{profile?.email ?? '—'}</span>. We will
          send a link to the new address, and let the current one know.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor="new-email">New email address</Label>
        <Input
          id="new-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError('');
          }}
          autoComplete="email"
          placeholder="you@example.com"
          autoFocus
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email-password">Your password</Label>
        <Input
          id="email-password"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError('');
          }}
          autoComplete="current-password"
          placeholder="To confirm it is you"
        />
      </div>

      {(problem || error) && (
        <p role="alert" className="text-sm text-destructive">
          {error || problem}
        </p>
      )}

      <DialogFooter>
        <Button type="submit" disabled={!ready || requestEmailChange.isPending}>
          {requestEmailChange.isPending && <Loader2 className="size-4 animate-spin" />}
          {requestEmailChange.isPending ? 'Sending link…' : 'Send confirmation link'}
        </Button>
      </DialogFooter>
    </form>
  );
}
