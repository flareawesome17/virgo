'use client';

import { useState } from 'react';
import { Globe, KeyRound, Laptop, Loader2, MonitorSmartphone, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Screen } from '@/components/app-shell';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ChangePasswordDialog } from '@/components/settings/sign-in-dialogs';
import { ApiError, type DeviceSession } from '@/api';
import { useSessions, useSignOutOtherSessions, useSignOutSession } from '@/hooks/useSessions';

function iconFor(session: DeviceSession) {
  if (session.client === 'ios' || session.client === 'android') return Smartphone;
  if (session.client === 'desktop') return Laptop;
  return Globe;
}

/**
 * "Active now" for anything used in the last quarter hour — a session in use
 * refreshes every 15 minutes, so that is as fine as the server can tell.
 */
function lastActive(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = (now - then) / 60_000;
  if (minutes < 16) return 'Active now';
  if (minutes < 60) return `Active ${Math.round(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `Active ${Math.round(hours)}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'Active yesterday' : `Active ${days} days ago`;
}

function signedInOn(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function problem(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Check your connection and try again.';
}

/**
 * Every device signed in to your account, and a Sign out for each.
 *
 * Before this the only way to end a session you did not recognise was to
 * change your password, which ends all of them — and nothing showed you there
 * was one to end. The desktop app shows this page too, and lists itself as
 * "Virgo desktop app" rather than the Edge its window is.
 */
export default function DevicesPage() {
  const { sessions, isLoading, loadFailed, refetch } = useSessions();
  const signOut = useSignOutSession();
  const signOutOthers = useSignOutOtherSessions();
  /**
   * The device whose Sign out was pressed, or 'others' for all of them. Kept
   * after the dialog closes, so its words do not change while it fades out.
   */
  const [confirming, setConfirming] = useState<DeviceSession | 'others' | null>(null);
  const [asking, setAsking] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const others = sessions.filter((s) => !s.current);
  const busy = signOut.isPending || signOutOthers.isPending;

  const ask = (target: DeviceSession | 'others') => {
    setConfirming(target);
    setAsking(true);
  };

  const confirm = () => {
    const target = confirming;
    setAsking(false);
    if (target === 'others') {
      signOutOthers.mutate(undefined, {
        onSuccess: ({ signedOut }) =>
          toast.success(
            signedOut === 1 ? '1 device signed out' : `${signedOut} devices signed out`,
          ),
        onError: (err) => toast.error('Could not sign them out', { description: problem(err) }),
      });
    } else if (target) {
      signOut.mutate(target.id, {
        onSuccess: () => toast.success(`${target.device} signed out`),
        onError: (err) => toast.error('Could not sign it out', { description: problem(err) }),
      });
    }
  };

  return (
    <Screen title="Devices">
      <PageHeader
        title="Devices"
        description="Everywhere your account is signed in. We email you when a new device signs in."
      />

      <div className="flex w-full max-w-3xl flex-col gap-4">
        {isLoading && sessions.length === 0 ? (
          <ListSkeleton rows={3} />
        ) : loadFailed && sessions.length === 0 ? (
          <ErrorState message="Could not load your devices." onRetry={() => refetch()} />
        ) : sessions.length === 0 ? (
          <Card>
            <EmptyState
              icon={MonitorSmartphone}
              title="Nothing to show yet"
              description="Reload in a minute to see the devices signed in to your account."
            />
          </Card>
        ) : (
          <Card className="py-0">
            <CardContent className="p-0">
              <ul>
                {sessions.map((session) => {
                  const Icon = iconFor(session);
                  const ending = signOut.isPending && signOut.variables === session.id;
                  return (
                    <li
                      key={session.id}
                      className="flex items-center gap-3 border-b px-5 py-3.5 last:border-0"
                    >
                      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10">
                        <Icon className="size-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-sm font-semibold">
                          <span className="truncate">{session.device}</span>
                          {session.current && (
                            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                              This device
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {session.app}
                          {' · '}
                          {session.current
                            ? `Signed in ${signedInOn(session.signedInAt)}`
                            : `${lastActive(session.lastActiveAt)} · Signed in ${signedInOn(session.signedInAt)}`}
                        </p>
                      </div>
                      {!session.current && (
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={`Sign out ${session.device}, ${session.app}`}
                          disabled={busy}
                          onClick={() => ask(session)}
                        >
                          {ending && <Loader2 className="size-3.5 animate-spin" />}
                          Sign out
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}

        {others.length > 0 && (
          <div>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => ask('others')}
            >
              {signOutOthers.isPending && <Loader2 className="size-4 animate-spin" />}
              Sign out all other devices
            </Button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setChangingPassword(true)}
          className="flex items-start gap-3 rounded-lg px-1 py-1 text-left text-xs leading-5 text-muted-foreground hover:text-foreground"
        >
          <KeyRound className="mt-0.5 size-4 shrink-0" />
          <span>
            Don’t recognise a device? Sign it out, then change your password: that signs out every
            device, this one included, and locks out anyone who knows the old one.
          </span>
        </button>
      </div>

      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming === 'others'
                ? 'Sign out every other device?'
                : `Sign out ${confirming?.device ?? 'this device'}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === 'others'
                ? 'Everything but this device will need your password to get back in.'
                : `${confirming?.app ?? 'It'} will need your password to get back in. If you don’t recognise it, change your password too.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={confirm}
            >
              {confirming === 'others' ? 'Sign out all' : 'Sign out'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ChangePasswordDialog open={changingPassword} onOpenChange={setChangingPassword} />
    </Screen>
  );
}
