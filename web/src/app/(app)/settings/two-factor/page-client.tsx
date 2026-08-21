'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCopy,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppShell, PageHeader } from '@/components/app-shell';
import { CenteredSpinner } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import {
  useBeginTwoFactorSecurityAction,
  useBeginTwoFactorSetup,
  useConfirmTwoFactorSetup,
  useDisableTwoFactor,
  useRegenerateTwoFactorRecoveryCodes,
  useResendTwoFactorCode,
  useTwoFactorStatus,
} from '@/hooks/useTwoFactor';
import type { TwoFactorSetup } from '@/api';

type SecurityAction = 'disable' | 'regenerate' | null;

function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.';
}

/**
 * Turning the second sign-in factor on and off.
 *
 * Every state-changing step is gated twice — the account password, then a
 * code emailed to the address on file — because the whole point of the
 * feature is that a stolen password is not enough on its own. That includes
 * turning it *off*, which is why disabling asks for a code as well.
 */
export default function TwoFactorSettingsPage() {
  const router = useRouter();
  const { user } = useAuth();

  const status = useTwoFactorStatus(!!user);
  const beginSetup = useBeginTwoFactorSetup();
  const confirmSetup = useConfirmTwoFactorSetup();
  const resend = useResendTwoFactorCode();
  const beginSecurityAction = useBeginTwoFactorSecurityAction();
  const disable = useDisableTwoFactor();
  const regenerate = useRegenerateTwoFactorRecoveryCodes();

  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [action, setAction] = useState<SecurityAction>(null);
  const [actionChallenge, setActionChallenge] = useState<TwoFactorSetup | null>(
    null,
  );
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const clearMessages = () => {
    setError('');
    setNotice('');
  };

  const start = (event: FormEvent) => {
    event.preventDefault();
    if (!password || beginSetup.isPending) return;
    clearMessages();
    beginSetup.mutate(password, {
      onSuccess: (result) => {
        setSetup(result);
        setPassword('');
      },
      onError: (err) => setError(messageOf(err)),
    });
  };

  const confirm = (event: FormEvent) => {
    event.preventDefault();
    if (!setup || !/^\d{6}$/.test(code) || confirmSetup.isPending) return;
    clearMessages();
    confirmSetup.mutate(
      { challengeToken: setup.challengeToken, code },
      {
        onSuccess: (result) => {
          setRecoveryCodes(result.recoveryCodes);
          setCode('');
          setSetup(null);
        },
        onError: (err) => setError(messageOf(err)),
      },
    );
  };

  const resendCode = (challengeToken: string) => {
    clearMessages();
    resend.mutate(challengeToken, {
      onSuccess: () => setNotice('A fresh code is on its way.'),
      onError: (err) => setError(messageOf(err)),
    });
  };

  const runSecurityAction = (event: FormEvent) => {
    event.preventDefault();
    if (!action) return;
    clearMessages();

    // First pass: prove the password, which gets a short-lived code emailed.
    if (!actionChallenge) {
      if (!password || beginSecurityAction.isPending) return;
      beginSecurityAction.mutate(
        { password, action: action === 'disable' ? 'disable' : 'recovery' },
        {
          onSuccess: (challenge) => {
            setActionChallenge(challenge);
            setPassword('');
          },
          onError: (err) => setError(messageOf(err)),
        },
      );
      return;
    }

    // Second pass: the emailed code, or a saved recovery code.
    const normalized = code.trim();
    const valid =
      /^\d{6}$/.test(normalized) ||
      normalized.replace(/[^A-Za-z2-7]/gi, '').length >= 10;
    if (!valid) return;
    const input = {
      challengeToken: actionChallenge.challengeToken,
      code: normalized,
    };

    if (action === 'disable') {
      if (disable.isPending) return;
      disable.mutate(input, {
        // Turning it off revokes every refresh token, this session's
        // included, so there is nothing left to stay on the page with.
        onSuccess: () => router.replace('/sign-in'),
        onError: (err) => setError(messageOf(err)),
      });
      return;
    }

    if (regenerate.isPending) return;
    regenerate.mutate(input, {
      onSuccess: (result) => {
        setRecoveryCodes(result.recoveryCodes);
        setAction(null);
        setActionChallenge(null);
        setPassword('');
        setCode('');
      },
      onError: (err) => setError(messageOf(err)),
    });
  };

  const chooseAction = (next: SecurityAction) => {
    setAction(next);
    setActionChallenge(null);
    setPassword('');
    setCode('');
    clearMessages();
  };

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      toast.success('Recovery codes copied');
    } catch {
      toast.error('Could not copy — select the codes and copy them by hand.');
    }
  };

  return (
    <AppShell title="Two-factor authentication">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Button asChild size="icon" variant="ghost" className="-ml-2 shrink-0">
              <Link href="/settings" aria-label="Back">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            Two-factor authentication
          </span>
        }
        description="Protect sign-in with a code sent to your email"
      />

      <div className="mx-auto w-full max-w-xl px-6 py-6">
        {status.isLoading ? (
          <CenteredSpinner />
        ) : recoveryCodes.length > 0 ? (
          <RecoveryCodes
            codes={recoveryCodes}
            onCopy={copyCodes}
            onDone={() => setRecoveryCodes([])}
          />
        ) : setup ? (
          <EmailSetup
            setup={setup}
            code={code}
            onCodeChange={(value) => {
              setCode(value.replace(/\D/g, '').slice(0, 6));
              clearMessages();
            }}
            onConfirm={confirm}
            onResend={() => resendCode(setup.challengeToken)}
            pending={confirmSetup.isPending}
            resending={resend.isPending}
          />
        ) : status.data?.enabled ? (
          <EnabledState
            email={status.data.email}
            remaining={status.data.recoveryCodesRemaining}
            enabledAt={status.data.enabledAt}
            action={action}
            challenge={actionChallenge}
            password={password}
            code={code}
            onAction={chooseAction}
            onPasswordChange={setPassword}
            onCodeChange={(value) => {
              setCode(value.toUpperCase());
              clearMessages();
            }}
            onSubmit={runSecurityAction}
            onResend={() =>
              actionChallenge && resendCode(actionChallenge.challengeToken)
            }
            pending={
              beginSecurityAction.isPending ||
              disable.isPending ||
              regenerate.isPending
            }
            resending={resend.isPending}
          />
        ) : (
          <DisabledState
            email={status.data?.email}
            password={password}
            onPasswordChange={(value) => {
              setPassword(value);
              clearMessages();
            }}
            onSubmit={start}
            pending={beginSetup.isPending}
          />
        )}

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-4 rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
            {notice}
          </p>
        )}
      </div>
    </AppShell>
  );
}

