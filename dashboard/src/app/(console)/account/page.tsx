'use client';

import { useState } from 'react';
import { KeyRound, LogOut, ShieldCheck, ShieldOff } from 'lucide-react';
import { signOut } from '@/api/client';
import {
  useChangePassword,
  useDisableTwoFactor,
  useEndMyOtherSessions,
  useEndMySession,
  useMe,
  useMySecurity,
  useRegenerateRecoveryCodes,
} from '@/hooks/useConsole';
import {
  DataState,
  Panel,
  StatusDot,
  when,
} from '@/components/console/primitives';
import { RecoveryCodes, TwoFactorSetup } from '@/components/console/two-factor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { describeAgent } from '@/lib/user-agent';
import { LOGIN_OUTCOME } from '@/components/console/login-outcome';

/**
 * Your own account: password, two-factor, where you are signed in, and your
 * recent sign-ins. Reachable by every role — it is about you, not the platform.
 */
export default function AccountPage() {
  const { me } = useMe();
  const { data, isLoading, isError, refetch } = useMySecurity();

  return (
    <>
      <header className="mb-5 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary">
          {me?.name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">{me?.name}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {me?.email} · {me?.roleLabel}
          </p>
        </div>
      </header>

      <DataState isLoading={isLoading} isError={isError} isEmpty={false} onRetry={() => void refetch()}>
        {data && me && (
          <div className="grid gap-4 lg:grid-cols-2">
            <TwoFactorPanel
              enabled={data.twoFactorEnabled}
              codesLeft={data.recoveryCodesLeft}
              required={me.twoFactorRequired}
            />
            <PasswordPanel />

            <Panel
              title="Where you are signed in"
              className="lg:col-span-2"
              bodyClassName="p-0"
              action={<EndOthers count={data.sessions.length - 1} />}
            >
              <ul className="divide-y">
                {data.sessions.map((s) => (
                  <SessionItem key={s.id} session={s} current={s.id === data.currentSessionId} />
                ))}
              </ul>
            </Panel>

            <Panel title="Your recent sign-ins" className="lg:col-span-2" bodyClassName="p-0">
              {data.logins.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">None recorded yet.</p>
              ) : (
                <ul className="divide-y">
                  {data.logins.map((l) => {
                    const o = LOGIN_OUTCOME[l.outcome];
                    return (
                      <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                        <StatusDot tone={o.tone}>{o.label}</StatusDot>
                        <span className="text-muted-foreground">{describeAgent(l.user_agent)}</span>
                        <span className="font-mono text-xs text-muted-foreground">{l.ip ?? '—'}</span>
                        <span className="ml-auto text-xs text-muted-foreground" title={new Date(l.created_at).toLocaleString()}>
                          {when(l.created_at)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>
        )}
      </DataState>
    </>
  );
}

function TwoFactorPanel({
  enabled,
  codesLeft,
  required,
}: {
  enabled: boolean;
  codesLeft: number;
  required: boolean;
}) {
  const [setup, setSetup] = useState(false);
  const [disable, setDisable] = useState(false);
  const [regenerate, setRegenerate] = useState(false);

  return (
    <Panel title="Two-factor sign-in" bodyClassName="space-y-4">
      <div className="flex items-start gap-3">
        {enabled ? (
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" />
        ) : (
          <ShieldOff className="mt-0.5 size-5 shrink-0 text-warning" />
        )}
        <div className="min-w-0 text-sm">
          <p className="font-medium">{enabled ? 'On' : 'Off'}</p>
          <p className="mt-0.5 text-muted-foreground">
            {enabled
              ? `Signing in asks for a code from your authenticator app. ${codesLeft} of 10 recovery codes left.`
              : 'Signing in needs only your password. Turn this on so a leaked password is not enough.'}
          </p>
        </div>
      </div>

      {enabled && codesLeft <= 3 && (
        <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
          You are running low on recovery codes. Make new ones before you need them.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {enabled ? (
          <>
            <Button size="sm" variant="outline" onClick={() => setRegenerate(true)}>
              New recovery codes
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDisable(true)}>
              Turn off
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => setSetup(true)}>
            Turn on two-factor
          </Button>
        )}
      </div>

      <Dialog open={setup} onOpenChange={setSetup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Turn on two-factor</DialogTitle>
          </DialogHeader>
          {setup && <TwoFactorSetup onDone={() => setSetup(false)} />}
        </DialogContent>
      </Dialog>

      <DisableDialog open={disable} onOpenChange={setDisable} required={required} />
      <RegenerateDialog open={regenerate} onOpenChange={setRegenerate} />
    </Panel>
  );
}

function DisableDialog({
  open,
  onOpenChange,
  required,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  required: boolean;
}) {
  const [password, setPassword] = useState('');
  const disable = useDisableTwoFactor();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Turn off two-factor?</DialogTitle>
          <DialogDescription>
            {required
              ? 'Your role requires two-factor, so you will be asked to set it up again straight away — this is how you move it to a new phone.'
              : 'Signing in will need only your password again. Your recovery codes stop working.'}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            disable.mutate(password, {
              onSuccess: () => {
                setPassword('');
                onOpenChange(false);
              },
            });
          }}
          className="space-y-3"
        >
          <div className="space-y-2">
            <Label htmlFor="disable-password">Your password</Label>
            <Input
              id="disable-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" variant="destructive" className="w-full" disabled={!password || disable.isPending}>
            Turn off
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RegenerateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const regenerate = useRegenerateRecoveryCodes();

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setCodes(null);
      setCode('');
      regenerate.reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New recovery codes</DialogTitle>
          {!codes && (
            <DialogDescription>
              Your current codes stop working. Enter a code from your authenticator app to continue.
            </DialogDescription>
          )}
        </DialogHeader>
        {codes ? (
          <RecoveryCodes codes={codes} onDone={() => close(false)} />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              regenerate.mutate(code.replace(/\s/g, ''), { onSuccess: (r) => setCodes(r.recoveryCodes) });
            }}
            className="space-y-3"
          >
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123 456"
              className="text-center font-mono text-lg tracking-[0.3em]"
            />
            {regenerate.isError && (
              <p role="alert" className="text-sm text-destructive">
                {regenerate.error.message}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={code.replace(/\s/g, '').length !== 6 || regenerate.isPending}>
              Make new codes
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PasswordPanel() {
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const ready = current && next.length >= 12 && next === confirm;

  return (
    <Panel title="Password">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate(
            { current, next },
            {
              // Every session was ended, this one included, so the honest
              // next step is the sign-in page.
              onSuccess: async () => {
                await signOut();
                window.location.href = '/sign-in';
              },
            },
          );
        }}
        className="space-y-3"
      >
        <div className="space-y-1.5">
          <Label htmlFor="pw-current">Current password</Label>
          <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pw-next">New password</Label>
            <Input id="pw-next" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw-confirm">Confirm</Label>
            <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {next && next.length < 12
            ? 'At least 12 characters.'
            : confirm && next !== confirm
              ? 'These do not match.'
              : 'Changing it signs you out everywhere, here included.'}
        </p>
        {change.isError && (
          <p role="alert" className="text-sm text-destructive">
            {change.error.message}
          </p>
        )}
        <Button type="submit" size="sm" disabled={!ready || change.isPending}>
          <KeyRound className="size-3.5" />
          Change password
        </Button>
      </form>
    </Panel>
  );
}

function SessionItem({
  session,
  current,
}: {
  session: { id: string; ip: string | null; user_agent: string | null; created_at: string; last_seen_at: string };
  current: boolean;
}) {
  const end = useEndMySession();
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {describeAgent(session.user_agent)}
          {current && (
            <Badge variant="secondary" className="ml-2">
              This browser
            </Badge>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="font-mono">{session.ip ?? 'no IP'}</span> · signed in {when(session.created_at)} ·
          active {when(session.last_seen_at)}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={end.isPending}
        onClick={() =>
          end.mutate(session.id, {
            onSuccess: async () => {
              if (current) {
                await signOut();
                window.location.href = '/sign-in';
              }
            },
          })
        }
      >
        <LogOut className="size-3.5" />
        {current ? 'Sign out' : 'Sign it out'}
      </Button>
    </li>
  );
}

function EndOthers({ count }: { count: number }) {
  const end = useEndMyOtherSessions();
  if (count < 1) return null;
  return (
    <Button size="xs" variant="ghost" disabled={end.isPending} onClick={() => end.mutate(undefined)}>
      Sign out the other {count}
    </Button>
  );
}