function DisabledState({
  email,
  password,
  onPasswordChange,
  onSubmit,
  pending,
}: {
  email?: string;
  password: string;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  pending: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid size-12 place-items-center rounded-2xl bg-primary/10">
          <ShieldCheck className="size-6 text-primary" />
        </div>
        <h2 className="mt-5 text-xl font-bold tracking-tight">
          Add a second sign-in step
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          After your password, Virgo will email a one-time code
          {email ? ` to ${email}` : ''}. No separate authenticator app is
          needed.
        </p>

        <form onSubmit={onSubmit} className="mt-6 grid gap-2">
          <Label htmlFor="password">Confirm your password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder="Your Virgo password"
            autoComplete="current-password"
          />
          <Button type="submit" disabled={!password || pending} className="mt-2">
            {pending && <Loader2 className="size-4 animate-spin" />}
            {pending ? 'Sending code…' : 'Send verification code'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function EmailSetup({
  setup,
  code,
  onCodeChange,
  onConfirm,
  onResend,
  pending,
  resending,
}: {
  setup: TwoFactorSetup;
  code: string;
  onCodeChange: (value: string) => void;
  onConfirm: (event: FormEvent) => void;
  onResend: () => void;
  pending: boolean;
  resending: boolean;
}) {
  const ready = /^\d{6}$/.test(code);
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid size-12 place-items-center rounded-2xl bg-primary/10">
          <Mail className="size-6 text-primary" />
        </div>
        <h2 className="mt-5 text-xl font-bold tracking-tight">
          Check your email
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          We sent a six-digit code to{' '}
          <span className="font-semibold text-foreground">{setup.email}</span>.
          Enter it below within ten minutes to finish setup.
        </p>

        <form onSubmit={onConfirm} className="mt-6 grid gap-2">
          <Label htmlFor="setup-code">Verification code</Label>
          <Input
            id="setup-code"
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            placeholder="000000"
            autoComplete="one-time-code"
            inputMode="numeric"
            autoFocus
            className="text-center text-xl font-semibold tracking-[0.5em]"
          />
          <button
            type="button"
            onClick={onResend}
            disabled={resending}
            className="justify-self-start py-1 text-sm font-semibold text-primary hover:underline disabled:opacity-60"
          >
            {resending ? 'Sending…' : 'Send a new code'}
          </button>
          <Button type="submit" disabled={!ready || pending} className="mt-1">
            {pending && <Loader2 className="size-4 animate-spin" />}
            {pending ? 'Verifying…' : 'Enable two-factor authentication'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function EnabledState({
  email,
  remaining,
  enabledAt,
  action,
  challenge,
  password,
  code,
  onAction,
  onPasswordChange,
  onCodeChange,
  onSubmit,
  onResend,
  pending,
  resending,
}: {
  email: string;
  remaining: number;
  enabledAt: string | null;
  action: SecurityAction;
  challenge: TwoFactorSetup | null;
  password: string;
  code: string;
  onAction: (value: SecurityAction) => void;
  onPasswordChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onResend: () => void;
  pending: boolean;
  resending: boolean;
}) {
  const codeReady =
    /^\d{6}$/.test(code.trim()) ||
    code.replace(/[^A-Za-z2-7]/gi, '').length >= 10;

  return (
    <div>
      <div className="flex gap-4 rounded-2xl bg-primary/10 p-5">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-card">
          <CheckCircle2 className="size-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Two-factor authentication is on</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Sign-in codes go to {email}. {remaining} recovery code
            {remaining === 1 ? '' : 's'} remaining
            {enabledAt
              ? ` · Enabled ${new Date(enabledAt).toLocaleDateString()}`
              : ''}
          </p>
        </div>
      </div>

      {!action ? (
        <Card className="mt-6 py-0">
          <CardContent className="p-0">
            <button
              onClick={() => onAction('regenerate')}
              className="flex w-full items-center gap-4 border-b px-5 py-4 text-left transition-colors hover:bg-accent/50"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                <RefreshCw className="size-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Replace recovery codes</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Invalidates every code you saved before
                </p>
              </div>
            </button>
            <button
              onClick={() => onAction('disable')}
              className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-accent/50"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-destructive/10">
                <ShieldOff className="size-4 text-destructive" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-destructive">
                  Turn off two-factor authentication
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  You will be signed out on every device
                </p>
              </div>
            </button>
          </CardContent>
        </Card>
      ) : (
        <Card className="mt-6">
          <CardContent className="pt-6">
            <h2 className="text-lg font-bold tracking-tight">
              {action === 'disable'
                ? 'Turn off protection'
                : 'Replace recovery codes'}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {challenge
                ? `Enter the six-digit code sent to ${challenge.email}, or use a saved recovery code.`
                : 'Confirm your password first. We’ll email a short-lived verification code.'}
            </p>

            <form onSubmit={onSubmit} className="mt-5 grid gap-2">
              {challenge ? (
                <>
                  <Label htmlFor="action-code">Email or recovery code</Label>
                  <Input
                    id="action-code"
                    value={code}
                    onChange={(e) => onCodeChange(e.target.value)}
                    placeholder="Email or recovery code"
                    autoComplete="one-time-code"
                    autoCorrect="off"
                    spellCheck={false}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={onResend}
                    disabled={resending}
                    className="justify-self-start py-1 text-sm font-semibold text-primary hover:underline disabled:opacity-60"
                  >
                    {resending ? 'Sending…' : 'Send a new code'}
                  </button>
                </>
              ) : (
                <>
                  <Label htmlFor="action-password">Virgo password</Label>
                  <Input
                    id="action-password"
                    type="password"
                    value={password}
                    onChange={(e) => onPasswordChange(e.target.value)}
                    placeholder="Virgo password"
                    autoComplete="current-password"
                    autoFocus
                  />
                </>
              )}

              <div className="mt-3 flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => onAction(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant={action === 'disable' ? 'destructive' : 'default'}
                  className="flex-[2]"
                  disabled={(challenge ? !codeReady : !password) || pending}
                >
                  {pending && <Loader2 className="size-4 animate-spin" />}
                  {pending
                    ? challenge
                      ? 'Checking…'
                      : 'Sending…'
                    : !challenge
                      ? 'Send verification code'
                      : action === 'disable'
                        ? 'Turn off and sign out'
                        : 'Replace codes'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RecoveryCodes({
  codes,
  onCopy,
  onDone,
}: {
  codes: string[];
  onCopy: () => void;
  onDone: () => void;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid size-12 place-items-center rounded-2xl bg-primary/10">
          <KeyRound className="size-6 text-primary" />
        </div>
        <h2 className="mt-5 text-xl font-bold tracking-tight">
          Save your recovery codes
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Each code works once if you cannot reach your email. Store them
          somewhere private; Virgo cannot show these codes again.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl bg-muted p-4">
          {codes.map((value) => (
            <code key={value} className="text-sm font-semibold tabular-nums">
              {value}
            </code>
          ))}
        </div>

        <Button variant="outline" className="mt-4 w-full" onClick={onCopy}>
          <ClipboardCopy className="size-4" />
          Copy all codes
        </Button>
        <Button className="mt-3 w-full" onClick={onDone}>
          I&rsquo;ve saved them
        </Button>
      </CardContent>
    </Card>
  );
}
